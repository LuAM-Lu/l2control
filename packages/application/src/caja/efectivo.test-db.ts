/**
 * Mover efectivo, contra l2control_test — B3-21 (M-38, W-8).
 *
 * Lo que fijan (el criterio): pagar el hielo desde la gaveta no deja diferencia en el arqueo; un adelanto sale en la
 * quincena de esa persona; por encima del tope pide el PIN de supervisión. Y además: todo retiro también lo pide; lo de
 * bolívares se mide en dólares a la tasa vigente; no sale más de lo que la gaveta tiene; cada uno imprime su
 * comprobante (el retiro, con la firma de quien recibe); el corte los lista aparte de las ventas; un reintento con la
 * misma clave no lo repite; un mesero no mueve efectivo; y la tabla es de solo agregar, aislada por tenant.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { esperadoEnGaveta, gavetaDe, libroDelTurno } from "./gaveta.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T17:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;
const QUINCENA = { desde: "2026-10-01", hasta: HOY };

let local: LocalDePrueba;
let otro: LocalDePrueba;
let cajera: Contexto;
let mesero: Contexto;
let supervisora: string;
let pedro: string;
let turno: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const ves = (minor: string) => ({ minor, currency: "VES" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const mover = (extra: Record<string, unknown>) => ({ idempotencyKey: randomUUID(), ...extra });
const hielo = (minor = "350") => mover({ tipo: "SALIDA", motivo: "COMPRAS", monto: usd(minor), nota: "Hielo para la barra" });
/** Sin el PIN de supervisión, no: lo dice. */
const pidePin = (r: { ok: boolean; motivo?: string; mensaje?: string }) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(r.mensaje ?? "", /autorización de un supervisor/);
};
const pinDe = (autorizadorId: string, pin: string, motivo = "Sobre el tope") => ({ autorizadorId, pin, motivo });
const gaveta = () => local.base.conTenant(local.sistema.tenantId, (tx) => esperadoEnGaveta(tx, turno));
const papelesDe = (cashMovementId: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { cashMovementId }, orderBy: { createdAt: "asc" }, select: { kind: true, title: true, copy: true, content: true } }));
const billetes = (minor: bigint, currency: "USD" | "VES") => [
  { denominacion: { minor: "100", currency }, cantidad: Number(minor / 100n) },
  { denominacion: { minor: "1", currency }, cantidad: Number(minor % 100n) },
];

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Mover efectivo");
  otro = await abrirLocalDePrueba(URL_APP, "Mover efectivo, otro local");
  await impresoraDePrueba(local);
  const marisol = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  pedro = await crearPersona(local, { nombre: "Pedro Salas", role: "MESERO", pin: "5173" });
  supervisora = await crearPersona(local, { nombre: "Luisa Mora", role: "SUPERVISOR", pin: "5937" });
  cajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), marisol, "7391");
  mesero = await contextoDe(local, await crearEquipo(local, "Tablet", true, false), pedro, "5173");
  valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "200.00", effectiveDate: HOY, valorVerificado: "200.00" }, AHORA - 60 * MIN));
  const FONDO = { fondos: [{ currency: "USD", amount: usd("5000") }, { currency: "VES", amount: ves("1000000") }] };
  turno = valor(await local.app.turnos.abrir(cajera, FONDO, undefined, AHORA - 30 * MIN)).id;
});

after(async () => {
  await local.cerrar();
  await otro.cerrar();
});

