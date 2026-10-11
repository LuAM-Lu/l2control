/**
 * El fondo fijo, contra l2control_test — B3-22 (M-38, W-9).
 *
 * Lo que fijan (el criterio): con un fondo de $ 20, si al abrir se cuentan $ 15 la apertura lo dice y queda en la
 * auditoría. Y además: apagado de fábrica (se abre como siempre); es de un punto de cobro; encendido, la apertura se
 * cuenta por billete y lo contado tiene que ser el fondo; abierta con diferencia, queda a nombre de quien abre, en el
 * turno y como excepción del corte; lo que quedó es lo del último Z de esa caja (sin él, el fondo fijo); y el conteo es
 * de solo agregar, aislado por tenant.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T15:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let cajera: Contexto;
let cajera2: Contexto;
let caja1: string;
let tablet: string;
let marisol: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const ves = (minor: string) => ({ minor, currency: "VES" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const idDe = (credencial: string) => credencial.split(".")[1]!;
const fondo = (u: string, b: string) => ({ fondos: [{ currency: "USD", amount: usd(u) }, { currency: "VES", amount: ves(b) }] });
/** $ 15 en un billete de 10 y uno de 5; los bolívares, en cero. */
const conteo = (billetes: { den: string; n: number }[]) => [
  { currency: "USD", billetes: billetes.map((b) => ({ denominacion: usd(b.den), cantidad: b.n })) },
  { currency: "VES", billetes: [] },
];
const fijar = (deviceId: string, f: { minor: string; currency: "USD" | "VES" }[] | null) =>
  local.app.dispositivos.ordenar(local.sistema, { kind: "FONDO_FIJO", deviceId, fondo: f, reason: "Fondo fijo de la caja" });
