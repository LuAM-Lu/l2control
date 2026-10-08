/**
 * El cliente de una cuenta, contra l2control_test — B6-9 (M-33).
 *
 * Lo que fijan: sentar a alguien sin sus datos no abre la cuenta; con ellos, la cuenta se llama como él, lleva su
 * cliente y el directorio lo reconoce la próxima vez (por la cédula; por el teléfono, al representante del parque, que
 * recibe su cédula); un teléfono de otro cliente con otra cédula no se pisa; buscar; poner el cliente a una venta del
 * mostrador y cambiarlo con la autorización de supervisión; guardar la cuenta desde una pantalla no lo cambia; la tabla
 * es de solo agregar; una mesa sin cuenta no la abren un pedido ni una pulsera; permisos y aislamiento. Corre con
 * `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, FamilyAccountDto } from "@l2/contracts";
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
  type LocalDePrueba,
} from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Jueves 8 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-08T17:00:00.000Z");
const MIN = 60_000;

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
let otroMesero: Contexto;
let supervisor: { id: string; pin: string };
let tequenos: string;

const sentar = (ctx: Contexto, tableId: string | undefined, cliente: unknown, extra: { vistas?: number } = {}) =>
  l.app.mesas.abrir(ctx, { cuentaId: randomUUID(), ...(tableId ? { tableId } : {}), cliente, comensales: 2, vistas: extra.vistas ?? 0 }, AHORA);
const directorio = (local: LocalDePrueba = l) => local.base.conTenant(local.sistema.tenantId, (tx) => tx.guardian.findMany());
const filasDe = (accountId: string) => l.base.conTenant(l.sistema.tenantId, (tx) => tx.accountCustomer.findMany({ where: { accountId } }));

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba clientes");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba clientes B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  supervisor = { id: await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" }), pin: "5937" };
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  const jesus = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "MESERO", pin: "3175" });
  otroMesero = await contextoDe(otro, await crearEquipo(otro, "Salón"), jesus, "3175");
  await planoDePrueba(l, 6);
  await planoDePrueba(otro);
  await impresoraDePrueba(l);
  const c: CatalogoDto = valor(
    await l.app.productos.aplicar(
      l.sistema,
      { kind: "CREAR", producto: { nombre: "Tequeños", categoria: "Carta", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "450" } },
      AHORA - 10 * MIN,
    ),
  );
  tequenos = c.productos.find((p) => p.nombre === "Tequeños")!.id;
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("sentar a alguien con sus datos (B6-9)", () => {
  let primera: FamilyAccountDto;
  const maria = clienteDePrueba("Prueba María Pérez");

  test("sin nombre, cédula y teléfono no se abre la cuenta", async () => {
    for (const falta of ["nombre", "cedula", "telefono"] as const) {
      const { [falta]: _, ...resto } = maria;
      const r = rechazo(await sentar(mesero, "mesa-1", resto));
      assert.equal(r.motivo, "INVALIDO", falta);
    }
    assert.equal(rechazo(await sentar(mesero, "mesa-1", { ...maria, cedula: "12345678" })).motivo, "INVALIDO");
    const abiertas = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.account.count({ where: { kind: "MESA" } }));
    assert.equal(abiertas, 0);
  });

  test("con ellos, la cuenta se llama como el cliente, lo lleva y el directorio lo da de alta", async () => {
    primera = valor(await sentar(mesero, "mesa-1", { ...maria, cedula: "v 30.000.801", telefono: "04141234801" }));
    assert.equal(primera.family, "Prueba María Pérez");
    assert.deepEqual({ ...primera.cliente, clienteId: undefined }, { nombre: "Prueba María Pérez", cedula: "V-30000801", telefono: "0414-1234801", clienteId: undefined });
    assert.ok(primera.cliente?.clienteId);
    const g = (await directorio()).find((x) => x.id === primera.cliente!.clienteId)!;
    assert.equal(g.fullName, "Prueba María Pérez");
    assert.equal(g.documentKey, "V30000801");
    assert.equal(g.contactKey, "04141234801");
    // La caja la lee con su cliente.
    const leidas = valor(await l.app.cuentas.leer(cajera, AHORA));
    assert.equal(leidas.cuentas.find((c) => c.id === primera.id)?.cliente?.cedula, "V-30000801");
  });

  test("el asiento nombra al cliente del directorio, no su cédula ni su teléfono", async () => {
    const a = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { entityId: primera.id, action: "cuenta.abrir" } }));
    const texto = JSON.stringify(a);
    assert.ok(texto.includes(primera.cliente!.clienteId!));
    assert.ok(!texto.includes("30000801") && !texto.includes("1234801"), texto);
  });

  test("el que vuelve se reconoce por su cédula: no se da de alta otra vez", async () => {
    const antes = (await directorio()).length;
    const otra = valor(await sentar(mesero, "mesa-2", { nombre: "Prueba María Pérez", cedula: "V-30000801", telefono: "0414-1234801" }));
    assert.equal(otra.cliente?.clienteId, primera.cliente?.clienteId);
    assert.equal((await directorio()).length, antes);
  });

  test("un representante del parque se reconoce por su teléfono y recibe su cédula", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA - 30 * MIN);
    const guardian = (await l.base.conTenant(l.sistema.tenantId, (tx) => tx.parkSession.findFirstOrThrow({ where: { accountId: familia.id } }))).guardianId;
    const g = (await directorio()).find((x) => x.id === guardian)!;
    assert.equal(g.documentKey, null);
    const cuenta = valor(await sentar(mesero, "mesa-3", { nombre: "Familia Pérez", cedula: "V-30000777", telefono: g.contactReference }));
    assert.equal(cuenta.cliente?.clienteId, guardian);
    const despues = (await directorio()).find((x) => x.id === guardian)!;
    assert.equal(despues.document, "V-30000777");
    const asiento = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { entityId: guardian, action: "cliente.completar" } }));
    assert.ok(asiento, "completar la cédula queda en la auditoría");
  });

  test("un teléfono de otro cliente con otra cédula no se pisa: la cuenta guarda los datos tal cual", async () => {
    const cuenta = valor(await sentar(mesero, "mesa-4", { nombre: "Prueba José Pérez", cedula: "V-30000802", telefono: "0414-1234801" }));
    assert.equal(cuenta.cliente?.clienteId, undefined);
    assert.equal(cuenta.cliente?.cedula, "V-30000802");
    const maria = (await directorio()).find((x) => x.id === primera.cliente!.clienteId)!;
    assert.equal(maria.documentKey, "V30000801");
    assert.equal(maria.fullName, "Prueba María Pérez");
  });

  test("de pie, igual: con su cliente y sin mesa", async () => {
    const dePie = valor(await sentar(mesero, undefined, clienteDePrueba("Prueba Luis de pie")));
    assert.equal(dePie.dePie, true);
    assert.equal(dePie.family, "Prueba Luis de pie");
    assert.ok(dePie.cliente?.clienteId);
  });
});

describe("buscar al cliente (B6-9)", () => {
  test("por su cédula o su teléfono completos; si no ha venido, nada", async () => {
    const porCedula = valor(await l.app.clientes.buscar(mesero, { cedula: "v-30.000.801" }));
    assert.equal(porCedula?.nombre, "Prueba María Pérez");
    assert.equal(porCedula?.telefono, "0414-1234801");
    const porTelefono = valor(await l.app.clientes.buscar(cajera, { telefono: "0414 123 4801" }));
    assert.equal(porTelefono?.clienteId, porCedula?.clienteId);
    assert.equal(valor(await l.app.clientes.buscar(mesero, { cedula: "V-39999999" })), null);
    // Un pedazo de teléfono no busca: se escribe entero.
    assert.equal(valor(await l.app.clientes.buscar(mesero, { telefono: "0414" })), null);
  });

  test("la monitora no busca clientes del restaurante; otro local no los ve", async () => {
    assert.equal(rechazo(await l.app.clientes.buscar(monitora, { cedula: "V-30000801" })).motivo, "NO_PERMITIDO");
    assert.equal(valor(await otro.app.clientes.buscar(otroMesero, { cedula: "V-30000801" })), null);
  });
});

describe("el cliente de una venta del mostrador que se deja pendiente (B6-9)", () => {
  let venta: FamilyAccountDto;
  const juan = clienteDePrueba("Prueba Juan Mostrador");

  before(async () => {
    venta = valor(
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
            lines: [{ id: randomUUID(), concept: "Tequeños", kind: "RESTAURANTE", amount: { minor: "450", currency: "USD" }, paid: false, productId: tequenos, taxCode: "GENERAL" }],
          },
        },
        AHORA,
      ),
    );
    assert.equal(venta.cliente, undefined);
  });

  test("ponerlo lo hace quien atiende: la venta pasa a llamarse como el cliente", async () => {
    const con = valor(await l.app.clientes.asignar(cajera, { idempotencyKey: randomUUID(), accountId: venta.id, cliente: juan }, undefined, AHORA));
    assert.equal(con.family, "Prueba Juan Mostrador");
    assert.equal(con.cliente?.cedula, juan.cedula);
    assert.equal(con.version, venta.version! + 1);
    // Reenviar el mismo no añade nada.
    valor(await l.app.clientes.asignar(cajera, { idempotencyKey: randomUUID(), accountId: venta.id, cliente: juan }, undefined, AHORA));
    assert.equal((await filasDe(venta.id)).length, 1);
  });

  test("guardar la cuenta desde una pantalla no cambia su cliente", async () => {
    const vigente = valor(await l.app.cuentas.leer(cajera, AHORA)).cuentas.find((c) => c.id === venta.id)!;
    const falsa = { ...vigente, cliente: { nombre: "Prueba Otro", cedula: "V-31111111", telefono: "0414-9999999" } };
    const guardada = valor(await l.app.cuentas.guardar(cajera, { cuenta: falsa }, AHORA + MIN));
    assert.equal(guardada.cliente?.cedula, juan.cedula);
    assert.equal((await filasDe(venta.id)).length, 1);
  });

  test("cambiarlo pide la autorización de supervisión, y queda quién y por qué", async () => {
    const corregido = { ...juan, cedula: "V-30009999" };
    assert.equal(rechazo(await l.app.clientes.asignar(cajera, { idempotencyKey: randomUUID(), accountId: venta.id, cliente: corregido }, undefined, AHORA)).motivo, "NO_PERMITIDO");
    const malo = { autorizadorId: supervisor.id, pin: "0000", motivo: "Cédula mal escrita" };
    assert.equal(rechazo(await l.app.clientes.asignar(cajera, { idempotencyKey: randomUUID(), accountId: venta.id, cliente: corregido }, malo, AHORA)).ok, false);
    const autorizacion = { autorizadorId: supervisor.id, pin: supervisor.pin, motivo: "Cédula mal escrita" };
    const con = valor(await l.app.clientes.asignar(cajera, { idempotencyKey: randomUUID(), accountId: venta.id, cliente: corregido }, autorizacion, AHORA + 2 * MIN));
    assert.equal(con.cliente?.cedula, "V-30009999");
    assert.equal((await filasDe(venta.id)).length, 2, "la anterior se queda: solo agregar");
    const asiento = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { entityId: venta.id, action: "cuenta.cambiar_cliente" } }));
    assert.equal(asiento.authorizedBy, supervisor.id);
    assert.equal(asiento.reason, "Cédula mal escrita");
  });

  test("la cuenta de una familia del parque no cambia de cliente aquí", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA - 20 * MIN);
    assert.equal(rechazo(await l.app.clientes.asignar(cajera, { idempotencyKey: randomUUID(), accountId: familia.id, cliente: juan }, undefined, AHORA)).motivo, "CONFLICTO");
  });

  test("lo anotado no se corrige ni se borra: solo agregar", async () => {
    const [fila] = await filasDe(venta.id);
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.accountCustomer.update({ where: { id: fila!.id }, data: { fullName: "Otro" } })));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.accountCustomer.delete({ where: { id: fila!.id } })));
  });

  test("otro local no le pone cliente a esta cuenta", async () => {
    assert.equal(rechazo(await otro.app.clientes.asignar(otroMesero, { idempotencyKey: randomUUID(), accountId: venta.id, cliente: juan }, undefined, AHORA)).motivo, "NO_DISPONIBLE");
  });
});

describe("una mesa sin cuenta no la abre nadie más que sentar (B6-9)", () => {
  test("un pedido a una mesa libre se niega: hay que sentar primero", async () => {
    const r = rechazo(await l.app.pedidos.enviar(mesero, { pedidoId: randomUUID(), tableId: "mesa-5", lineas: [{ productId: tequenos, cantidad: 1, precioMinor: "450" }] }, AHORA));
    assert.equal(r.problemas?.[0]?.message, "MESA_SIN_CUENTA", JSON.stringify(r));
  });

  test("vincular pulseras a una mesa libre, tampoco", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA - 10 * MIN);
    const r = rechazo(await l.app.mesas.vincular(mesero, { idempotencyKey: randomUUID(), tableId: "mesa-6", sessionIds: familia.sessionIds }, AHORA));
    assert.equal(r.problemas?.[0]?.message, "MESA_SIN_CUENTA", JSON.stringify(r));
  });
});
