/**
 * Las deudas de clientes, contra l2control_test — B3-11 (M-33).
 *
 * Lo que fijan: «se fue sin pagar» pide la autorización de supervisión; la cuenta queda incobrable (fuera de la cola y
 * del cierre, la mesa libre) y la deuda, a nombre de su cliente, con el monto, quién lo sentó, quién la marcó y quién
 * lo autorizó; una venta sin cliente queda en deuda si se le ponen los datos; la de una familia del parque, no; buscar al
 * cliente avisa de lo que debe; cobrarla abre una cuenta del mostrador con lo que consumió (una sola) y, cobrada entera,
 * la deuda queda cobrada; darla por perdida es de administración, con su PIN, y no con un cobro abierto; solo agregar,
 * permisos y aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, DeudaDto, FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import {
  abrirLocalDePrueba,
  clienteDePrueba,
  contextoDe,
  crearEquipo,
  crearPersona,
  familiaDePrueba,
  impresoraDePrueba,
  planoDePrueba,
  sentarDePrueba,
  type LocalDePrueba,
} from "../para-pruebas.ts";

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
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string; problemas?: { path: unknown[]; message: string }[] };

let l: LocalDePrueba;
let otro: LocalDePrueba;
let mesero: Contexto;
let cajera: Contexto;
let monitora: Contexto;
let admin: Contexto;
let otroMesero: Contexto;
let supervisor: string;
let adminId: string;
let tequenos: string;

const conSupervisor = (motivo = "Se fue con el local lleno") => ({ autorizadorId: supervisor, pin: "5937", motivo });
const conAdmin = (motivo = "No volvió en tres meses") => ({ autorizadorId: adminId, pin: "4826", motivo });
const marcar = (ctx: Contexto, c: FamilyAccountDto, autorizacion?: unknown, extra: Record<string, unknown> = {}, idempotencyKey = randomUUID()) =>
  l.app.deudas.marcar(ctx, { idempotencyKey, accountId: c.id, version: c.version, ...extra }, autorizacion, AHORA);
const deuda = async (id: string): Promise<DeudaDto> => valor(await l.app.deudas.leer(cajera, AHORA)).deudas.find((d) => d.id === id)!;

/** Una mesa con su cliente y dos tequeños pedidos ($ 9,00 + IVA 16 % = $ 10,44). */
async function mesaConPedido(tableId: string, nombre?: string): Promise<FamilyAccountDto> {
  await sentarDePrueba(l, mesero, tableId, AHORA - 30 * MIN, nombre ? { nombre } : {});
  return valor(await l.app.pedidos.enviar(mesero, { pedidoId: randomUUID(), tableId, lineas: [{ productId: tequenos, cantidad: 2, precioMinor: "450" }] }, AHORA - 20 * MIN)).cuenta;
}

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba deudas");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba deudas B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  supervisor = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  adminId = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  admin = await contextoDe(l, await crearEquipo(l, "Oficina"), adminId, "4826");
  const jesus = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "MESERO", pin: "3175" });
  otroMesero = await contextoDe(otro, await crearEquipo(otro, "Salón"), jesus, "3175");

  await planoDePrueba(l, 6);
  await impresoraDePrueba(l);
  valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 60 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 60 * MIN));
  }
  const c: CatalogoDto = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Tequeños", categoria: "Carta", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "450" } }, AHORA - 60 * MIN),
  );
  tequenos = c.productos.find((p) => p.nombre === "Tequeños")!.id;
  valor(
    await l.app.turnos.abrir(
      cajera,
      { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] },
      undefined,
      AHORA - 60 * MIN,
    ),
  );
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("se fue sin pagar (B3-11)", () => {
  let mesa: FamilyAccountDto;
  let primera: DeudaDto;

  test("sin la autorización de supervisión no se marca; un PIN malo, tampoco", async () => {
    mesa = await mesaConPedido("mesa-1", "Prueba Deudas María");
    assert.equal(rechazo(await marcar(cajera, mesa)).motivo, "NO_PERMITIDO");
    assert.equal(rechazo(await marcar(mesero, mesa)).motivo, "NO_PERMITIDO");
    assert.equal(rechazo(await marcar(cajera, mesa, { autorizadorId: supervisor, pin: "0000", motivo: "Se fue" })).ok, false);
    assert.equal((await l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebt.count())), 0);
  });

  test("con ella, la cuenta queda incobrable y la deuda a nombre de su cliente, con quién intervino", async () => {
    const clave = randomUUID();
    const { cuenta, deuda: d } = valor(await marcar(cajera, mesa, conSupervisor(), { detalle: "Mesa junto a la puerta" }, clave));
    primera = d;
    assert.equal(cuenta.status, "INCOBRABLE");
    assert.equal(d.estado, "PENDIENTE");
    assert.equal(d.cliente.nombre, "Prueba Deudas María");
    assert.equal(d.monto.minor, "1044", "dos tequeños de $ 4,50 más el IVA");
    assert.equal(d.lugar, "Mesa 1");
    assert.equal(d.sentadoPor, "Pedro Díaz");
    assert.equal(d.marcadaPor, "Marisol Prieto");
    assert.equal(d.autorizadaPor, "Luis Guerrero");
    assert.equal(d.detalle, "Mesa junto a la puerta");
    // Reenviar la misma clave devuelve lo mismo.
    const otraVez = valor(await marcar(cajera, mesa, conSupervisor(), {}, clave));
    assert.equal(otraVez.deuda.id, d.id);
    assert.equal(await l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebt.count()), 1);
  });

  test("la mesa queda libre y la cuenta, fuera de la cola y del cierre", async () => {
    const abiertas = valor(await l.app.cuentas.leer(cajera, AHORA)).cuentas.filter((c) => c.tableId === "mesa-1" && (c.status === "ABIERTA" || c.status === "POR_COBRAR"));
    assert.deepEqual(abiertas, []);
    const pendientes = valor(await l.app.cortes.pendientes(admin, undefined, AHORA)).cuentas.map((c) => c.id);
    assert.ok(!pendientes.includes(mesa.id));
    // Y se puede sentar a otro cliente en esa mesa.
    await sentarDePrueba(l, mesero, "mesa-1", AHORA + MIN);
  });

  test("el asiento dice quién autorizó y no lleva la cédula ni el teléfono", async () => {
    const a = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { entityId: mesa.id, action: "cuenta.deuda" } }));
    assert.equal(a.authorizedBy, supervisor);
    assert.equal(a.reason, "SE_FUE_SIN_PAGAR");
    const texto = JSON.stringify(a);
    assert.ok(!texto.includes(primera.cliente.cedula.replace(/\D/g, "")) && !texto.includes(primera.cliente.telefono.replace(/\D/g, "").slice(-7)), texto);
  });

  test("una venta sin cliente queda en deuda si se le ponen los datos; sin ellos, no", async () => {
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
        AHORA,
      ),
    );
    const sin = rechazo(await marcar(cajera, venta, conSupervisor()));
    assert.equal(sin.problemas?.[0]?.message, "CLIENTE_OBLIGATORIO");
    const { cuenta, deuda: d } = valor(await marcar(cajera, venta, conSupervisor(), { cliente: clienteDePrueba("Prueba Deudas Juan") }));
    assert.equal(cuenta.family, "Prueba Deudas Juan");
    assert.equal(d.lugar, "Mostrador");
    assert.equal(d.monto.minor, "522");
    assert.equal(d.sentadoPor, "Marisol Prieto", "en el mostrador, la cajera que la dejó");
  });

  test("la cuenta de una familia del parque no queda en deuda aquí", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA - 10 * MIN);
    assert.equal(rechazo(await marcar(cajera, familia, conSupervisor())).motivo, "CONFLICTO");
  });
});

