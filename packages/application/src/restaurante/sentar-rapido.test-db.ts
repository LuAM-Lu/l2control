/**
 * Sentar «Más seguro» o «Más rápido» — B6-22 (M-40), contra l2control_test.
 *
 * Lo que fija: de fábrica se sienta «Más seguro» (nombre, cédula y teléfono, como desde B6-9); con «Más rápido» basta el
 * nombre, el primer pedido sale sin cédula y el segundo no sale hasta que se completa (el criterio del paso); completarla
 * es de quien atiende, sin autorización; sin ella no se cobra; con «Solo si queda una deuda» el teléfono no se pide, y
 * quien se va antes de dar la cédula deja la deuda con su nombre; el que ya está en el directorio trae su cédula por su
 * teléfono. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, clienteDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Martes 20 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-20T17:00:00.000Z");
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string; problemas?: { path: unknown[]; message: string }[] };

let l: LocalDePrueba;
let mesero: Contexto;
let cajera: Contexto;
let supervisor: string;
let refresco: string;

const sentar = (tableId: string | undefined, cliente: unknown, en = AHORA) =>
  l.app.mesas.abrir(mesero, { cuentaId: randomUUID(), ...(tableId ? { tableId } : {}), cliente, comensales: 2, vistas: 0 }, en);
const pedir = (c: FamilyAccountDto, en: number) =>
  l.app.pedidos.enviar(mesero, { pedidoId: randomUUID(), ...(c.tableId ? { tableId: c.tableId } : {}), cuentaId: c.id, lineas: [{ productId: refresco, cantidad: 1, precioMinor: "150" }], repetir: true }, en);
const completar = (ctx: Contexto, c: FamilyAccountDto, cliente: unknown) => l.app.clientes.asignar(ctx, { idempotencyKey: randomUUID(), accountId: c.id, cliente }, undefined, AHORA + 30 * MIN);
const directorio = () => l.base.conTenant(l.sistema.tenantId, (tx) => tx.guardian.count());

/** Publica los ajustes vigentes con cómo se sienta y cuándo el teléfono. */
async function comoSeSienta(sentar: "SEGURO" | "RAPIDO", telefonoDelCliente: "SIEMPRE" | "DEUDA") {
  const v = await l.app.ajustes.leer(l.sistema);
  valor(await l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, sentar, telefonoDelCliente } }));
}

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba sentar rápido");
  const pedro = await crearPersona(l, { nombre: "Pedro Prueba", role: "MESERO", pin: "3175" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prueba", role: "CAJERO", pin: "7391" });
  supervisor = await crearPersona(l, { nombre: "Luis Prueba", role: "SUPERVISOR", pin: "5937" });
  mesero = await contextoDe(l, await crearEquipo(l, "Tablet"), pedro, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  await planoDePrueba(l, 8);
  await impresoraDePrueba(l);
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: "2026-10-20" },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: "2026-10-20" },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 60 * MIN));
  }
  refresco = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Refresco en lata", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "150" } }, AHORA - 50 * MIN),
  ).productos.find((p) => p.nombre === "Refresco en lata")!.id;
  valor(await l.app.turnos.abrir(cajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 40 * MIN));
});

after(async () => {
  await l.cerrar();
});

describe("de fábrica, «Más seguro» (B6-22)", () => {
  test("los ajustes de antes no lo traen: se sienta con nombre, cédula y teléfono", async () => {
    const v = await l.app.ajustes.leer(l.sistema);
    assert.equal(v.ajustes.sentar, "SEGURO");
    assert.equal(v.ajustes.telefonoDelCliente, "SIEMPRE");
    const ana = clienteDePrueba("Prueba Ana Segura");
    const sinCedula = rechazo(await sentar("mesa-1", { nombre: ana.nombre, telefono: ana.telefono }));
    assert.equal(sinCedula.problemas?.[0]?.message, "FALTA_LA_CEDULA", JSON.stringify(sinCedula));
    assert.match(sinCedula.mensaje, /Falta la cédula de Prueba Ana Segura: sin ella no se abre la cuenta/);
    const sinTelefono = rechazo(await sentar("mesa-1", { nombre: ana.nombre, cedula: ana.cedula, telefono: "" }));
    assert.equal(sinTelefono.problemas?.[0]?.message, "FALTA_EL_TELEFONO");
    const cuenta = valor(await sentar("mesa-1", ana));
    assert.equal(cuenta.cliente?.cedula, ana.cedula);
  });
});

