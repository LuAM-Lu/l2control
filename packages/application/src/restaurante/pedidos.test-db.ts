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
import { abrirLocalDePrueba, contextoDe, crearCuenta, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

/** Un pedido como lo guardaba la versión de antes de B6-10: sus platos sin área, sin papel todavía. */
async function pedidoDeAntes(local: LocalDePrueba, ...productIds: string[]): Promise<string> {
  const id = randomUUID();
  const accountId = await crearCuenta(local, "MESA");
  const { tenantId, branchId } = local.sistema;
  await local.base.conTenant(tenantId, (tx) =>
    tx.kitchenOrder.create({
      data: {
        id,
        tenantId,
        branchId,
        accountId,
        number: 9_000,
        tableId: "mesa-3",
        tableLabel: "3",
        items: productIds.map((productId, i) => ({ productId, nombre: i === 0 ? "Hamburguesa" : "Agua", cantidad: 1, nota: null })),
        createdAt: new Date(AHORA),
        createdByName: "Prueba de antes",
      },
    }),
  );
  return id;
}

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
let supervisor: string;
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
  l.base.conTenant(l.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { orderId: pedidoId }, orderBy: [{ createdAt: "asc" }, { kind: "desc" }] }));
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
  supervisor = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
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
      { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: ids["Refresco"]!, bultos: 1, unidadesPorBulto: 2, costo: { por: "BULTO", minor: "100" } }] },
      AHORA - 8 * MIN,
    ),
  );
  // Una mesa sin cuenta no recibe pedidos (B6-9): se sienta primero a su cliente, como en el local.
  for (const mesa of ["mesa-1", "mesa-2", "mesa-4"]) await sentarDePrueba(l, mesero, mesa, AHORA - 5 * MIN);
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

  test("entra en la cuenta de la mesa con sus platos y deja la comanda en la cola, todo junto", async () => {
    primero = valor(await enviar(mesero, "mesa-1", [linea("Tequeños", 2, { nota: "  sin salsa " })], pedidoId));
    const { pedido, cuenta } = primero;
    assert.equal(pedido.numero, 1);
    assert.equal(pedido.mesa, "1");
    assert.equal(pedido.enviadoPor, "Pedro Díaz");
    assert.deepEqual(pedido.lineas, [{ productId: ids["Tequeños"], nombre: "Tequeños", cantidad: 2, nota: "sin salsa", area: "COCINA", servido: null }]);
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
    // La cuenta se llama como su cliente (B6-9): la comanda dice la mesa y su nombre, nunca su cédula ni su teléfono.
    assert.match(trabajo!.title, /^Comanda #0001 · Cocina · Mesa 1 · Prueba Cliente \d+$/);
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

  test("una mesa sin cuenta no la abre un pedido: se sienta primero a su cliente (B6-9)", async () => {
    const r = await enviar(mesero, "mesa-3", [linea("Tequeños")]);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_SIN_CUENTA", JSON.stringify(r));
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

describe("anular en cocina, con papel e inventario (B6-6, M-18)", () => {
  const conPin = { autorizadorId: "", pin: "5937", motivo: "Lo autorizo" };
  const existencia = async (nombre: string) =>
    (await l.app.productos.leer(l.sistema)).productos.find((p) => p.nombre === nombre)!.existencia!;
  const anular = (cuenta: PedidoEnviadoDto["cuenta"], lineIds: string[], preparado: boolean) =>
    l.app.cuentas.anularPedido(
      mesero,
      { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cuenta.version, lineIds, motivo: "CLIENTE_DESISTIO", preparado },
      { ...conPin, autorizadorId: supervisor },
      AHORA,
    );
  const platosDe = (cuenta: PedidoEnviadoDto["cuenta"], pedidoId: string) => cuenta.lines.filter((l) => l.orderId === pedidoId).map((l) => l.id);

  before(async () => {
    valor(
      await l.app.entradas.registrar(
        l.sistema,
        { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: ids["Refresco"]!, bultos: 1, unidadesPorBulto: 6, costo: { por: "BULTO", minor: "600" } }] },
        AHORA - 5 * MIN,
      ),
    );
  });

  test("sin preparar: no se cobra, vuelve al estante y a cada área le sale su papel «ANULAR», todo de una vez", async () => {
    const antes = await existencia("Refresco");
    const pedidoId = randomUUID();
    const { cuenta } = valor(await enviar(mesero, "mesa-4", [linea("Refresco", 2), linea("Tequeños")], pedidoId));
    assert.equal(await existencia("Refresco"), antes - 2);

    const r = valor(await anular(cuenta, platosDe(cuenta, pedidoId), false));
    assert.ok(r.lines.filter((x) => x.orderId === pedidoId).every((x) => x.anulacion?.preparado === false));
    assert.equal(await existencia("Refresco"), antes, "lo que no se preparó vuelve al estante");

    // El refresco salió en la comanda de barra y los tequeños en la de cocina (B6-10): cada área recibe su «ANULAR».
    const trabajos = await trabajosDe(pedidoId);
    assert.deepEqual(trabajos.map((t) => `${t.kind}:${t.area}`).sort(), ["ANULACION:BARRA", "ANULACION:COCINA", "COMANDA:BARRA", "COMANDA:COCINA"]);
    const barra = trabajos.find((t) => t.kind === "ANULACION" && t.area === "BARRA")!;
    const cocina = trabajos.find((t) => t.kind === "ANULACION" && t.area === "COCINA")!;
    assert.match(barra.title, /Anular · comanda #\d{4} · Barra · Mesa 4/);
    const texto = JSON.stringify(barra.content);
    assert.match(texto, /ANULAR · NO PREPARAR/);
    assert.match(texto, /"BARRA"/);
    assert.match(texto, /2 x Refresco/);
    assert.doesNotMatch(texto, /Tequeños/);
    assert.match(texto, /Luis Guerrero/);
    assert.match(JSON.stringify(cocina.content), /1 x Tequeños/);
    assert.doesNotMatch(JSON.stringify(cocina.content), /Refresco/);

    // La comanda sigue siendo la comanda: el papel de anulación se ve aparte y no la cambia.
    const { pedidos } = valor(await l.app.pedidos.leer(mesero, AHORA));
    const leido = pedidos.find((p) => p.id === pedidoId)!;
    assert.equal(leido.comanda.estado, "EN_COLA");
    assert.equal(leido.comanda.reimpresiones, 0);
    assert.deepEqual(leido.anulacion, { estado: "EN_COLA", error: null });
    assert.equal(leido.anulaciones.length, 2);
    await mover(barra.id, "FALLIDO");
    const tras = valor(await l.app.pedidos.leer(mesero, AHORA)).pedidos.find((p) => p.id === pedidoId)!;
    assert.deepEqual(tras.anulacion, { estado: "NO_SALIO", error: "La impresora no responde" });
    assert.equal(tras.anulaciones.find((a) => a.area === "BARRA")?.estado, "NO_SALIO");
    assert.equal(tras.anulaciones.find((a) => a.area === "COCINA")?.estado, "EN_COLA");
  });

  test("ya preparado: la existencia no vuelve y sale como merma, con su costo y quien lo autorizó", async () => {
    const antes = await existencia("Refresco");
    const pedidoId = randomUUID();
    const { cuenta } = valor(await enviar(mesero, "mesa-4", [linea("Refresco", 1)], pedidoId));
    const r = valor(await anular(cuenta, platosDe(cuenta, pedidoId), true));
    assert.equal(await existencia("Refresco"), antes - 1, "lo preparado no vuelve al estante");
    assert.equal(r.lines.find((x) => x.orderId === pedidoId)!.anulacion?.preparado, true);

    const merma = await l.base.conTenant(l.sistema.tenantId, (tx) =>
      tx.stockAdjustment.findFirst({ where: { reason: "MERMA" }, orderBy: { at: "desc" }, include: { movements: true } }),
    );
    assert.ok(merma, "queda la salida por merma");
    assert.equal(merma.kind, "SALIDA");
    assert.equal(merma.authorizedBy, supervisor);
    assert.match(merma.note ?? "", /Anulado ya preparado · comanda #\d{4} · Mesa 4/);
    assert.deepEqual(merma.movements.map((m) => [m.quantity, m.valueMinor < 0n]), [[-1, true]]);
    const devuelto = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.stockMovement.findMany({ where: { accountId: cuenta.id, kind: "DEVOLUCION" } }));
    assert.ok(devuelto.some((m) => m.quantity === 1 && m.productId === ids["Refresco"]));
  });

  test("sin impresora de comandas no se anula: la cocina no se enteraría", async () => {
    const pedidoId = randomUUID();
    const { cuenta } = valor(await enviar(mesero, "mesa-4", [linea("Tequeños")], pedidoId));
    const impresoras = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.printer.findMany({ where: { active: true, forOrders: true }, select: { id: true } }));
    for (const i of impresoras) valor(await l.app.impresion.aplicar(l.sistema, { kind: "ACTIVAR", impresoraId: i.id, activa: false }));
    try {
      const r = await anular(cuenta, platosDe(cuenta, pedidoId), false);
      assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE", JSON.stringify(r));
      assert.match(!r.ok ? r.mensaje : "", /impresora de comandas/);
      const sigue = valor(await l.app.cuentas.leer(l.sistema, AHORA)).cuentas.find((c) => c.id === cuenta.id)!;
      assert.ok(sigue.lines.filter((x) => x.orderId === pedidoId).every((x) => x.anulacion === undefined), "no se anuló nada");
    } finally {
      for (const i of impresoras) valor(await l.app.impresion.aplicar(l.sistema, { kind: "ACTIVAR", impresoraId: i.id, activa: true }));
    }
  });

  test("la monitora no anula, y el intento no deja papel", async () => {
    const pedidoId = randomUUID();
    const { cuenta } = valor(await enviar(mesero, "mesa-4", [linea("Tequeños")], pedidoId));
    const r = await l.app.cuentas.anularPedido(
      monitora,
      { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cuenta.version, lineIds: platosDe(cuenta, pedidoId), motivo: "CLIENTE_DESISTIO", preparado: false },
      { ...conPin, autorizadorId: supervisor },
      AHORA,
    );
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    assert.deepEqual((await trabajosDe(pedidoId)).map((t) => t.kind), ["COMANDA"]);
  });
});

describe("servido en la mesa (B6-8, D-SERV)", () => {
  test("el mesero lo marca una vez: ahí termina su espera, queda en el pedido y en la auditoría", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Refresco")], id, AHORA));
    const r = valor(await l.app.pedidos.servir(mesero, { pedidoId: id }, AHORA + 12 * MIN));
    assert.deepEqual(r.servido, { en: new Date(AHORA + 12 * MIN).toISOString(), por: "Pedro Díaz" });
    // Otra tablet lo marca después: queda como estaba.
    const otra = valor(await l.app.pedidos.servir(cajera, { pedidoId: id }, AHORA + 20 * MIN));
    assert.deepEqual(otra.servido, r.servido);
    const leidos = valor(await l.app.pedidos.leer(mesero, AHORA + 21 * MIN)).pedidos;
    assert.deepEqual(leidos.find((p) => p.id === id)?.servido, r.servido);
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "kitchen_order", entityId: id });
    assert.deepEqual(asientos.filter((a) => a.action === "pedido.servir").map((a) => (a.after as { esperaMin: number }).esperaMin), [12]);
    assert.deepEqual([...temasDe("pedido.servir")], ["pedidos"]);
  });

  test("quien no toma pedidos no lo marca; un pedido de otro local no existe aquí", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Refresco")], id, AHORA));
    const r = await l.app.pedidos.servir(monitora, { pedidoId: id }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const ajeno = await l.app.pedidos.servir(otroMesero, { pedidoId: id }, AHORA);
    assert.equal(ajeno.ok, false);
    assert.equal(valor(await l.app.pedidos.leer(mesero, AHORA)).pedidos.find((p) => p.id === id)?.servido, null);
  });
});

