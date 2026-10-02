/**
 * Los pedidos del mesero y su comanda impresa, contra l2control_test — B6-2, ADR-022.
 *
 * Un pedido entra en la cuenta de la mesa y su comanda en la cola en UNA transacción; sin impresora de
 * comandas no se envía; el precio, el IVA y la existencia son del servidor; el reintento no pide dos
 * veces; la comanda dice si salió y se reimprime; permiso, solo-agregar y aislamiento. Corre con
 * `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, PedidoEnviadoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { temasDe } from "../tiempo-real/temas.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Viernes 2 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-02T17:00:00.000Z");
const MIN = 60_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let mesero: Contexto;
let cajera: Contexto;
let monitora: Contexto;
let otroMesero: Contexto;
const ids: Record<string, string> = {};

const linea = (nombre: string, cantidad = 1, extra: Record<string, unknown> = {}) => ({
  productId: ids[nombre]!,
  cantidad,
  precioMinor: nombre === "Tequeños" ? "450" : nombre === "Refresco" ? "150" : "100",
  ...extra,
});
const enviar = (ctx: Contexto, tableId: string, lineas: unknown[], pedidoId = randomUUID(), ahora = AHORA) =>
  l.app.pedidos.enviar(ctx, { pedidoId, tableId, lineas }, ahora);
const trabajosDe = (pedidoId: string) =>
  l.base.conTenant(l.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { orderId: pedidoId }, orderBy: { createdAt: "asc" } }));
/** La cola avanza como la mueve el agente: lo toma (ENVIADO) y luego sale o falla. */
const mover = (trabajoId: string, a: "CONFIRMADO" | "FALLIDO") =>
  l.base.conTenant(l.sistema.tenantId, async (tx) => {
    await tx.printJob.update({ where: { id: trabajoId }, data: { status: "ENVIADO", sentAt: new Date(AHORA) } });
    await tx.printJob.update({
      where: { id: trabajoId },
      data: { status: a, sentAt: null, finishedAt: new Date(AHORA + MIN), ...(a === "FALLIDO" ? { lastError: "La impresora no responde", attempts: 5 } : {}) },
    });
  });

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba pedidos");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba pedidos B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  const jesus = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "MESERO", pin: "3175" });
  otroMesero = await contextoDe(otro, await crearEquipo(otro, "Salón"), jesus, "3175");

  await planoDePrueba(l);
  await planoDePrueba(otro);
  await impresoraDePrueba(l);
  for (const [nombre, tipo, precioMinor] of [
    ["Tequeños", "PREPARADO", "450"],
    ["Refresco", "PRODUCTO", "150"],
    ["Galleta", "PREPARADO", "100"],
  ] as const) {
    const c: CatalogoDto = valor(
      await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre, categoria: "Carta", taxCode: "GENERAL", tipo, precioMinor } }, AHORA - 10 * MIN),
    );
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  valor(await l.app.productos.aplicar(l.sistema, { kind: "ACTIVAR", productId: ids["Galleta"]!, activo: false }, AHORA - 9 * MIN));
  valor(
    await l.app.entradas.registrar(
      l.sistema,
      { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: ids["Refresco"]!, bultos: 1, unidadesPorBulto: 2, costoBultoMinor: "100" }] },
      AHORA - 8 * MIN,
    ),
  );
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("enviar un pedido", () => {
  let primero: PedidoEnviadoDto;
  const pedidoId = randomUUID();

  test("sin impresora de comandas no se envía, y no queda nada escrito", async () => {
    const r = await otro.app.pedidos.enviar(otroMesero, { pedidoId: randomUUID(), tableId: "mesa-1", lineas: [{ productId: randomUUID(), cantidad: 1, precioMinor: "100" }] }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /impresora de comandas/);
    const cuentas = await otro.base.conTenant(otro.sistema.tenantId, (tx) => tx.account.count());
    assert.equal(cuentas, 0);
  });

  test("abre la cuenta de la mesa con sus platos y deja la comanda en la cola, todo junto", async () => {
    primero = valor(await enviar(mesero, "mesa-1", [linea("Tequeños", 2, { nota: "  sin salsa " })], pedidoId));
    const { pedido, cuenta } = primero;
    assert.equal(pedido.numero, 1);
    assert.equal(pedido.mesa, "1");
    assert.equal(pedido.enviadoPor, "Pedro Díaz");
    assert.deepEqual(pedido.lineas, [{ productId: ids["Tequeños"], nombre: "Tequeños", cantidad: 2, nota: "sin salsa" }]);
    assert.equal(pedido.comanda.estado, "EN_COLA");
    assert.equal(pedido.comanda.impresora, "Caja de prueba");
    assert.equal(cuenta.kind, "MESA");
    assert.equal(cuenta.tableId, "mesa-1");
    assert.equal(cuenta.status, "ABIERTA");
    assert.deepEqual(
      cuenta.lines.map((x) => [x.concept, x.amount.minor, x.productId, x.taxCode]),
      [
        ["Tequeños", "450", ids["Tequeños"], "GENERAL"],
        ["Tequeños", "450", ids["Tequeños"], "GENERAL"],
      ],
    );
    const [trabajo, ...mas] = await trabajosDe(pedidoId);
    assert.equal(mas.length, 0);
    assert.equal(trabajo!.kind, "COMANDA");
    assert.equal(trabajo!.title, "Comanda #0001 · Mesa 1");
    assert.equal(trabajo!.copy, false);
    const papel = JSON.stringify(trabajo!.content);
    assert.match(papel, /MESA 1/);
    assert.match(papel, /2 x Tequeños/);
    assert.match(papel, /sin salsa/);
    const version = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.accountVersion.findFirst({ where: { accountId: cuenta.id }, orderBy: { version: "desc" } }));
    assert.equal(version!.cause, "PEDIDO");
  });

  test("el asiento queda y el cambio sale en vivo: pedidos, cuentas e impresión", async () => {
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "kitchen_order", entityId: pedidoId });
    assert.equal(asientos.filter((a) => a.action === "pedido.enviar").length, 1);
    assert.deepEqual([...temasDe("pedido.enviar")].sort(), ["cuentas", "pedidos"]);
    const eventos = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.outboxEvent.findMany({ where: { action: { in: ["pedido.enviar", "impresion.encolar"] } } }));
    assert.deepEqual(eventos.map((e) => e.action).sort(), ["impresion.encolar", "pedido.enviar"]);
  });

  test("reenviar el mismo pedido (se cortó la red) no pide dos veces", async () => {
    const otraVez = valor(await enviar(mesero, "mesa-1", [linea("Tequeños", 2)], pedidoId, AHORA + MIN));
    assert.equal(otraVez.pedido.numero, 1);
    assert.equal(otraVez.cuenta.lines.length, 2);
    assert.equal((await trabajosDe(pedidoId)).length, 1);
  });

  test("otro pedido en la misma mesa suma a la misma cuenta, con la comanda siguiente", async () => {
    const segundo = valor(await enviar(cajera, "mesa-1", [linea("Refresco", 1)]));
    assert.equal(segundo.pedido.numero, 2);
    assert.equal(segundo.cuenta.id, primero.cuenta.id);
    assert.equal(segundo.cuenta.lines.length, 3);
  });

  test("si el precio cambió desde que la tablet lo enseñó, choca y no se escribe nada", async () => {
    const id = randomUUID();
    const r = await enviar(mesero, "mesa-2", [linea("Tequeños", 1, { precioMinor: "400" })], id);
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /El precio de Tequeños cambió/);
    assert.equal(await l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrder.count({ where: { id } })), 0);
  });

  test("lo que ya no se vende, no se pide; lo que no queda, tampoco", async () => {
    const apartado = await enviar(mesero, "mesa-2", [linea("Galleta")]);
    assert.equal(!apartado.ok && apartado.problemas?.[0]?.message, "NO_SE_VENDE");
    // Quedaba 1 refresco (se pidió otro arriba): dos no hay.
    const sinExistencia = await enviar(mesero, "mesa-2", [linea("Refresco", 2)]);
    assert.match(!sinExistencia.ok ? sinExistencia.mensaje : "", /Sin existencia de Refresco/);
    const ultimo = valor(await enviar(mesero, "mesa-2", [linea("Refresco", 1)]));
    assert.equal(ultimo.cuenta.tableId, "mesa-2");
    const catalogo = await l.app.productos.leer(l.sistema);
    assert.equal(catalogo.productos.find((p) => p.nombre === "Refresco")!.existencia, 0);
  });

  test("una mesa fuera del plano no recibe pedidos", async () => {
    const r = await enviar(mesero, "mesa-99", [linea("Tequeños")]);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_FUERA_DEL_PLANO", JSON.stringify(r));
  });

  test("quien no toma pedidos no los envía, y el intento queda en la auditoría", async () => {
    const r = await enviar(monitora, "mesa-3", [linea("Tequeños")]);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negados = await l.app.auditoria.listar(l.sistema, { actorId: monitora.quien!.userId! });
    assert.ok(negados.some((a) => a.action === "pedido.enviar" && a.outcome === "NEGADO"));
  });
});

