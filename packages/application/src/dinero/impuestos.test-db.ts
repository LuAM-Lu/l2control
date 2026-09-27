/**
 * Los impuestos en el servidor, de punta a punta contra l2control_test — B2-2, F3-06.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas): qué día es «hoy»
 * decide desde cuándo rige lo programado. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { ivaRulesOf, computeDocument, igtfAt, taxTimeline } from "@l2/domain-tax";
import { fromMajor, toMajor } from "@l2/domain-money";
import type { ImpuestosDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

const AHORA = Date.parse("2026-09-27T14:00:00.000Z"); // domingo, 10:00 am en Caracas
const MES_QUE_VIENE = "2026-10-01";
const MEDIANOCHE_1_OCT = "2026-10-01T04:00:00.000Z";

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinElevar: Contexto;
let ctxCajera: Contexto;

const iva = (code: "GENERAL" | "REDUCIDA", basisPoints: number, dia: string) => ({ impuesto: "IVA", code, basisPoints, dia });
const igtf = (basisPoints: number, dia: string) => ({ impuesto: "IGTF", code: null, basisPoints, dia });
const tramos = (t: ImpuestosDto, impuesto: string, code: string | null) =>
  t.vigencias.filter((v) => v.impuesto === impuesto && v.code === code).map((v) => [v.basisPoints, v.desde, v.hasta]);

/** El IVA de una entrada de $ 10,00 en el instante `at`, con el calendario de la base. */
const ivaDeUnTicket = (t: ImpuestosDto, at: number) => {
  const periodos = taxTimeline(
    t.vigencias.map((v) => ({
      id: v.id,
      kind: v.impuesto,
      code: v.code,
      basisPoints: v.basisPoints,
      effectiveFrom: Date.parse(v.desde),
      scheduledAt: Date.parse(v.programadaEl),
    })),
  );
  const lineas = [{ id: "l1", description: "Entrada", unitPrice: fromMajor("10.00", "USD"), quantity: 1n, taxCode: "GENERAL" as const }];
  return toMajor(computeDocument({ lines: lineas, rules: ivaRulesOf(periodos), at, currency: "USD" }).taxTotal);
};

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Impuestos");
  otro = await abrirLocalDePrueba(URL_APP, "Impuestos de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const oficina = await crearEquipo(local, "Oficina");
  ctxAdmin = await contextoElevado(local, oficina, { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinElevar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("un local nuevo", () => {
  test("no tiene impuestos, y no se inventan (la caja no cobrará)", async () => {
    const t = await local.app.impuestos.leer(local.sistema);
    assert.deepEqual(t.vigencias, []);
    assert.equal(t.zonaHoraria, "America/Caracas");
  });

  test("los primeros, programados para hoy, rigen desde este instante", async () => {
    for (const cmd of [iva("GENERAL", 1600, "2026-09-27"), iva("REDUCIDA", 800, "2026-09-27"), igtf(300, "2026-09-27")]) {
      const r = await local.app.impuestos.programar(local.sistema, cmd, AHORA);
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.valor.desde, new Date(AHORA).toISOString());
      assert.equal(r.valor.programadaPor, "Consola del servidor");
    }
    const t = await local.app.impuestos.leer(local.sistema);
    assert.equal(t.vigencias.length, 3);
    assert.equal(ivaDeUnTicket(t, AHORA), "1.60");
  });
});

describe("programar un cambio (F3-06)", () => {
  test("para el mes que viene: el ticket de hoy no cambia; ese día, sí", async () => {
    const r = await local.app.impuestos.programar(ctxAdmin, iva("GENERAL", 1500, MES_QUE_VIENE), AHORA + 60_000);
    assert.ok(r.ok, JSON.stringify(r));
    // Desde la medianoche del local, no desde la de UTC.
    assert.equal(r.valor.desde, MEDIANOCHE_1_OCT);
    assert.equal(r.valor.programadaPor, "Abigail Karam");
    const t = await local.app.impuestos.leer(local.sistema);
    assert.deepEqual(tramos(t, "IVA", "GENERAL"), [
      [1600, new Date(AHORA).toISOString(), MEDIANOCHE_1_OCT],
      [1500, MEDIANOCHE_1_OCT, null],
    ]);
    assert.equal(ivaDeUnTicket(t, AHORA + 3_600_000), "1.60");
    assert.equal(ivaDeUnTicket(t, Date.parse(MEDIANOCHE_1_OCT)), "1.50");
  });

  test("con fecha de hoy: rige desde ya, y lo cobrado esta mañana se queda como estaba", async () => {
    const despues = AHORA + 2 * 3_600_000;
    const r = await local.app.impuestos.programar(ctxAdmin, iva("REDUCIDA", 700, "2026-09-27"), despues);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.desde, new Date(despues).toISOString());
    const t = await local.app.impuestos.leer(local.sistema);
    assert.deepEqual(tramos(t, "IVA", "REDUCIDA"), [
      [800, new Date(AHORA).toISOString(), new Date(despues).toISOString()],
      [700, new Date(despues).toISOString(), null],
    ]);
  });

  test("corregir una programada es programar otra para el mismo día: manda la última y la otra queda en la base", async () => {
    const r = await local.app.impuestos.programar(ctxAdmin, iva("GENERAL", 1400, MES_QUE_VIENE), AHORA + 120_000);
    assert.ok(r.ok, JSON.stringify(r));
    const t = await local.app.impuestos.leer(local.sistema);
    assert.deepEqual(tramos(t, "IVA", "GENERAL").at(-1), [1400, MEDIANOCHE_1_OCT, null]);
    const filas = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.taxRate.count({ where: { tax: "IVA", code: "GENERAL" } }));
    assert.equal(filas, 3);
  });

  test("el IGTF tiene su propio calendario", async () => {
    const r = await local.app.impuestos.programar(ctxAdmin, igtf(200, MES_QUE_VIENE), AHORA + 180_000);
    assert.ok(r.ok, JSON.stringify(r));
    const t = await local.app.impuestos.leer(local.sistema);
    const periodos = taxTimeline(
      t.vigencias.map((v) => ({ id: v.id, kind: v.impuesto, code: v.code, basisPoints: v.basisPoints, effectiveFrom: Date.parse(v.desde), scheduledAt: Date.parse(v.programadaEl) })),
    );
    assert.equal(igtfAt(periodos, AHORA + 3_600_000), 300);
    assert.equal(igtfAt(periodos, Date.parse(MEDIANOCHE_1_OCT)), 200);
  });

  test("se audita con lo que regía y lo que regirá", async () => {
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxAdmin.quien!.userId! });
    const programados = asientos.filter((a) => a.action === "impuesto.programar" && a.outcome === "HECHO");
    assert.equal(programados.length, 4);
    const corregido = programados.find((a) => (a.after as { basisPoints?: number } | null)?.basisPoints === 1400)!;
    assert.deepEqual(corregido.after, { impuesto: "IVA", code: "GENERAL", basisPoints: 1400, desde: MEDIANOCHE_1_OCT, dia: MES_QUE_VIENE });
    // En ese instante regía la de 1500 que se programó antes para el mismo día.
    assert.equal((corregido.before as { basisPoints?: number } | null)?.basisPoints, 1500);
  });
});