describe("cuando vuelve (B3-11)", () => {
  test("buscarlo avisa de lo que debe", async () => {
    const d = valor(await l.app.deudas.leer(cajera, AHORA)).deudas.find((x) => x.cliente.nombre === "Prueba Deudas María")!;
    const encontrado = valor(await l.app.clientes.buscar(mesero, { cedula: d.cliente.cedula }));
    assert.equal(encontrado?.deudas.length, 1);
    assert.equal(encontrado?.deudas[0]?.monto.minor, "1044");
    assert.equal(encontrado?.deudas[0]?.lugar, "Mesa 1");
  });

  test("cobrarla abre una cuenta del mostrador con lo que consumió, una sola", async () => {
    const d = valor(await l.app.deudas.leer(cajera, AHORA)).deudas.find((x) => x.cliente.nombre === "Prueba Deudas María")!;
    const cuenta = valor(await l.app.deudas.cobrar(cajera, { idempotencyKey: randomUUID(), deudaId: d.id }, AHORA + 2 * MIN));
    assert.equal(cuenta.kind, "MOSTRADOR");
    assert.equal(cuenta.status, "POR_COBRAR");
    assert.equal(cuenta.family, "Prueba Deudas María");
    assert.equal(cuenta.cliente?.cedula, d.cliente.cedula);
    assert.deepEqual(cuenta.lines.map((x) => [x.concept, x.amount.minor, x.productId ?? null, x.taxCode]), [
      ["Tequeños", "450", null, "GENERAL"],
      ["Tequeños", "450", null, "GENERAL"],
    ]);
    const otraVez = valor(await l.app.deudas.cobrar(cajera, { idempotencyKey: randomUUID(), deudaId: d.id }, AHORA + 3 * MIN));
    assert.equal(otraVez.id, cuenta.id, "no se abren dos");
    assert.equal((await deuda(d.id)).enCobro, cuenta.id);
  });

  test("cobrada entera en la caja, la deuda queda cobrada", async () => {
    const d = valor(await l.app.deudas.leer(cajera, AHORA)).deudas.find((x) => x.cliente.nombre === "Prueba Deudas María")!;
    const c = valor(await l.app.cuentas.leer(cajera, AHORA + 4 * MIN)).cuentas.find((x) => x.id === d.enCobro)!;
    const r = valor(
      await l.app.cuentas.cobrar(
        cajera,
        {
          idempotencyKey: randomUUID(),
          accountId: c.id,
          version: c.version,
          lineIds: c.lines.map((x) => x.id),
          total: usd("1044"),
          pagos: [{ method: "EFECTIVO_USD", amount: usd("1100") }],
          destinoSobra: "VUELTO",
        },
        AHORA + 5 * MIN,
      ),
    );
    assert.equal(r.cuenta.status, "COBRADA");
    const cobrada = await deuda(d.id);
    assert.equal(cobrada.estado, "COBRADA");
    assert.equal(cobrada.desenlace?.cuentaCobro, c.id);
    assert.equal(cobrada.desenlace?.por, "Marisol Prieto");
    assert.equal(cobrada.enCobro, null);
    // Y buscarlo ya no avisa de nada.
    assert.deepEqual(valor(await l.app.clientes.buscar(mesero, { cedula: d.cliente.cedula }))?.deudas, []);
    assert.equal(rechazo(await l.app.deudas.cobrar(cajera, { idempotencyKey: randomUUID(), deudaId: d.id }, AHORA)).motivo, "CONFLICTO");
  });
});