describe("la comanda: si salió, y si no, se reimprime", () => {
  test("una comanda que no salió se ve en los pedidos, con su motivo", async () => {
    const { pedidos } = valor(await l.app.pedidos.leer(mesero, AHORA + 2 * MIN));
    const primero = pedidos.find((p) => p.numero === 1)!;
    await mover((await trabajosDe(primero.id))[0]!.id, "FALLIDO");
    const ahora = valor(await l.app.pedidos.leer(cajera, AHORA + 3 * MIN)).pedidos.find((p) => p.numero === 1)!;
    assert.equal(ahora.comanda.estado, "NO_SALIO");
    assert.equal(ahora.comanda.error, "La impresora no responde");
    // Del más nuevo al más viejo.
    assert.deepEqual(
      valor(await l.app.pedidos.leer(mesero, AHORA + 3 * MIN)).pedidos.map((p) => p.numero),
      [3, 2, 1],
    );
  });

  test("si no salió, se reintenta el mismo trabajo: la cocina nunca la vio, no es una reimpresión", async () => {
    const primero = valor(await l.app.pedidos.leer(mesero, AHORA + 3 * MIN)).pedidos.find((p) => p.numero === 1)!;
    const r = valor(await l.app.pedidos.reimprimir(mesero, { pedidoId: primero.id }, AHORA + 4 * MIN));
    assert.equal(r.comanda.estado, "EN_COLA");
    assert.equal(r.comanda.reimpresiones, 0);
    const trabajos = await trabajosDe(primero.id);
    assert.equal(trabajos.length, 1, "el mismo trabajo, no otro");
    assert.equal(trabajos[0]!.status, "PENDIENTE");
    assert.doesNotMatch(JSON.stringify(trabajos[0]!.content), /REIMPRESIÓN/);
    // Mientras se imprime, no se vuelve a mandar.
    const otraVez = await l.app.pedidos.reimprimir(mesero, { pedidoId: primero.id }, AHORA + 4 * MIN);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
  });

  test("ya impresa (se perdió el papel), sale una copia marcada «reimpresión»", async () => {
    const primero = valor(await l.app.pedidos.leer(mesero, AHORA + 4 * MIN)).pedidos.find((p) => p.numero === 1)!;
    await mover((await trabajosDe(primero.id))[0]!.id, "CONFIRMADO");
    assert.equal(valor(await l.app.pedidos.leer(mesero, AHORA + 5 * MIN)).pedidos.find((p) => p.numero === 1)!.comanda.estado, "IMPRESA");
    const r = valor(await l.app.pedidos.reimprimir(mesero, { pedidoId: primero.id }, AHORA + 6 * MIN));
    assert.equal(r.comanda.reimpresiones, 1);
    assert.equal(r.comanda.estado, "IMPRESA", "la que ya salió sigue contando");
    const [, copia] = await trabajosDe(primero.id);
    assert.equal(copia!.copy, true);
    assert.match(JSON.stringify(copia!.content), /REIMPRESIÓN/);
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "kitchen_order", entityId: primero.id });
    assert.deepEqual(asientos.filter((a) => a.action === "pedido.reimprimir").map((a) => (a.after as { como: string }).como).sort(), ["COPIA", "REINTENTO"]);
  });

  test("la monitora no ve los pedidos ni reimprime", async () => {
    const r = await l.app.pedidos.leer(monitora, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const { pedidos } = valor(await l.app.pedidos.leer(mesero, AHORA));
    const otraVez = await l.app.pedidos.reimprimir(monitora, { pedidoId: pedidos[0]!.id }, AHORA);
    assert.equal(!otraVez.ok && otraVez.motivo, "NO_PERMITIDO");
  });
});

describe("nada se borra y cada local ve lo suyo", () => {
  test("un pedido no se cambia ni se borra", async () => {
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrder.updateMany({ data: { tableLabel: "9" } })));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrder.deleteMany({})));
  });

  test("otro local no ve los pedidos de este ni reimprime sus comandas", async () => {
    assert.deepEqual(valor(await otro.app.pedidos.leer(otroMesero, AHORA)).pedidos, []);
    const { pedidos } = valor(await l.app.pedidos.leer(mesero, AHORA));
    const r = await otro.app.pedidos.reimprimir(otroMesero, { pedidoId: pedidos[0]!.id }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
  });
});