describe("servido por plato (B6-11)", () => {
  const marcasDe = (id: string) => l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrderLineServed.findMany({ where: { orderId: id }, orderBy: { at: "asc" } }));
  const enteroDe = (id: string) => l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrderServed.findMany({ where: { orderId: id } }));
  const iso = (ms: number) => new Date(ms).toISOString();

  test("cada plato se marca solo; el pedido queda servido con el último, también para la versión de antes", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Refresco"), linea("Tequeños")], id, AHORA));
    let p = valor(await l.app.pedidos.servir(mesero, { pedidoId: id, lineas: [1] }, AHORA + 5 * MIN));
    assert.deepEqual(
      p.lineas.map((x) => x.servido?.en ?? null),
      [null, iso(AHORA + 5 * MIN)],
    );
    assert.equal(p.servido, null, "le falta un plato: sigue esperando");
    assert.equal((await enteroDe(id)).length, 0);
    // «Servir todo»: lo que falte; lo ya servido queda como estaba.
    p = valor(await l.app.pedidos.servir(cajera, { pedidoId: id }, AHORA + 9 * MIN));
    assert.deepEqual(
      p.lineas.map((x) => x.servido?.en ?? null),
      [iso(AHORA + 9 * MIN), iso(AHORA + 5 * MIN)],
    );
    assert.deepEqual(p.servido, { en: iso(AHORA + 9 * MIN), por: "Marisol Prieto" });
    assert.equal((await enteroDe(id)).length, 1, "la versión de antes lo ve servido");
    assert.equal((await marcasDe(id)).length, 2);
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "kitchen_order", entityId: id });
    assert.deepEqual(
      asientos.filter((a) => a.action === "pedido.servir").flatMap((a) => (a.after as { platos: string[] }).platos).sort(),
      ["Refresco", "Tequeños"],
    );
  });

  test("deshacer en el momento deja el plato y el pedido sin servir; pasado el momento, no", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Refresco"), linea("Tequeños")], id, AHORA));
    valor(await l.app.pedidos.servir(mesero, { pedidoId: id }, AHORA + 10 * MIN));
    let p = valor(await l.app.pedidos.deshacerServido(mesero, { pedidoId: id, linea: 0 }, AHORA + 12 * MIN));
    assert.equal(p.lineas[0]!.servido, null);
    assert.notEqual(p.lineas[1]!.servido, null);
    assert.equal(p.servido, null, "le vuelve a faltar un plato");
    // Deshacer lo que no está servido no hace nada.
    p = valor(await l.app.pedidos.deshacerServido(mesero, { pedidoId: id, linea: 0 }, AHORA + 12 * MIN));
    assert.equal((await marcasDe(id)).filter((m) => m.kind === "DESHECHO").length, 1);
    p = valor(await l.app.pedidos.servir(mesero, { pedidoId: id, lineas: [0] }, AHORA + 13 * MIN));
    assert.equal(p.servido?.en, iso(AHORA + 13 * MIN));
    const tarde = await l.app.pedidos.deshacerServido(mesero, { pedidoId: id, linea: 0 }, AHORA + 13 * MIN + 6 * MIN);
    assert.equal(!tarde.ok && tarde.motivo, "CONFLICTO");
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "kitchen_order", entityId: id });
    assert.deepEqual(asientos.filter((a) => a.action === "pedido.deshacer_servido").map((a) => (a.after as { plato: string }).plato), ["Refresco"]);
    assert.deepEqual([...temasDe("pedido.deshacer_servido")], ["pedidos"]);
  });

  test("lo marcado por pedido antes de este paso cuenta como todo servido, y se deshace un plato sin tocar los otros", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Refresco"), linea("Tequeños")], id, AHORA));
    // Como lo dejaba B6-8: el pedido entero, sin marcas por plato.
    await l.base.conTenant(l.sistema.tenantId, (tx) =>
      tx.kitchenOrderServed.create({ data: { tenantId: l.sistema.tenantId, orderId: id, servedAt: new Date(AHORA + 8 * MIN), servedName: "Pedro Díaz" } }),
    );
    let p = valor(await l.app.pedidos.leer(mesero, AHORA + 9 * MIN)).pedidos.find((x) => x.id === id)!;
    assert.deepEqual(
      p.lineas.map((x) => x.servido?.en ?? null),
      [iso(AHORA + 8 * MIN), iso(AHORA + 8 * MIN)],
    );
    assert.equal(p.servido?.en, iso(AHORA + 8 * MIN));
    p = valor(await l.app.pedidos.deshacerServido(mesero, { pedidoId: id, linea: 1 }, AHORA + 10 * MIN));
    assert.deepEqual(
      p.lineas.map((x) => x.servido?.en ?? null),
      [iso(AHORA + 8 * MIN), null],
    );
    assert.equal(p.servido, null);
  });

  test("un plato que no es del pedido no se marca, y las marcas no se cambian ni se borran", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Tequeños")], id, AHORA));
    const r = await l.app.pedidos.servir(mesero, { pedidoId: id, lineas: [3] }, AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    valor(await l.app.pedidos.servir(mesero, { pedidoId: id }, AHORA));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrderLineServed.updateMany({ where: { orderId: id }, data: { kind: "DESHECHO" } })));
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.kitchenOrderLineServed.deleteMany({ where: { orderId: id } })));
  });
});