describe("darla por perdida (B3-11)", () => {
  test("con un cobro abierto en la caja, no", async () => {
    const d = valor(await l.app.deudas.leer(cajera, AHORA)).deudas.find((x) => x.cliente.nombre === "Prueba Deudas Juan")!;
    const c = valor(await l.app.deudas.cobrar(cajera, { idempotencyKey: randomUUID(), deudaId: d.id }, AHORA));
    const r = rechazo(await l.app.deudas.perder(admin, { idempotencyKey: randomUUID(), deudaId: d.id, motivo: "No volvió" }, conAdmin(), AHORA));
    assert.match(r.mensaje, /cobro abierto/);
    // Lo consumido no se quita con un «guardar»; se devuelve a las deudas, y entonces ya se puede.
    assert.equal(rechazo(await l.app.cuentas.guardar(cajera, { cuenta: { ...c, lines: [], status: "ABIERTA" } }, AHORA + MIN)).problemas?.[0]?.message, "LINEA_QUITADA");
    const devuelta = valor(await l.app.deudas.devolver(cajera, { idempotencyKey: randomUUID(), deudaId: d.id }, AHORA + MIN));
    assert.equal(devuelta.estado, "PENDIENTE");
    assert.equal(devuelta.enCobro, null);
    assert.ok(!valor(await l.app.cuentas.leer(cajera, AHORA + MIN)).cuentas.some((x) => x.id === c.id), "sale de la cola");
  });

  test("es de administración con su PIN y un motivo; la caja y supervisión, con el de administración", async () => {
    const d = valor(await l.app.deudas.leer(cajera, AHORA)).deudas.find((x) => x.cliente.nombre === "Prueba Deudas Juan")!;
    const cmd = { idempotencyKey: randomUUID(), deudaId: d.id, motivo: "No volvió en tres meses" };
    assert.equal(rechazo(await l.app.deudas.perder(cajera, cmd, undefined, AHORA)).motivo, "NO_PERMITIDO");
    assert.equal(rechazo(await l.app.deudas.perder(mesero, cmd, conAdmin(), AHORA)).motivo, "NO_PERMITIDO");
    const perdida = valor(await l.app.deudas.perder(cajera, cmd, conAdmin(), AHORA + 2 * MIN));
    assert.equal(perdida.estado, "PERDIDA");
    assert.equal(perdida.desenlace?.motivo, "No volvió en tres meses");
    assert.equal(perdida.desenlace?.autorizadoPor, "Abigail Karam");
    assert.deepEqual(valor(await l.app.deudas.perder(cajera, cmd, conAdmin(), AHORA + 3 * MIN)), perdida, "reenviar la misma clave no hace otra");
    assert.equal(rechazo(await l.app.deudas.perder(admin, { ...cmd, idempotencyKey: randomUUID() }, conAdmin(), AHORA)).motivo, "CONFLICTO");
  });
});

