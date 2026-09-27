/**
 * Los feriados bancarios en el servidor, contra l2control_test — B2-4, D-FER.
 *
 * El criterio del paso: un feriado entre semana sigue cobrando con la tasa del día hábil
 * anterior, sin carga manual. Con reloj fijo. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { rateOfDay } from "@l2/domain-rates";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Martes 13 de octubre de 2026 (feriado de prueba), 10:00 am en Caracas. */
const EN_EL_FERIADO = Date.parse("2026-10-13T14:00:00.000Z");
const FERIADO = "2026-10-13";

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinElevar: Contexto;
let ctxCajera: Contexto;
let registrado: string;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Feriados");
  otro = await abrirLocalDePrueba(URL_APP, "Feriados de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinElevar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("registrar y retirar feriados", () => {
  test("un local sin feriados no tiene ninguno (y no se inventan)", async () => {
    assert.deepEqual((await local.app.feriados.listar(local.sistema)).feriados, []);
  });

  test("administración registra un feriado entre semana, a su nombre", async () => {
    const r = await local.app.feriados.registrar(ctxAdmin, { dia: FERIADO, nombre: "Feriado de prueba" });
    assert.ok(r.ok, JSON.stringify(r));
    registrado = r.valor.id;
    assert.equal(r.valor.registradoPor, "Abigail Karam");
    assert.deepEqual((await local.app.feriados.listar(local.sistema)).feriados.map((f) => f.dia), [FERIADO]);
  });

  test("un sábado no, y el mismo día dos veces tampoco", async () => {
    const sabado = await local.app.feriados.registrar(ctxAdmin, { dia: "2026-10-17", nombre: "Sábado" });
    assert.equal(!sabado.ok && sabado.motivo, "INVALIDO");
    const repetido = await local.app.feriados.registrar(ctxAdmin, { dia: FERIADO, nombre: "Otra vez" });
    assert.equal(!repetido.ok && repetido.motivo, "CONFLICTO");
  });

  test("pide confirmar identidad, y quien cobra no lo hace (queda en la auditoría)", async () => {
    const sin = await local.app.feriados.registrar(ctxAdminSinElevar, { dia: "2026-12-24", nombre: "Víspera" });
    assert.equal(!sin.ok && sin.motivo, "ELEVACION_REQUERIDA");
    const cajera = await local.app.feriados.registrar(ctxCajera, { dia: "2026-12-24", nombre: "Víspera" });
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxCajera.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "feriado.registrar" && a.outcome === "NEGADO"));
  });

  test("uno registrado por error se retira (no se borra), y se puede volver a registrar", async () => {
    const r = valor(await local.app.feriados.registrar(ctxAdmin, { dia: "2026-12-24", nombre: "Víspera de Navidad" }));
    valor(await local.app.feriados.retirar(ctxAdmin, { feriadoId: r.id }));
    assert.deepEqual((await local.app.feriados.listar(local.sistema)).feriados.map((f) => f.dia), [FERIADO]);
    const otraVez = await local.app.feriados.retirar(ctxAdmin, { feriadoId: r.id });
    assert.equal(!otraVez.ok && otraVez.motivo, "NO_DISPONIBLE");
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "bank_holiday", entityId: r.id });
    assert.deepEqual(asientos.map((a) => a.action).sort(), ["feriado.registrar", "feriado.retirar"]);
  });

  test("otro local no ve los feriados de este", async () => {
    assert.deepEqual((await otro.app.feriados.listar(otro.sistema)).feriados, []);
    const r = await otro.app.feriados.retirar(otro.sistema, { feriadoId: registrado });
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
  });
});

describe("el feriado y la tasa (criterio de B2-4)", () => {
  test("el feriado cobra con la tasa del día hábil anterior, sin carga manual", async () => {
    // La del lunes 12, aplicada.
    valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "860.00", effectiveDate: "2026-10-12", valorVerificado: "860.00" }, Date.parse("2026-10-12T14:00:00.000Z")));
    const h = await local.app.tasas.leer(local.sistema, EN_EL_FERIADO);
    assert.deepEqual(h.feriados, [FERIADO]);
    const registros = h.tasas.map((t) => ({ ...t, confirmed: t.confirmed }));
    assert.equal(rateOfDay(registros, "USD/VES", FERIADO, new Date(EN_EL_FERIADO).toISOString(), h.feriados)?.value, "860.00");
    // Sin el feriado registrado, el martes exigiría la suya.
    assert.equal(rateOfDay(registros, "USD/VES", FERIADO, new Date(EN_EL_FERIADO).toISOString()), null);
  });

  test("en el feriado no se avisa de que falta su tasa; la víspera se avisa por la del miércoles", async () => {
    const enElFeriado = await local.app.tasas.leer(local.sistema, Date.parse("2026-10-13T23:30:00.000Z"));
    assert.equal(enElFeriado.alertas.some((a) => a.tipo === "FALTA_SIGUIENTE"), false);
    const vispera = await local.app.tasas.leer(local.sistema, Date.parse("2026-10-12T23:30:00.000Z"));
    const aviso = vispera.alertas.find((a) => a.tipo === "FALTA_SIGUIENTE");
    assert.match(aviso?.mensaje ?? "", /14 de octubre/);
  });
});

function valor<T>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
}