describe("con «Más rápido» (B6-22)", () => {
  let maria: FamilyAccountDto;
  before(() => comoSeSienta("RAPIDO", "SIEMPRE"));

  test("basta el nombre (y el teléfono, con «Siempre»): la cuenta queda sin cédula, y el asiento lo dice sin datos", async () => {
    assert.equal(rechazo(await sentar("mesa-2", { nombre: "Prueba María Rápida" })).problemas?.[0]?.message, "FALTA_EL_TELEFONO");
    maria = valor(await sentar("mesa-2", { nombre: "Prueba María Rápida", cedula: "", telefono: "0414-3990001" }));
    assert.equal(maria.family, "Prueba María Rápida");
    assert.equal(maria.cliente?.cedula, null);
    assert.equal(maria.cliente?.telefono, "0414-3990001");
    const asiento = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { entityId: maria.id, action: "cuenta.abrir" } }));
    assert.deepEqual((asiento.after as { faltan?: string[] }).faltan, ["CEDULA"]);
    assert.ok(!JSON.stringify(asiento.after).includes("3990001"), "sin su teléfono");
    // Se lee igual que cualquier otra.
    const leida = valor(await l.app.cuentas.leer(cajera, AHORA)).cuentas.find((c) => c.id === maria.id)!;
    assert.equal(leida.cliente?.cedula, null);
  });

  test("el criterio: el primer pedido sale sin cédula y el segundo no sale hasta que se completa", async () => {
    const { cuenta } = valor(await pedir(maria, AHORA + MIN));
    const segundo = rechazo(await pedir(cuenta, AHORA + 2 * MIN));
    assert.equal(segundo.problemas?.[0]?.message, "FALTA_LA_CEDULA", JSON.stringify(segundo));
    assert.match(segundo.mensaje, /Antes del segundo pedido, la cédula de Prueba María Rápida/);
    // Completarla es del mesero, sin autorización, aunque el nombre llegue completo.
    const completa = valor(await completar(mesero, cuenta, { nombre: "Prueba María Rápida Pérez", cedula: "V-30990001", telefono: "0414-3990001" }));
    assert.equal(completa.cliente?.cedula, "V-30990001");
    assert.equal(completa.family, "Prueba María Rápida Pérez");
    const asiento = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { entityId: maria.id, action: "cuenta.cliente" } }));
    assert.equal((asiento.after as { completado?: boolean }).completado, true);
    maria = valor(await pedir(completa, AHORA + 31 * MIN)).cuenta;
    // Ya con cédula, cambiarla es otra cosa: pide la autorización de supervisión.
    assert.equal(rechazo(await completar(mesero, maria, { nombre: "Prueba Otra Persona", cedula: "V-30990002", telefono: "0414-3990002" })).motivo, "NO_PERMITIDO");
  });

  test("completar sin el teléfono deja el que ya tenía", async () => {
    const jose = valor(await sentar("mesa-3", { nombre: "Prueba José Rápido", telefono: "0414-3990003" }));
    const completo = valor(await completar(mesero, jose, { nombre: "Prueba José Rápido", cedula: "V-30990003" }));
    assert.equal(completo.cliente?.telefono, "0414-3990003");
  });

  test("sin la cédula no se cobra; completada en la caja, sí", async () => {
    const rosa = valor(await sentar(undefined, { nombre: "Prueba Rosa Rápida", telefono: "0414-3990004" }));
    const { cuenta } = valor(await pedir(rosa, AHORA + 3 * MIN));
    const enCola = valor(await l.app.cuentas.guardar(cajera, { cuenta: { ...cuenta, status: "POR_COBRAR" } }, AHORA + 4 * MIN));
    const cobro = (c: FamilyAccountDto) =>
      l.app.cuentas.cobrar(
        cajera,
        {
          idempotencyKey: randomUUID(),
          accountId: c.id,
          version: c.version,
          lineIds: c.lines.filter((x) => !x.paid).map((x) => x.id),
          total: usd("174"),
          pagos: [{ method: "EFECTIVO_USD", amount: usd("174") }],
          destinoSobra: "VUELTO",
          cliente: { kind: "IDENTIFICADO", name: "Prueba Rosa Rápida", document: "V-30990004" },
        },
        AHORA + 40 * MIN,
      );
    const sin = rechazo(await cobro(enCola));
    assert.equal(sin.problemas?.[0]?.message, "FALTA_LA_CEDULA", JSON.stringify(sin));
    const completa = valor(await completar(cajera, enCola, { nombre: "Prueba Rosa Rápida", cedula: "V-30990004", telefono: "0414-3990004" }));
    assert.equal(valor(await cobro(completa)).cuenta.status, "COBRADA");
  });

  test("vale aunque la sucursal vuelva a «Más seguro»: la regla es de la cuenta", async () => {
    const luis = valor(await sentar("mesa-4", { nombre: "Prueba Luis Rápido", telefono: "0414-3990005" }));
    const { cuenta } = valor(await pedir(luis, AHORA + 5 * MIN));
    await comoSeSienta("SEGURO", "SIEMPRE");
    assert.equal(rechazo(await pedir(cuenta, AHORA + 6 * MIN)).problemas?.[0]?.message, "FALTA_LA_CEDULA");
    await comoSeSienta("RAPIDO", "SIEMPRE");
  });
});