describe("la comanda de cocina y la de barra (B6-10)", () => {
  let barra: string;
  let local: LocalDePrueba;
  let meseroB: Contexto;
  const productos: Record<string, string> = {};
  const lineaB = (nombre: string, cantidad = 1) => ({ productId: productos[nombre]!, cantidad, precioMinor: "200" });
  const enviarB = (lineas: unknown[], pedidoId = randomUUID()) => local.app.pedidos.enviar(meseroB, { pedidoId, tableId: "mesa-1", lineas }, AHORA);
  const trabajosB = (pedidoId: string) =>
    local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { orderId: pedidoId }, include: { printer: { select: { name: true } } }, orderBy: { createdAt: "asc" } }));

  before(async () => {
    local = await abrirLocalDePrueba(URL_APP, "Prueba barra");
    const rosa = await crearPersona(local, { nombre: "Rosa Peña", role: "MESERO", pin: "3175" });
    meseroB = await contextoDe(local, await crearEquipo(local, "Salón"), rosa, "3175");
    await planoDePrueba(local);
    // Una de cocina (que también hace recibos) y otra de barra.
    const cocina = await impresoraDePrueba(local, "192.168.250.251");
    valor(await local.app.impresion.aplicar(local.sistema, { kind: "ACTIVAR", impresoraId: cocina, activa: false }));
    const datos = (nombre: string, ip: string, marcas: { recibos: boolean; comandas: boolean; barra: boolean }) => ({
      nombre,
      ip,
      puerto: 9100,
      ancho: 80,
      ...marcas,
      enVlanDeHardware: true,
      ipFija: true,
    });
    valor(await local.app.impresion.aplicar(local.sistema, { kind: "EDITAR", impresoraId: cocina, datos: datos("Cocina de prueba", "192.168.250.251", { recibos: true, comandas: true, barra: false }) }));
    valor(await local.app.impresion.aplicar(local.sistema, { kind: "ACTIVAR", impresoraId: cocina, activa: true }));
    const r = valor(await local.app.impresion.aplicar(local.sistema, { kind: "CREAR", datos: datos("Barra de prueba", "192.168.250.252", { recibos: false, comandas: false, barra: true }) }));
    barra = r.local.impresoras.find((i) => i.nombre === "Barra de prueba")!.id;
    for (const [nombre, tipo, area] of [
      ["Hamburguesa", "PREPARADO", undefined],
      ["Batido", "PREPARADO", "BARRA"],
      ["Agua", "PRODUCTO", undefined],
      ["Descorche", "SERVICIO", undefined],
    ] as const) {
      const c = valor(
        await local.app.productos.aplicar(
          local.sistema,
          { kind: "CREAR", producto: { nombre, categoria: "Carta", taxCode: "GENERAL", tipo, precioMinor: "200", enCarta: true, ...(area ? { area } : {}) } },
          AHORA - 10 * MIN,
        ),
      );
      productos[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
    }
    // El agua se cuenta: entra antes de pedirla.
    valor(
      await local.app.entradas.registrar(
        local.sistema,
        { idempotencyKey: randomUUID(), tipo: "INICIAL", lineas: [{ productId: productos["Agua"]!, bultos: 1, unidadesPorBulto: 10, costo: { por: "BULTO", minor: "500" } }] },
        AHORA - 9 * MIN,
      ),
    );
    await sentarDePrueba(local, meseroB, "mesa-1", AHORA - 5 * MIN);
  });

  after(async () => {
    await local.cerrar();
  });

  test("el área de cada producto: la de su tipo, o la elegida al crearlo, en la ficha o en lote", async () => {
    let c = await local.app.productos.leer(local.sistema);
    const area = (n: string) => c.productos.find((p) => p.nombre === n)!;
    assert.deepEqual([area("Hamburguesa").area, area("Hamburguesa").areaDeSuTipo], ["COCINA", true]);
    assert.deepEqual([area("Batido").area, area("Batido").areaDeSuTipo], ["BARRA", false]);
    assert.equal(area("Agua").area, "BARRA");
    assert.equal(area("Descorche").area, "SIN_PAPEL");
    c = valor(await local.app.productos.aplicar(local.sistema, { kind: "AREA", productId: productos["Descorche"]!, area: "COCINA" }, AHORA - 8 * MIN));
    assert.equal(area("Descorche").area, "COCINA");
    c = valor(await local.app.productos.editarEnLote(local.sistema, { productIds: [productos["Descorche"]!], cambio: { kind: "AREA", area: "SIN_PAPEL" } }, AHORA - 8 * MIN));
    assert.deepEqual([area("Descorche").area, area("Descorche").areaDeSuTipo], ["SIN_PAPEL", true]);
  });

  test("sin la impresora de barra encendida, un pedido con algo de barra no se envía; uno solo de cocina, sí", async () => {
    const r = await enviarB([lineaB("Hamburguesa"), lineaB("Agua")]);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /comandas de barra/);
    const solo = valor(await enviarB([lineaB("Hamburguesa")]));
    assert.deepEqual(solo.pedido.comandas.map((c) => c.area), ["COCINA"]);
    valor(await local.app.impresion.aplicar(local.sistema, { kind: "ACTIVAR", impresoraId: barra, activa: true }));
  });

  test("un papel por área, cada uno en su impresora, rotulado y con «1 de 2»; lo sin papel no sale", async () => {
    const pedidoId = randomUUID();
    const { pedido } = valor(await enviarB([lineaB("Agua", 2), lineaB("Hamburguesa"), lineaB("Descorche"), lineaB("Batido")], pedidoId));
    assert.deepEqual(
      pedido.lineas.map((x) => [x.nombre, x.area]),
      [
        ["Agua", "BARRA"],
        ["Hamburguesa", "COCINA"],
        ["Descorche", "SIN_PAPEL"],
        ["Batido", "BARRA"],
      ],
    );
    assert.deepEqual(
      pedido.comandas.map((c) => [c.area, c.estado, c.impresora]),
      [
        ["COCINA", "EN_COLA", "Cocina de prueba"],
        ["BARRA", "EN_COLA", "Barra de prueba"],
      ],
    );
    const trabajos = await trabajosB(pedidoId);
    assert.equal(trabajos.length, 2);
    const cocina = trabajos.find((t) => t.area === "COCINA")!;
    const deBarra = trabajos.find((t) => t.area === "BARRA")!;
    assert.equal(cocina.printer.name, "Cocina de prueba");
    assert.equal(deBarra.printer.name, "Barra de prueba");
    assert.match(cocina.title, /^Comanda #\d{4} · Cocina · Mesa 1/);
    const textoCocina = JSON.stringify(cocina.content);
    const textoBarra = JSON.stringify(deBarra.content);
    assert.match(textoCocina, /COCINA · 1 de 2/);
    assert.match(textoBarra, /BARRA · 2 de 2/);
    assert.match(textoCocina, /1 x Hamburguesa/);
    assert.doesNotMatch(textoCocina, /Agua|Batido|Descorche/);
    assert.match(textoBarra, /2 x Agua/);
    assert.match(textoBarra, /1 x Batido/);
    assert.doesNotMatch(textoBarra, /Hamburguesa|Descorche/);

    // Cada papel se sigue y se reimprime por su cuenta: la barra no salió, la cocina sí.
    const mover2 = (id: string, a: "CONFIRMADO" | "FALLIDO") =>
      local.base.conTenant(local.sistema.tenantId, async (tx) => {
        await tx.printJob.update({ where: { id }, data: { status: "ENVIADO", sentAt: new Date(AHORA) } });
        await tx.printJob.update({ where: { id }, data: { status: a, sentAt: null, finishedAt: new Date(AHORA + MIN), ...(a === "FALLIDO" ? { lastError: "Sin papel", attempts: 5 } : {}) } });
      });
    await mover2(cocina.id, "CONFIRMADO");
    await mover2(deBarra.id, "FALLIDO");
    let leido = valor(await local.app.pedidos.leer(meseroB, AHORA)).pedidos.find((p) => p.id === pedidoId)!;
    assert.deepEqual(
      leido.comandas.map((c) => [c.area, c.estado]),
      [
        ["COCINA", "IMPRESA"],
        ["BARRA", "NO_SALIO"],
      ],
    );
    assert.deepEqual([leido.comanda.estado, leido.comanda.error, leido.comanda.impresora], ["NO_SALIO", "Sin papel", "Barra de prueba"]);

    const sinArea = await local.app.pedidos.reimprimir(meseroB, { pedidoId }, AHORA);
    assert.equal(!sinArea.ok && sinArea.motivo, "INVALIDO", "con dos papeles, se dice cuál");
    leido = valor(await local.app.pedidos.reimprimir(meseroB, { pedidoId, area: "BARRA" }, AHORA));
    assert.deepEqual(
      leido.comandas.map((c) => [c.area, c.estado, c.reimpresiones]),
      [
        ["COCINA", "IMPRESA", 0],
        ["BARRA", "EN_COLA", 0],
      ],
    );
    // La de cocina salió y se perdió el papel: una copia, solo de cocina.
    leido = valor(await local.app.pedidos.reimprimir(meseroB, { pedidoId, area: "COCINA" }, AHORA));
    assert.equal(leido.comandas.find((c) => c.area === "COCINA")!.reimpresiones, 1);
    const despues = await trabajosB(pedidoId);
    assert.equal(despues.length, 3);
    assert.equal(despues.filter((t) => t.area === "BARRA").length, 1, "la de barra se reintentó en el mismo trabajo");
  });

  test("un pedido de solo cosas sin papel no saca comanda", async () => {
    const pedidoId = randomUUID();
    const { pedido } = valor(await enviarB([lineaB("Descorche")], pedidoId));
    assert.deepEqual(pedido.comandas, []);
    assert.equal(pedido.comanda.estado, "SIN_PAPEL");
    assert.equal((await trabajosB(pedidoId)).length, 0);
    const r = await local.app.pedidos.reimprimir(meseroB, { pedidoId }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
  });

  test("un pedido de antes de este paso es un solo papel, con todo, en la de cocina", async () => {
    const pedidoId = await pedidoDeAntes(local, productos["Hamburguesa"]!, productos["Agua"]!);
    const leido = valor(await local.app.pedidos.leer(meseroB, AHORA)).pedidos.find((p) => p.id === pedidoId)!;
    assert.deepEqual(leido.comandas.map((c) => c.area), [null]);
    const r = valor(await local.app.pedidos.reimprimir(meseroB, { pedidoId }, AHORA));
    assert.equal(r.comandas[0]!.estado, "EN_COLA");
    const [t] = await trabajosB(pedidoId);
    assert.equal(t!.area, null);
    assert.equal(t!.printer.name, "Cocina de prueba");
    assert.match(JSON.stringify(t!.content), /Hamburguesa[\s\S]*Agua/);
  });

  test("una impresora no se enciende para la barra si otra ya la tiene", async () => {
    const r = valor(await local.app.impresion.aplicar(local.sistema, { kind: "CREAR", datos: { nombre: "Otra barra", ip: "192.168.250.253", puerto: 9100, ancho: 80, recibos: false, comandas: false, barra: true, enVlanDeHardware: true, ipFija: true } }));
    const otra = r.local.impresoras.find((i) => i.nombre === "Otra barra")!.id;
    const a = await local.app.impresion.aplicar(local.sistema, { kind: "ACTIVAR", impresoraId: otra, activa: true });
    assert.equal(!a.ok && a.motivo, "CONFLICTO");
    assert.match(!a.ok ? a.mensaje : "", /comandas de barra/);
  });
});