describe("cancelar un cambio programado", () => {
  test("programar la alícuota vigente para ese día lo cancela: el tramo de hoy sigue abierto", async () => {
    const r = await local.app.impuestos.programar(ctxAdmin, igtf(300, MES_QUE_VIENE), AHORA + 200_000);
    assert.ok(r.ok, JSON.stringify(r));
    // Devuelve lo que rige desde ese día: el tramo de siempre.
    assert.deepEqual([r.valor.basisPoints, r.valor.desde, r.valor.hasta], [300, new Date(AHORA).toISOString(), null]);
    const t = await local.app.impuestos.leer(local.sistema);
    assert.deepEqual(tramos(t, "IGTF", null), [[300, new Date(AHORA).toISOString(), null]]);
  });

  test("programar lo que ya rige no cambia nada: se rechaza y no se guarda", async () => {
    const antes = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.taxRate.count());
    const r = await local.app.impuestos.programar(ctxAdmin, igtf(300, MES_QUE_VIENE), AHORA + 210_000);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.equal(!r.ok && r.problemas?.[0]?.path[0], "basisPoints");
    assert.equal(await local.base.conTenant(local.sistema.tenantId, (tx) => tx.taxRate.count()), antes);
  });
});

describe("lo que no se puede", () => {
  test("hacia atrás no se programa: lo vendido se queda con su alícuota", async () => {
    const antes = await local.app.impuestos.leer(local.sistema);
    const r = await local.app.impuestos.programar(ctxAdmin, iva("GENERAL", 1200, "2026-09-26"), AHORA + 240_000);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.deepEqual(await local.app.impuestos.leer(local.sistema), antes);
  });

  test("más allá de un año, tampoco", async () => {
    const r = await local.app.impuestos.programar(ctxAdmin, iva("GENERAL", 1200, "2027-09-29"), AHORA + 240_000);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("el navegador no dice quién ni desde qué instante (ADR-017)", async () => {
    const r = await local.app.impuestos.programar(ctxAdmin, { ...iva("GENERAL", 1200, MES_QUE_VIENE), por: "Otra persona" }, AHORA + 240_000);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("administración sin confirmar identidad: se le pide la elevación", async () => {
    const r = await local.app.impuestos.programar(ctxAdminSinElevar, iva("GENERAL", 1200, MES_QUE_VIENE), AHORA + 240_000);
    assert.equal(!r.ok && r.motivo, "ELEVACION_REQUERIDA");
  });

  test("quien cobra no programa impuestos, y el intento queda en la auditoría", async () => {
    const r = await local.app.impuestos.programar(ctxCajera, iva("GENERAL", 1200, MES_QUE_VIENE), AHORA + 240_000);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxCajera.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "impuesto.programar" && a.outcome === "NEGADO"));
  });

  test("otro local no ve los impuestos de este", async () => {
    assert.deepEqual((await otro.app.impuestos.leer(otro.sistema)).vigencias, []);
  });
});