describe("el teléfono «Solo si queda una deuda» (B6-22)", () => {
  before(() => comoSeSienta("RAPIDO", "DEUDA"));

  test("con el nombre solo se abre la cuenta; sin teléfono, el cliente nuevo no entra al directorio", async () => {
    const antes = await directorio();
    const pepe = valor(await sentar("mesa-5", { nombre: "Prueba Pepe Sin Nada" }));
    assert.deepEqual([pepe.cliente?.cedula, pepe.cliente?.telefono, pepe.cliente?.clienteId], [null, null, undefined]);
    assert.equal(await directorio(), antes);
    // Con su cédula y sin teléfono, se completa sin pedirlo.
    const completo = valor(await completar(mesero, pepe, { nombre: "Prueba Pepe Sin Nada", cedula: "V-30990006" }));
    assert.deepEqual([completo.cliente?.cedula, completo.cliente?.telefono], ["V-30990006", null]);
  });

  test("quien se va antes de dar la cédula deja la deuda con su nombre", async () => {
    const lola = valor(await sentar("mesa-6", { nombre: "Prueba Lola Se Fue" }));
    const { cuenta } = valor(await pedir(lola, AHORA + 7 * MIN));
    const r = valor(
      await l.app.deudas.marcar(mesero, { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cuenta.version }, { autorizadorId: supervisor, pin: "5937", motivo: "Se fue con el local lleno" }, AHORA + 8 * MIN),
    );
    assert.equal(r.cuenta.status, "INCOBRABLE");
    const deuda = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.customerDebt.findFirstOrThrow({ where: { accountId: cuenta.id } }));
    assert.deepEqual([deuda.fullName, deuda.document, deuda.phone], ["Prueba Lola Se Fue", null, null]);
    const leida = valor(await l.app.deudas.leer(cajera, AHORA + 9 * MIN)).deudas.find((d) => d.cuentaId === cuenta.id)!;
    assert.deepEqual([leida.cliente.nombre, leida.cliente.cedula, leida.cliente.telefono], ["Prueba Lola Se Fue", null, null]);
  });

  test("una venta que queda pendiente pide el teléfono igual: se va y vuelve a pagar", async () => {
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
            lines: [{ id: randomUUID(), concept: "Refresco en lata", kind: "RESTAURANTE", amount: usd("150"), paid: false, productId: refresco, taxCode: "GENERAL" }],
          },
        },
        AHORA + 10 * MIN,
      ),
    );
    const r = rechazo(await completar(cajera, venta, { nombre: "Prueba Juan Pendiente", cedula: "V-30990007" }));
    assert.equal(r.problemas?.[0]?.message, "FALTA_EL_TELEFONO", JSON.stringify(r));
  });

  test("el que ya está en el directorio trae su cédula por su teléfono: no le falta", async () => {
    const conocido = clienteDePrueba("Prueba Carla Conocida");
    valor(await sentar("mesa-7", conocido));
    const vuelve = valor(await sentar("mesa-8", { nombre: "Prueba Carla Conocida", telefono: conocido.telefono }, AHORA + 20 * MIN));
    assert.equal(vuelve.cliente?.cedula, conocido.cedula);
    assert.ok(vuelve.cliente?.clienteId, "enlazada a su ficha del directorio");
  });
});