describe("mover efectivo (B3-21)", () => {
  test("pagar el hielo desde la gaveta no deja diferencia en el arqueo, e imprime su comprobante", async () => {
    const r = valor(await local.app.efectivo.mover(cajera, hielo(), undefined, AHORA));
    assert.equal(r.comprobanteNoImpreso, null);
    assert.equal(r.movimiento.numero, 1);
    assert.equal(r.movimiento.por, "Marisol Prieto");
    assert.equal(r.movimiento.autorizo, null, "dentro del tope, sin PIN");
    assert.deepEqual((await gaveta()).get("USD"), { amount: 5000n - 350n, currency: "USD" });
    // La cajera cuenta lo que hay: el fondo menos el hielo. Cuadra.
    const a = valor(await local.app.cortes.arquear(cajera, { turnoId: turno, conteos: [{ currency: "USD", billetes: billetes(4650n, "USD") }, { currency: "VES", billetes: billetes(1000000n, "VES") }] }, AHORA + MIN));
    assert.deepEqual(a.diferencias, [usd("0"), ves("0")]);
    const [papel] = await papelesDe(r.movimiento.id);
    assert.equal(papel!.kind, "MOVIMIENTO");
    assert.equal(papel!.title, "Compras para el local #0001");
    assert.match(JSON.stringify(papel!.content), /SALIDA DE EFECTIVO.*Hielo para la barra/);
  });

  test("un adelanto lo firma la persona con su PIN y sale en su quincena", async () => {
    const malo = await local.app.efectivo.mover(cajera, mover({ tipo: "SALIDA", motivo: "ADELANTO", monto: usd("1000"), nota: "Adelanto de quincena", persona: { staffUserId: pedro, pin: "0000" } }), undefined, AHORA + 2 * MIN);
    assert.equal(malo.ok, false, "con el PIN de otra persona, no");
    const r = valor(await local.app.efectivo.mover(cajera, mover({ tipo: "SALIDA", motivo: "ADELANTO", monto: usd("1000"), nota: "Adelanto de quincena", persona: { staffUserId: pedro, pin: "5173" } }), undefined, AHORA + 3 * MIN));
    assert.deepEqual(r.movimiento.persona, { id: pedro, nombre: "Pedro Salas" });
    const q = valor(await local.app.personal.vales(cajera, { ...QUINCENA, persona: { staffUserId: pedro, pin: "5173" } }, AHORA + 4 * MIN));
    assert.deepEqual(q.porPersona.map((p) => [p.persona.nombre, p.adelantado]), [["Pedro Salas", usd("1000")]]);
    assert.deepEqual(q.adelantos.map((a) => a.nota), ["Adelanto de quincena"]);
    assert.match(JSON.stringify((await papelesDe(r.movimiento.id))[0]!.content), /Pedro Salas.*Firma/);
  });

  test("por encima del tope pide el PIN de supervisión; todo retiro también, con quien lo recibe", async () => {
    const sinPin = await local.app.efectivo.mover(cajera, hielo("2001"), undefined, AHORA + 5 * MIN);
    pidePin(sinPin);
    const r = valor(await local.app.efectivo.mover(cajera, hielo("2001"), pinDe(supervisora, "5937"), AHORA + 6 * MIN));
    assert.equal(r.movimiento.autorizo, "Luisa Mora");

    const retiro = mover({ tipo: "RETIRO", motivo: "RESGUARDO", monto: usd("500"), nota: "A la caja fuerte", recibe: "Abigail Karam" });
    pidePin(await local.app.efectivo.mover(cajera, retiro, undefined, AHORA + 7 * MIN));
    const hecho = valor(await local.app.efectivo.mover(cajera, retiro, pinDe(supervisora, "5937", "Retiro a resguardo"), AHORA + 8 * MIN));
    assert.equal(hecho.movimiento.recibe, "Abigail Karam");
    assert.match(JSON.stringify((await papelesDe(hecho.movimiento.id))[0]!.content), /RETIRO DE EFECTIVO.*Abigail Karam.*Firma de quien recibe/);
    // Un reintento con la misma clave no lo repite.
    const otraVez = valor(await local.app.efectivo.mover(cajera, retiro, pinDe(supervisora, "5937", "Retiro a resguardo"), AHORA + 9 * MIN));
    assert.equal(otraVez.movimiento.id, hecho.movimiento.id);
  });

  test("lo de bolívares se mide en dólares a la tasa vigente; no sale más de lo que hay", async () => {
    // Bs. 3.000,00 a 200 = $ 15,00: dentro del tope.
    const r = valor(await local.app.efectivo.mover(cajera, mover({ tipo: "SALIDA", motivo: "PROVEEDOR", monto: ves("300000"), nota: "Gas del mes" }), undefined, AHORA + 10 * MIN));
    assert.deepEqual(r.movimiento.enDolares, usd("1500"));
    // Bs. 5.000,00 = $ 25,00: sobre el tope.
    const caro = await local.app.efectivo.mover(cajera, mover({ tipo: "SALIDA", motivo: "PROVEEDOR", monto: ves("500000"), nota: "Gas del mes" }), undefined, AHORA + 11 * MIN);
    pidePin(caro);
    const demasiado = await local.app.efectivo.mover(cajera, mover({ tipo: "SALIDA", motivo: "PROVEEDOR", monto: usd("90000"), nota: "Proveedor de carnes" }), pinDe(supervisora, "5937"), AHORA + 12 * MIN);
    assert.equal(!demasiado.ok && demasiado.motivo, "CONFLICTO");
    assert.match(!demasiado.ok ? demasiado.mensaje : "", /no hay dólares suficientes/);
    // El sencillo entra.
    valor(await local.app.efectivo.mover(cajera, mover({ tipo: "ENTRADA", motivo: "SENCILLO", monto: usd("1000"), nota: "Sencillo del banco" }), undefined, AHORA + 13 * MIN));
  });

  test("el corte los lista aparte de las ventas, y la gaveta los cuenta", async () => {
    const x = valor(await local.app.cortes.corteX(cajera, { turnoId: turno }, AHORA + 14 * MIN));
    assert.equal(x.ventas.cantidad, 0, "no es venta");
    assert.deepEqual(
      x.movimientos.map((m) => [m.numero, m.tipo, m.motivo]),
      [
        [1, "SALIDA", "COMPRAS"],
        [2, "SALIDA", "ADELANTO"],
        [3, "SALIDA", "COMPRAS"],
        [4, "RETIRO", "RESGUARDO"],
        [5, "SALIDA", "PROVEEDOR"],
        [6, "ENTRADA", "SENCILLO"],
      ],
    );
    assert.equal(x.gaveta, null, "la cajera no ve lo que espera la gaveta: el arqueo es a ciegas");
    const libro = await local.base.conTenant(local.sistema.tenantId, async (tx) => gavetaDe(await tx.cashShift.findUniqueOrThrow({ where: { id: turno }, include: { floats: true } }), await libroDelTurno(tx, turno)));
    const enDolares = libro.find((g) => g.currency === "USD")!;
    assert.deepEqual(enDolares.movido, usd(String(-350 - 1000 - 2001 - 500 + 1000)));
    assert.deepEqual(enDolares.esperado, usd(String(5000 - 350 - 1000 - 2001 - 500 + 1000)));
    assert.deepEqual(enDolares.entradas, usd("0"), "las entradas del cobro, sin lo movido");
    const delTurno = valor(await local.app.efectivo.delTurno(cajera, AHORA + 15 * MIN));
    assert.deepEqual(delTurno.entradas, [usd("1000")]);
    assert.deepEqual(delTurno.salidas, [usd("3851"), ves("300000")]);
  });

  test("reimprimir sale como copia; un mesero no mueve efectivo", async () => {
    const [m] = valor(await local.app.efectivo.delTurno(cajera, AHORA)).movimientos;
    valor(await local.app.efectivo.reimprimir(cajera, { movimientoId: m!.id }, AHORA + 16 * MIN));
    assert.deepEqual((await papelesDe(m!.id)).map((p) => p.copy), [false, true]);
    const r = await local.app.efectivo.mover(mesero, hielo(), undefined, AHORA + 17 * MIN);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
  });

  test("solo agregar y aislado por tenant", async () => {
    const [m] = valor(await local.app.efectivo.delTurno(cajera, AHORA)).movimientos;
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.cashMovement.update({ where: { id: m!.id }, data: { note: "Otra cosa" } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.cashMovement.delete({ where: { id: m!.id } })));
    assert.equal(await otro.base.conTenant(otro.sistema.tenantId, (tx) => tx.cashMovement.count()), 0, "otro local no los ve");
  });
});
