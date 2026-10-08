/**
 * Las cuentas del salón, contra l2control_test — B6-7 (M-27, P-2 y P-3).
 *
 * Lo que fijan: sentar a una familia abre su cuenta en la mesa con sus comensales; una mesa compartida
 * admite más cuentas, cada una con su nombre (la segunda no va sin él, ni repite el de otra), y solo sobre
 * las que se vieron (otro equipo que abrió una mientras tanto hace chocar); un pedido va a la cuenta que
 * se nombra, y con varias en la mesa hay que nombrarla; la comanda lleva la mesa y el nombre de la cuenta;
 * una cuenta de pie no tiene mesa y su pedido sale «De pie»; vincular elige cuenta; el reintento no abre
 * dos; permiso y aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CUENTAS_POR_MESA, type CatalogoDto, type FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, clienteDePrueba, contextoDe, crearEquipo, crearPersona, familiaDePrueba, impresoraDePrueba, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Viernes 2 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-02T17:00:00.000Z");
const MIN = 60_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string; problemas?: { path: unknown[]; message: string }[] };

let l: LocalDePrueba;
let otro: LocalDePrueba;
let mesero: Contexto;
let otraTablet: Contexto;
let monitora: Contexto;
let cocinero: Contexto;
let otroMesero: Contexto;
let tequenos: string;

type Sentar = { tableId?: string; nombre?: string; comensales?: number; vistas?: number; cuentaId?: string };
const sentar = (ctx: Contexto, s: Sentar, ahora = AHORA) =>
  l.app.mesas.abrir(
    ctx,
    {
      cuentaId: s.cuentaId ?? randomUUID(),
      ...(s.tableId ? { tableId: s.tableId } : {}),
      // Desde B6-9 toda cuenta del salón es de un cliente con nombre, cédula y teléfono.
      cliente: clienteDePrueba(s.nombre),
      comensales: s.comensales ?? 2,
      vistas: s.vistas ?? 0,
    },
    ahora,
  );
const pedir = (ctx: Contexto, destino: { tableId?: string; cuentaId?: string }, ahora = AHORA) =>
  l.app.pedidos.enviar(ctx, { pedidoId: randomUUID(), ...destino, lineas: [{ productId: tequenos, cantidad: 1, precioMinor: "450" }] }, ahora);
const pedidoGuardado = (id: string) => l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrder.findUniqueOrThrow({ where: { id } }));
const comandaDe = (pedidoId: string) =>
  l.base.conTenant(l.sistema.tenantId, (tx) => tx.printJob.findFirstOrThrow({ where: { orderId: pedidoId, kind: "COMANDA" } }));

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba salón");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba salón B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const chef = await crearPersona(l, { nombre: "Chef Soto", role: "COCINA", pin: "9081" });
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  otraTablet = await contextoDe(l, await crearEquipo(l, "Salón 2"), pedro, "3175");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  cocinero = await contextoDe(l, await crearEquipo(l, "Cocina"), chef, "9081");
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

describe("sentar a una familia", () => {
  let primera: FamilyAccountDto;

  test("abre la cuenta de la mesa con sus comensales, a nombre de su cliente (B6-9)", async () => {
    primera = valor(await sentar(mesero, { tableId: "mesa-1", nombre: "Familia Rojas", comensales: 3 }));
    assert.equal(primera.kind, "MESA");
    assert.equal(primera.tableId, "mesa-1");
    assert.equal(primera.family, "Familia Rojas");
    assert.equal(primera.cliente?.nombre, "Familia Rojas");
    assert.equal(primera.comensales, 3);
    assert.equal(primera.status, "ABIERTA");
    assert.deepEqual(primera.lines, []);
    assert.ok(primera.orderNumber! > 0, "el servidor le pone su número de orden");
    const auditoria = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { entityId: primera.id, action: "cuenta.abrir" } }));
    assert.ok(auditoria, "queda en la auditoría");
  });

  test("el reintento con el mismo id devuelve la misma cuenta, sin abrir otra", async () => {
    const otra = valor(await sentar(mesero, { tableId: "mesa-1", comensales: 3, cuentaId: primera.id }));
    assert.equal(otra.id, primera.id);
    const cuentas = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.account.count({ where: { kind: "MESA" } }));
    assert.equal(cuentas, 1);
  });

  test("con nombre, la mesa admite otra cuenta; con el mismo nombre que otra, no", async () => {
    const perez = valor(await sentar(mesero, { tableId: "mesa-1", nombre: "Familia Pérez", comensales: 4, vistas: 1 }));
    assert.equal(perez.family, "Familia Pérez");
    assert.equal(perez.tableLabel, "1");
    const repetida = rechazo(await sentar(mesero, { tableId: "mesa-1", nombre: "familia perez", vistas: 2 }));
    assert.equal(repetida.motivo, "CONFLICTO");
    assert.equal(repetida.problemas?.[0]?.message, "NOMBRE_REPETIDO");
    const comoLaPrimera = rechazo(await sentar(mesero, { tableId: "mesa-1", nombre: "FAMILIA ROJAS", vistas: 2 }));
    assert.equal(comoLaPrimera.problemas?.[0]?.message, "NOMBRE_REPETIDO", "la primera es de «Familia Rojas»");
  });

  test("si otro equipo abrió una cuenta en la mesa mientras tanto, choca en vez de abrir otra", async () => {
    valor(await sentar(otraTablet, { tableId: "mesa-2", comensales: 2 }));
    const r = rechazo(await sentar(mesero, { tableId: "mesa-2", comensales: 2, vistas: 0 }));
    assert.equal(r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.match(r.mensaje, /otro equipo/);
  });

  test(`una mesa no pasa de ${CUENTAS_POR_MESA} cuentas abiertas`, async () => {
    for (let i = 0; i < CUENTAS_POR_MESA; i++) valor(await sentar(mesero, { tableId: "mesa-6", nombre: `Familia ${i}`, vistas: i }));
    const r = rechazo(await sentar(mesero, { tableId: "mesa-6", nombre: "Una más", vistas: CUENTAS_POR_MESA }));
    assert.equal(r.problemas?.[0]?.message, "MESA_LLENA");
  });

  test("una mesa que no está en el plano no se abre", async () => {
    const r = rechazo(await sentar(mesero, { tableId: "mesa-99" }));
    assert.equal(r.motivo, "INVALIDO");
  });

  test("la monitora y la cocina no sientan a nadie (no toman pedidos)", async () => {
    assert.equal(rechazo(await sentar(monitora, { tableId: "mesa-3" })).motivo, "NO_PERMITIDO");
    assert.equal(rechazo(await sentar(cocinero, { tableId: "mesa-3" })).motivo, "NO_PERMITIDO");
  });
});

describe("pedir en una mesa compartida", () => {
  test("con varias cuentas en la mesa hay que decir a cuál va", async () => {
    const r = rechazo(await pedir(mesero, { tableId: "mesa-1" }));
    assert.equal(r.motivo, "INVALIDO", JSON.stringify(r));
    assert.equal(r.problemas?.[0]?.message, "ELIGE_CUENTA");
  });

  test("va a la cuenta que se nombra, y la comanda dice la mesa y a quién", async () => {
    const perez = (await l.app.cuentas.leer(mesero, AHORA)).ok
      ? valor(await l.app.cuentas.leer(mesero, AHORA)).cuentas.find((c) => c.kind === "MESA" && c.family === "Familia Pérez")!
      : null;
    assert.ok(perez);
    const enviado = valor(await pedir(mesero, { tableId: "mesa-1", cuentaId: perez.id }));
    assert.equal(enviado.cuenta.id, perez.id);
    assert.equal(enviado.cuenta.lines.length, 1);
    assert.equal(enviado.pedido.mesa, "1");
    assert.equal(enviado.pedido.nombreCuenta, "Familia Pérez");
    const fila = await pedidoGuardado(enviado.pedido.id);
    assert.equal(fila.accountLabel, "Familia Pérez");
    const trabajo = await comandaDe(enviado.pedido.id);
    assert.match(trabajo.title, /Mesa 1 · Familia Pérez/);
    const texto = JSON.stringify(trabajo.content);
    assert.match(texto, /MESA 1/);
    assert.match(texto, /Familia Pérez/);
  });

  test("una cuenta que no es de esa mesa no recibe el pedido", async () => {
    const r = rechazo(await pedir(mesero, { tableId: "mesa-2", cuentaId: randomUUID() }));
    assert.equal(r.motivo, "CONFLICTO");
    assert.equal(r.problemas?.[0]?.message, "CUENTA_CERRADA");
  });

  test("en una mesa con una sola cuenta, el pedido va a ella sin nombrarla, y la comanda lleva el nombre de su cliente", async () => {
    const enviado = valor(await pedir(mesero, { tableId: "mesa-2" }));
    assert.equal(enviado.pedido.nombreCuenta, enviado.cuenta.family);
    assert.match(enviado.cuenta.family, /^Prueba Cliente \d+$/);
  });
});

describe("cuentas de pie", () => {
  let luis: FamilyAccountDto;

  test("sin su cliente no se abre (B6-9)", async () => {
    const r = rechazo(await l.app.mesas.abrir(mesero, { cuentaId: randomUUID(), comensales: 1, vistas: 0 }, AHORA));
    assert.equal(r.motivo, "INVALIDO");
  });

  test("con nombre, es una cuenta de mostrador de pie, sin mesa", async () => {
    luis = valor(await sentar(mesero, { nombre: "Sr. Luis camisa azul", comensales: 1 }));
    assert.equal(luis.kind, "MOSTRADOR");
    assert.equal(luis.dePie, true);
    assert.equal(luis.tableId, undefined);
    assert.equal(luis.family, "Sr. Luis camisa azul");
    // Recién abierta y sin pedidos, no es un borrador de mostrador: el salón la sigue viendo.
    const leidas = valor(await l.app.cuentas.leer(mesero, AHORA)).cuentas;
    assert.ok(leidas.some((c) => c.id === luis.id), "la lectura de cuentas la trae");
    const r = rechazo(await sentar(mesero, { nombre: "sr. luis camisa azul" }));
    assert.equal(r.problemas?.[0]?.message, "NOMBRE_REPETIDO");
  });

  test("su pedido sale «De pie» con su nombre, sin mesa", async () => {
    const enviado = valor(await pedir(mesero, { cuentaId: luis.id }));
    assert.equal(enviado.pedido.tableId, null);
    assert.equal(enviado.pedido.mesa, "De pie");
    assert.equal(enviado.pedido.nombreCuenta, "Sr. Luis camisa azul");
    const fila = await pedidoGuardado(enviado.pedido.id);
    assert.equal(fila.tableId, null);
    const texto = JSON.stringify((await comandaDe(enviado.pedido.id)).content);
    assert.match(texto, /DE PIE/);
    assert.match(texto, /Sr\. Luis camisa azul/);
  });

  test("una cuenta de pie sin consumo se libera como una mesa", async () => {
    const nadie = valor(await sentar(mesero, { nombre: "Señora del coche", comensales: 2 }));
    const liberada = valor(await l.app.cuentas.liberarMesa(mesero, { idempotencyKey: randomUUID(), accountId: nadie.id, version: nadie.version! }, AHORA + MIN));
    assert.equal(liberada.status, "SIN_CONSUMO");
  });

  test("una venta de mostrador de la caja no recibe pedidos del mesero", async () => {
    const venta = randomUUID();
    const r = rechazo(await pedir(mesero, { cuentaId: venta }));
    assert.equal(r.motivo, "CONFLICTO");
  });
});

describe("vincular en una mesa compartida", () => {
  test("con varias cuentas hay que elegir una; elegida, el parque del niño va a esa", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA, "CUENTA_ABIERTA");
    const sessionId = familia.sessionIds[0]!;
    const sin = rechazo(await l.app.mesas.vincular(mesero, { idempotencyKey: randomUUID(), tableId: "mesa-1", sessionIds: [sessionId] }, AHORA));
    assert.equal(sin.problemas?.[0]?.message, "ELIGE_CUENTA");
    const perez = valor(await l.app.cuentas.leer(mesero, AHORA)).cuentas.find((c) => c.kind === "MESA" && c.family === "Familia Pérez")!;
    const { mesa } = valor(await l.app.mesas.vincular(mesero, { idempotencyKey: randomUUID(), tableId: "mesa-1", cuentaId: perez.id, sessionIds: [sessionId] }, AHORA + MIN));
    assert.equal(mesa.id, perez.id);
    assert.deepEqual(mesa.sessionIds, [sessionId]);
  });
});

describe("liberar en una mesa compartida", () => {
  test("liberar una cuenta sin consumo deja la otra abierta en la mesa", async () => {
    const cuentas = valor(await l.app.cuentas.leer(mesero, AHORA)).cuentas;
    const mesa1 = cuentas.find((c) => c.family === "Familia Rojas")!;
    const liberada = valor(await l.app.cuentas.liberarMesa(mesero, { idempotencyKey: randomUUID(), accountId: mesa1.id, version: mesa1.version! }, AHORA + 2 * MIN));
    assert.equal(liberada.status, "SIN_CONSUMO");
    const despues = valor(await l.app.cuentas.leer(mesero, AHORA + 2 * MIN)).cuentas;
    const abiertas = despues.filter((c) => c.tableId === "mesa-1" && (c.status === "ABIERTA" || c.status === "POR_COBRAR"));
    assert.deepEqual(abiertas.map((c) => c.family), ["Familia Pérez"]);
    // Con una sola cuenta otra vez, el pedido sin nombrarla va a ella.
    const enviado = valor(await pedir(mesero, { tableId: "mesa-1" }, AHORA + 3 * MIN));
    assert.equal(enviado.cuenta.family, "Familia Pérez");
  });
});

describe("aislamiento", () => {
  test("otro local no ve ni usa las cuentas de este", async () => {
    const r = rechazo(await otro.app.pedidos.enviar(otroMesero, { pedidoId: randomUUID(), cuentaId: randomUUID(), lineas: [{ productId: tequenos, cantidad: 1, precioMinor: "450" }] }, AHORA));
    assert.notEqual(r.ok, true);
    const deOtro = await otro.base.conTenant(otro.sistema.tenantId, (tx) => tx.account.count());
    assert.equal(deOtro, 0);
  });
});