describe("solo agregar, permisos y aislamiento (B3-11)", () => {
  test("una deuda y su desenlace no se corrigen ni se borran", async () => {
    const [d] = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebt.findMany({ take: 1 }));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebt.update({ where: { id: d!.id }, data: { amountMinor: 1n } })));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebt.delete({ where: { id: d!.id } })));
    const [o] = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebtOutcome.findMany({ take: 1 }));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebtOutcome.update({ where: { id: o!.id }, data: { reason: "Otro" } })));
  });

  test("la monitora no las ve; otro local no las ve ni las cobra", async () => {
    assert.equal(rechazo(await l.app.deudas.leer(monitora, AHORA)).motivo, "NO_PERMITIDO");
    assert.deepEqual(valor(await otro.app.deudas.leer(otro.sistema, AHORA)).deudas, []);
    const d = valor(await l.app.deudas.leer(cajera, AHORA)).deudas[0]!;
    assert.equal(rechazo(await otro.app.deudas.cobrar(otro.sistema, { idempotencyKey: randomUUID(), deudaId: d.id }, AHORA)).motivo, "NO_DISPONIBLE");
    assert.equal(rechazo(await otro.app.deudas.marcar(otroMesero, { idempotencyKey: randomUUID(), accountId: d.cuentaId, version: 1 }, undefined, AHORA)).ok, false);
  });
});