const asientos = (action: string) => local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action }, orderBy: { occurredAt: "asc" } }));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "El fondo fijo");
  otro = await abrirLocalDePrueba(URL_APP, "El fondo fijo, otro local");
  marisol = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const pedro = await crearPersona(local, { nombre: "Pedro Salas", role: "CAJERO", pin: "5173" });
  const c1 = await crearEquipo(local, "Caja 1");
  const c2 = await crearEquipo(local, "Caja 2");
  const t = await crearEquipo(local, "Tablet", true, false);
  caja1 = idDe(c1);
  tablet = idDe(t);
  cajera = await contextoDe(local, c1, marisol, "7391");
  cajera2 = await contextoDe(local, c2, pedro, "5173");
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("el fondo fijo (B3-22)", () => {
  test("apagado de fábrica: la apertura es como siempre, con el fondo tecleado", async () => {
    assert.equal((await local.app.cortes.comprobarApertura(cajera2, AHORA)).fondoFijo, null);
    const t = valor(await local.app.turnos.abrir(cajera2, fondo("2000", "0"), undefined, AHORA));
    assert.equal(t.fondoFijo, null);
    assert.equal(t.apertura, null);
  });

  test("es de un punto de cobro; encendido, la apertura lo sabe", async () => {
    const r = await fijar(tablet, [usd("2000"), ves("0")]);
    assert.equal(!r.ok && r.motivo, "INVALIDO", "la tablet no es punto de cobro");
    const d = valor(await fijar(caja1, [usd("2000"), ves("0")]));
    assert.deepEqual(d.fondoFijo, [usd("2000"), ves("0")]);
    assert.deepEqual((await local.app.cortes.comprobarApertura(cajera, AHORA)).fondoFijo, [usd("2000"), ves("0")]);
    const [a] = await asientos("dispositivo.fondo_fijo");
    assert.deepEqual((a!.after as { fondoFijo: unknown }).fondoFijo, [usd("2000"), ves("0")]);
  });

  test("con un fondo de $ 20, si al abrir se cuentan $ 15 la apertura lo dice y queda en la auditoría", async () => {
    // Sin contar por billete, no; y lo contado tiene que ser el fondo.
    const sinConteo = await local.app.turnos.abrir(cajera, fondo("1500", "0"), undefined, AHORA);
    assert.equal(!sinConteo.ok && sinConteo.motivo, "INVALIDO");
    const noSuma = await local.app.turnos.abrir(cajera, { ...fondo("2000", "0"), conteo: conteo([{ den: "1000", n: 1 }, { den: "500", n: 1 }]) }, undefined, AHORA);
    assert.equal(!noSuma.ok && noSuma.motivo, "INVALIDO");

    const quince = { ...fondo("1500", "0"), conteo: conteo([{ den: "1000", n: 1 }, { den: "500", n: 1 }]) };
    const dice = await local.app.turnos.abrir(cajera, quince, undefined, AHORA);
    assert.equal(!dice.ok && dice.motivo, "CONFLICTO");
    assert.match(!dice.ok ? dice.mensaje : "", /^Falta \$ 5\.00 de lo que quedó en la gaveta/);
    assert.equal(await local.app.turnos.delEquipo(cajera), null, "todavía no se abrió");

    const t = valor(await local.app.turnos.abrir(cajera, { ...quince, aceptarDiferencia: true }, undefined, AHORA + MIN));
    assert.deepEqual(t.apertura, { contado: [usd("1500"), ves("0")], quedo: [usd("2000"), ves("0")], diferencias: [usd("-500"), ves("0")], cuadra: false, por: "Marisol Prieto" });
    assert.deepEqual(t.fondoFijo, [usd("2000"), ves("0")]);
    const abrir = (await asientos("turno.abrir")).find((a) => a.entityId === t.id)!;
    assert.equal(abrir.actorId, marisol, "a nombre de quien abre");
    assert.deepEqual((abrir.after as { apertura: unknown }).apertura, { cuadra: false, diferencias: [usd("-500"), ves("0")] });
    assert.equal((abrir.after as { detalle: string }).detalle, "Falta $ 5.00");
    // En el corte, como excepción de la apertura.
    const vista = valor(await local.app.cortes.vista(cajera, undefined, AHORA + 2 * MIN));
    const e = vista.excepciones.find((x) => x.tipo === "DIFERENCIA")!;
    assert.equal(e.detalle, "Apertura del turno Caja 1");
    assert.equal(e.usuario, "Marisol Prieto");
    assert.deepEqual(e.importe, usd("-500"));
  });

  test("lo que quedó es lo del último Z de esa caja: contado igual, abre sin preguntar", async () => {
    const t = (await local.app.turnos.delEquipo(cajera))!;
    const billetes = [
      { currency: "USD", billetes: [{ denominacion: usd("1000"), cantidad: 1 }, { denominacion: usd("500"), cantidad: 1 }] },
      { currency: "VES", billetes: [] },
    ];
    const a = valor(await local.app.cortes.arquear(cajera, { turnoId: t.id, conteos: billetes }, AHORA + 3 * MIN));
    valor(
      await local.app.cortes.corteZ(
        cajera,
        { idempotencyKey: randomUUID(), turnoId: t.id, arqueoId: a.id, cierre: "RELEVO", quedaEnGaveta: [usd("1500"), ves("0")] },
        { autorizadorId: marisol, pin: "7391", motivo: "Cierro el turno" },
        AHORA + 4 * MIN,
      ),
    );
    const otra = valor(await local.app.turnos.abrir(cajera, { ...fondo("1500", "0"), conteo: conteo([{ den: "1000", n: 1 }, { den: "500", n: 1 }]) }, undefined, AHORA + 5 * MIN));
    assert.deepEqual(otra.apertura?.quedo, [usd("1500"), ves("0")]);
    assert.equal(otra.apertura?.cuadra, true);
  });

  test("apagarlo, y el conteo de la apertura es de solo agregar y aislado por tenant", async () => {
    assert.equal(valor(await fijar(caja1, null)).fondoFijo, null);
    assert.equal((await local.app.cortes.comprobarApertura(cajera, AHORA)).fondoFijo, null);
    const [c] = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.shiftOpeningCount.findMany());
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.shiftOpeningCount.update({ where: { id: c!.id }, data: { matches: true } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.shiftOpeningCount.delete({ where: { id: c!.id } })));
    assert.equal(await otro.base.conTenant(otro.sistema.tenantId, (tx) => tx.shiftOpeningCount.count()), 0);
  });
});