describe("notas rápidas del mesero (B6-12)", () => {
  test("las más escritas para el plato, iguales sin mayúsculas ni espacios de más; con pocas, las de su categoría; de los últimos 60 días", async () => {
    valor(
      await l.app.entradas.registrar(
        l.sistema,
        { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: ids["Refresco"]!, bultos: 1, unidadesPorBulto: 6, costo: { por: "BULTO", minor: "600" } }] },
        AHORA - 5 * MIN,
      ),
    );
    const conNota = async (nombre: string, nota: string) => valor(await enviar(mesero, "mesa-2", [linea(nombre, 1, { nota })]));
    for (const nota of ["Extra queso", "extra  queso", "EXTRA QUESO", "para llevar"]) await conNota("Tequeños", nota);
    for (const nota of ["sin hielo", "Sin hielo"]) await conNota("Refresco", nota);
    const r = valor(await l.app.pedidos.notasRapidas(mesero, { productId: ids["Tequeños"] }, AHORA + MIN));
    assert.equal(r.notas[0]?.toLowerCase(), "extra queso", "la más escrita: tres veces, con sus mayúsculas y espacios");
    assert.ok(r.notas.includes("para llevar"));
    assert.ok(r.notas.some((n) => n.toLowerCase() === "sin hielo"), "con pocas, completa con las de su categoría");
    assert.equal(new Set(r.notas.map((n) => n.toLowerCase().replace(/\s+/g, " "))).size, r.notas.length, "sin repetir");
    assert.ok(r.notas.length <= 5);
    // Pasados 60 días, ya no cuentan.
    assert.deepEqual(valor(await l.app.pedidos.notasRapidas(mesero, { productId: ids["Tequeños"] }, AHORA + 61 * 86_400_000)).notas, []);
    // Quien no toma pedidos no las pide; otro local no ve las de este.
    const r2 = await l.app.pedidos.notasRapidas(monitora, { productId: ids["Tequeños"] }, AHORA);
    assert.equal(!r2.ok && r2.motivo, "NO_PERMITIDO");
    assert.deepEqual(valor(await otro.app.pedidos.notasRapidas(otroMesero, { productId: ids["Tequeños"] }, AHORA)).notas, []);
  });
});

