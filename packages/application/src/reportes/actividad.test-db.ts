/**
 * Movimientos: todo lo del periodo, contra l2control_test — B11-7 (M-37, U-5).
 *
 * Lo que fijan: un cobro, una entrada al parque y la apertura de la caja salen como movimientos, cada uno en su parte
 * del local, con su orden, su monto y el cliente de la cuenta; se encuentran por orden, por cliente, por cédula (sus
 * cifras), por monto y por persona; el cobro abre su venta entera; y lo pide quien ve la sucursal.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, cedulaDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
// La auditoría lleva la hora de la base: lo de esta prueba pasa hoy, en el día del local.
const AHORA = Date.now();
const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(AHORA);
const MIN = 60_000;

let local: LocalDePrueba;
let cajera: Contexto;
let supervisora: Contexto;
let orden = 0;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const actividad = async (extra: Record<string, unknown> = {}) => valor(await local.app.reportes.actividad(supervisora, { desde: DIA, hasta: DIA, ...extra }, AHORA + 60 * MIN));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Movimientos del día");
  const c = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const s = await crearPersona(local, { nombre: "Luisa Mora", role: "SUPERVISOR", pin: "5937" });
  cajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), c, "7391");
  supervisora = await contextoDe(local, await crearEquipo(local, "Oficina", true, false), s, "5937");
  const FONDO = { fondos: [{ currency: "USD", amount: usd("2000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  valor(await local.app.turnos.abrir(cajera, FONDO, undefined, AHORA - 10 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: DIA },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: DIA },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 20 * MIN));
  }
  valor(
    await local.app.tarifario.publicar(local.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  // Una entrada al parque de la familia de Rosa Díaz, y su cobro: $ 5,00 + IVA = $ 5,80.
  const t = "0416-5551234";
  const e = valor(
    await local.app.parque.entrar(
      cajera,
      {
        idempotencyKey: randomUUID(),
        paymentMode: "PREPAGO",
        entries: [{ wristbandCode: "PRUEBA-MOV-1", kid: { name: "Valentina" }, packageId: "pkg-60" }],
        guardian: { fullName: "Rosa Díaz", contactReference: t },
        guardianDocument: cedulaDePrueba(t),
      },
      AHORA,
    ),
  );
  orden = e.account.orderNumber!;
  valor(
    await local.app.cuentas.cobrar(
      cajera,
      { idempotencyKey: randomUUID(), accountId: e.account.id, version: e.account.version, lineIds: e.account.lines.map((l) => l.id), total: usd("580"), pagos: [{ method: "EFECTIVO_USD", amount: usd("580") }], destinoSobra: "VUELTO" },
      AHORA + MIN,
    ),
  );
});

after(async () => {
  await local.cerrar();
});

describe("Movimientos: todo lo del periodo (B11-7)", () => {
  test("la caja, el parque y la apertura del turno, cada uno en su parte, los más nuevos primero", async () => {
    const a = await actividad();
    const ques = a.movimientos.map((m) => [m.categoria, m.que]);
    assert.deepEqual(ques.slice(0, 3), [
      ["CAJA", "Cobró"],
      ["PARQUE", "Entrada al parque"],
      ["CAJA", "Abrió la caja"],
    ]);
    const cobro = a.movimientos[0]!;
    assert.equal(cobro.orden, orden);
    assert.deepEqual(cobro.monto, usd("580"));
    assert.equal(cobro.quien, "Marisol Prieto");
    assert.ok(cobro.ventaId, "el cobro abre su venta");
    assert.equal(a.porCategoria.find((c) => c.categoria === "PARQUE")!.cantidad, 1);
  });

  test("se busca por orden, cliente, cédula, monto y persona; y por parte del local", async () => {
    assert.ok((await actividad({ buscar: `#${String(orden).padStart(4, "0")}` })).movimientos.every((m) => m.orden === orden));
    const porCliente = await actividad({ buscar: "rosa diaz" });
    assert.ok(porCliente.total >= 2, "el cobro y la entrada son de su cuenta");
    assert.ok(porCliente.movimientos.every((m) => m.cliente?.nombre === "Rosa Díaz"));
    const cifras = cedulaDePrueba("0416-5551234").replace(/\D/g, "");
    assert.ok((await actividad({ buscar: cifras })).total >= 1, "por las cifras de la cédula");
    assert.deepEqual((await actividad({ buscar: "5,80" })).movimientos.map((m) => m.que), ["Cobró"]);
    assert.equal((await actividad({ buscar: "Marisol cobró" })).total, 1);
    const parque = await actividad({ categoria: "PARQUE" });
    assert.deepEqual(parque.movimientos.map((m) => m.que), ["Entrada al parque"]);
    assert.match(parque.movimientos[0]!.detalle, /PRUEBA-MOV-1/);
  });

  test("el cobro abre su venta entera, y lo pide quien ve la sucursal", async () => {
    const a = await actividad({ buscar: "cobró" });
    const v = valor(await local.app.reportes.venta(supervisora, { saleId: a.movimientos[0]!.ventaId }));
    assert.equal(v.orderNumber, orden);
    assert.equal(v.cashier, "Marisol Prieto");
    assert.equal(v.payments[0]!.methodCode, "EFECTIVO_USD");
    const r = await local.app.reportes.actividad(cajera, { desde: DIA, hasta: DIA }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
  });
});
