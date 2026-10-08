/**
 * El informe de las deudas de clientes, contra l2control_test — B11-4 (M-33).
 *
 * Lo que fijan: el resumen del periodo (lo que quedó, lo recuperado, lo perdido y lo pendiente al terminar); por mesero,
 * atribuido al que sentó al cliente (en el mostrador, la cajera); por quien autorizó (las que dejó en deuda y las que dio
 * por perdidas); la historia de cada deuda, de la mesa al desenlace; el resumen en el informe de ventas; permiso y
 * aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, FamilyAccountDto, InformeDeDeudasDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, clienteDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Jueves 8 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-08T17:00:00.000Z");
const HOY = "2026-10-08";
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let mesero: Contexto;
let cajera: Contexto;
let admin: Contexto;
let supervisor: string;
let adminId: string;
let tequenos: string;
let informe: InformeDeDeudasDto;

const conSupervisor = (motivo = "Se fue con el local lleno") => ({ autorizadorId: supervisor, pin: "5937", motivo });
const conAdmin = (motivo = "No volvió") => ({ autorizadorId: adminId, pin: "4826", motivo });

async function mesaConPedido(tableId: string, nombre: string, ahora: number): Promise<FamilyAccountDto> {
  await sentarDePrueba(l, mesero, tableId, ahora - 30 * MIN, { nombre, comensales: 3 });
  return valor(await l.app.pedidos.enviar(mesero, { pedidoId: randomUUID(), tableId, lineas: [{ productId: tequenos, cantidad: 2, precioMinor: "450" }] }, ahora - 20 * MIN)).cuenta;
}

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba informe de deudas");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba informe de deudas B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  supervisor = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  adminId = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  admin = await contextoDe(l, await crearEquipo(l, "Oficina"), adminId, "4826");
  await planoDePrueba(l, 4);
  await impresoraDePrueba(l);
  valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 3 * 60 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 3 * 60 * MIN));
  }
  const c: CatalogoDto = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Tequeños", categoria: "Carta", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "450" } }, AHORA - 3 * 60 * MIN),
  );
  tequenos = c.productos.find((p) => p.nombre === "Tequeños")!.id;
  valor(
    await l.app.turnos.abrir(cajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 3 * 60 * MIN),
  );

  // Tres deudas: dos de mesas que sentó Pedro y una venta del mostrador de Marisol. Una se cobra; otra se pierde.
  const m1 = await mesaConPedido("mesa-1", "Prueba Informe María", AHORA - 60 * MIN);
  const d1 = valor(await l.app.deudas.marcar(cajera, { idempotencyKey: randomUUID(), accountId: m1.id, version: m1.version, detalle: "Mesa junto a la puerta" }, conSupervisor(), AHORA - 50 * MIN)).deuda;
  const m2 = await mesaConPedido("mesa-2", "Prueba Informe José", AHORA - 40 * MIN);
  valor(await l.app.deudas.marcar(cajera, { idempotencyKey: randomUUID(), accountId: m2.id, version: m2.version }, conSupervisor(), AHORA - 35 * MIN));
  const venta = valor(
    await l.app.cuentas.guardar(
      cajera,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mostrador",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(AHORA).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [{ id: randomUUID(), concept: "Tequeños", kind: "RESTAURANTE", amount: usd("450"), paid: false, productId: tequenos, taxCode: "GENERAL" }],
        },
      },
      AHORA - 30 * MIN,
    ),
  );
  const d3 = valor(await l.app.deudas.marcar(cajera, { idempotencyKey: randomUUID(), accountId: venta.id, version: venta.version, cliente: clienteDePrueba("Prueba Informe Ana") }, conSupervisor(), AHORA - 25 * MIN)).deuda;
  // María vuelve y paga; la de Ana se da por perdida.
  const cobro = valor(await l.app.deudas.cobrar(cajera, { idempotencyKey: randomUUID(), deudaId: d1.id }, AHORA - 10 * MIN));
  valor(
    await l.app.cuentas.cobrar(
      cajera,
      { idempotencyKey: randomUUID(), accountId: cobro.id, version: cobro.version, lineIds: cobro.lines.map((x) => x.id), total: usd("1044"), pagos: [{ method: "EFECTIVO_USD", amount: usd("1100") }], destinoSobra: "VUELTO" },
      AHORA - 9 * MIN,
    ),
  );
  valor(await l.app.deudas.perder(admin, { idempotencyKey: randomUUID(), deudaId: d3.id, motivo: "No volvió" }, conAdmin(), AHORA - 5 * MIN));
  informe = valor(await l.app.reportes.deudas(admin, { desde: HOY, hasta: HOY }, AHORA));
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("el informe de deudas (B11-4)", () => {
  test("el resumen: lo que quedó, lo recuperado, lo perdido y lo pendiente al terminar", () => {
    assert.deepEqual(informe.resumen, {
      quedaron: { cantidad: 3, monto: usd("2610") },
      recuperado: { cantidad: 1, monto: usd("1044") },
      perdido: { cantidad: 1, monto: usd("522") },
      pendienteAlTerminar: { cantidad: 1, monto: usd("1044") },
    });
    assert.equal(informe.encabezado.generadoPor, "Abigail Karam");
  });

  test("por mesero: al que sentó al cliente; en el mostrador, la cajera", () => {
    assert.deepEqual(
      informe.porMesero.map((m) => [m.nombre, m.deudas, m.monto.minor, m.cobradas, m.perdidas, m.pendientes]),
      [
        ["Pedro Díaz", 2, "2088", 1, 0, 1],
        ["Marisol Prieto", 1, "522", 0, 1, 0],
      ],
    );
  });

  test("por quien autorizó: las que dejó en deuda y las que dio por perdidas", () => {
    assert.deepEqual(
      informe.porAutorizador.map((a) => [a.nombre, a.marcadas, a.monto.minor, a.perdidas]),
      [
        ["Luis Guerrero", 3, "2610", 0],
        ["Abigail Karam", 0, "0", 1],
      ],
    );
  });

  test("cada deuda con su historia, de la mesa al desenlace", () => {
    const maria = informe.deudas.find((d) => d.cliente.nombre === "Prueba Informe María")!;
    assert.equal(maria.estado, "COBRADA");
    assert.equal(maria.lugar, "Mesa 1");
    assert.ok(maria.cliente.cedula.startsWith("V-"), "con su cédula completa");
    assert.deepEqual(
      maria.historia.map((p) => [p.que, p.quien]),
      [
        ["SENTADO", "Pedro Díaz"],
        ["PEDIDO", "Pedro Díaz"],
        ["SE_FUE", "Marisol Prieto"],
        ["EN_COBRO", "Marisol Prieto"],
        ["COBRADA", "Marisol Prieto"],
      ],
    );
    assert.equal(maria.historia[0]!.detalle, "Mesa 1 · 3 personas");
    assert.match(maria.historia[1]!.detalle, /^Comanda #\d{4}: 2 × Tequeños$/);
    assert.deepEqual(maria.historia[1]!.monto, usd("900"), "lo que valía el pedido");
    assert.equal(maria.historia[2]!.detalle, "autorizó Luis Guerrero · Mesa junto a la puerta");
    const cobrada = maria.historia[4]!;
    assert.match(cobrada.detalle, /^Cobrada en la cuenta #\d{4} · turno de Marisol Prieto en Caja$/);
    assert.deepEqual(cobrada.monto, usd("1044"));
    assert.deepEqual(
      cobrada.medios?.map((m) => m.monto),
      [usd("1100")],
      "con qué se cobró",
    );
    assert.equal(maria.diasPendiente, undefined);
    const jose = informe.deudas.find((d) => d.cliente.nombre === "Prueba Informe José")!;
    assert.equal(jose.estado, "PENDIENTE");
    assert.equal(jose.diasPendiente, 0, "se fue hoy");
    const ana = informe.deudas.find((d) => d.cliente.nombre === "Prueba Informe Ana")!;
    assert.deepEqual(
      ana.historia.map((p) => [p.que, p.quien, p.detalle]),
      [
        ["VENTA", "Marisol Prieto", "Venta del mostrador: 1 × Tequeños"],
        ["SE_FUE", "Marisol Prieto", "autorizó Luis Guerrero"],
        ["PERDIDA", "Abigail Karam", "No volvió"],
      ],
    );
  });

  test("otro día no tiene nada nuevo, pero dice lo pendiente al terminar", async () => {
    const manana = valor(await l.app.reportes.deudas(admin, { desde: "2026-10-09", hasta: "2026-10-09" }, AHORA + 24 * 60 * MIN));
    assert.deepEqual(manana.deudas, []);
    assert.equal(manana.resumen.quedaron.cantidad, 0);
    assert.deepEqual(manana.resumen.pendienteAlTerminar, { cantidad: 1, monto: usd("1044") });
    // Tres días después, la de José lleva tres días.
    const despues = valor(await l.app.reportes.deudas(admin, { desde: HOY, hasta: HOY }, AHORA + 3 * 24 * 60 * MIN));
    assert.equal(despues.deudas.find((d) => d.cliente.nombre === "Prueba Informe José")!.diasPendiente, 3);
  });

  test("el informe de ventas lo resume", async () => {
    const ventas = valor(await l.app.reportes.ventas(admin, { desde: HOY, hasta: HOY }, AHORA));
    assert.deepEqual(ventas.deudas, informe.resumen);
  });

  test("es de quien ve la sucursal; otro local no ve nada", async () => {
    const r = await l.app.reportes.deudas(cajera, { desde: HOY, hasta: HOY }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const ajeno = valor(await otro.app.reportes.deudas(otro.sistema, { desde: HOY, hasta: HOY }, AHORA));
    assert.deepEqual(ajeno.deudas, []);
    assert.equal(ajeno.resumen.quedaron.cantidad, 0);
  });
});