describe("servir y cerrar la mesa (B6-13)", () => {
  test("«¿Ya se sirvió todo?» al pedir la cuenta: servidos sin hora exacta", async () => {
    const id = randomUUID();
    valor(await enviar(mesero, "mesa-4", [linea("Tequeños", 2)], id, AHORA));
    const p = valor(await l.app.pedidos.servir(mesero, { pedidoId: id, sinHora: true }, AHORA + 30 * MIN));
    assert.equal(p.lineas[0]!.servido?.sinHora, true);
    assert.notEqual(p.servido, null, "el pedido queda servido");
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "kitchen_order", entityId: id });
    assert.equal((asientos.find((a) => a.action === "pedido.servir")?.after as { sinHora?: boolean }).sinHora, true);
  });

  test("cerrar la mesa sin cobrar: de supervisión con su PIN; anula todo, con su papel, y la deja libre", async () => {
    const ctxSupervisor = await contextoDe(l, await crearEquipo(l, "Salón de supervisión"), supervisor, "5937");
    await sentarDePrueba(l, mesero, "mesa-3", AHORA - MIN);
    const id = randomUUID();
    const { cuenta } = valor(await enviar(mesero, "mesa-3", [linea("Tequeños", 2)], id, AHORA));
    const cmd = { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cuenta.version, motivo: "CLIENTE_DESISTIO", preparado: false };
    // El mesero no: ni con la autorización de supervisión (es de quien lo tiene permitido).
    const delMesero = await l.app.cuentas.cerrarSinCobrar(mesero, cmd, { autorizadorId: supervisor, pin: "5937", motivo: "Lo autorizo" }, AHORA);
    assert.equal(!delMesero.ok && delMesero.motivo, "NO_PERMITIDO");
    const cerrada = valor(await l.app.cuentas.cerrarSinCobrar(ctxSupervisor, cmd, { autorizadorId: supervisor, pin: "5937", motivo: "No consumió" }, AHORA + MIN));
    assert.equal(cerrada.status, "SIN_CONSUMO");
    assert.ok(cerrada.lines.filter((x) => x.orderId === id).every((x) => x.anulacion?.motivo === "CLIENTE_DESISTIO"));
    assert.deepEqual((await trabajosDe(id)).map((t) => t.kind).sort(), ["ANULACION", "COMANDA"]);
    // Repetirlo devuelve la cuenta como quedó.
    const otra = valor(await l.app.cuentas.cerrarSinCobrar(ctxSupervisor, cmd, { autorizadorId: supervisor, pin: "5937", motivo: "No consumió" }, AHORA + MIN));
    assert.equal(otra.version, cerrada.version);
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "account", entityId: cuenta.id });
    assert.ok(asientos.some((a) => a.action === "mesa.cerrar_sin_cobrar"));
  });
});
