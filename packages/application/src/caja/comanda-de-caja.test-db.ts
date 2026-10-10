/**
 * La comanda de la venta directa, contra l2control_test — B6-16 (M-37).
 *
 * Lo que fijan: al cobrar una venta de la caja, lo de cocina y de barra sale en su comanda (un papel por área, «CAJA» y
 * a quién va, con la nota de cada producto) y lo que no se prepara, no; al dejarla pendiente sale ya, y al cobrarla
 * después solo sale lo nuevo; sin la impresora de un área no se cobra y no queda nada escrito; y una pantalla no quita
 * lo que ya salió ni marca una línea como enviada.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, FACTURA_DE_PRUEBA, impresoraDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T18:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;

let local: LocalDePrueba;
let sinImpresora: LocalDePrueba;
let marisol: Contexto;
let otraCajera: Contexto;
const productos: Record<string, Record<string, string>> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

async function prepararLocal(l: LocalDePrueba, ctx: Contexto) {
  const FONDO = { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  valor(await l.app.turnos.abrir(ctx, FONDO, undefined, AHORA - 2 * MIN));
  valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 10 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 10 * MIN));
  }
  const ids: Record<string, string> = {};
  for (const [nombre, area, precio] of [
    ["Hamburguesa", "COCINA", "500"],
    ["Limonada", "BARRA", "200"],
    ["Agua mineral", "SIN_PAPEL", "100"],
  ] as const) {
    const c = valor(await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre, categoria: "Comidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: precio, area } }, AHORA - 5 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  return ids;
}

const linea = (l: LocalDePrueba, nombre: string, precio: string, nota?: string) => ({
  id: randomUUID(),
  concept: nombre,
  kind: "RESTAURANTE",
  amount: usd(precio),
  paid: false,
  productId: productos[l.sistema.tenantId]![nombre]!,
  taxCode: "GENERAL",
  ...(nota ? { nota } : {}),
});
const venta = async (l: LocalDePrueba, ctx: Contexto, lines: unknown[]) =>
  valor(
    await l.app.cuentas.guardar(
      ctx,
      { cuenta: { id: randomUUID(), kind: "MOSTRADOR", family: "Mostrador", mode: "PREPAGO", status: "POR_COBRAR", openedAt: new Date(AHORA).toISOString(), sessionIds: [], closedSessionIds: [], lines } },
      AHORA,
    ),
  );
const cobrar = (l: LocalDePrueba, ctx: Contexto, c: FamilyAccountDto, totalMinor: string) =>
  l.app.cuentas.cobrar(
    ctx,
    {
      idempotencyKey: randomUUID(),
      accountId: c.id,
      version: c.version,
      lineIds: c.lines.filter((x) => !x.paid && !x.movedTo).map((x) => x.id),
      total: usd(totalMinor),
      pagos: [{ method: "EFECTIVO_USD", amount: usd(totalMinor) }],
      destinoSobra: "VUELTO",
      cliente: FACTURA_DE_PRUEBA,
    },
    AHORA + MIN,
  );
const pedidosDe = (l: LocalDePrueba, accountId: string) =>
  l.base.conTenant(l.sistema.tenantId, (tx) =>
    tx.kitchenOrder.findMany({ where: { accountId }, orderBy: { number: "asc" }, include: { printJobs: { select: { area: true, kind: true } } } }),
  );

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Comanda de la caja");
  sinImpresora = await abrirLocalDePrueba(URL_APP, "Comanda de la caja sin impresora");
  await impresoraDePrueba(local);
  const a = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  marisol = await contextoDe(local, await crearEquipo(local, "Caja 1"), a, "7391");
  const b = await crearPersona(sinImpresora, { nombre: "Luis Guerrero", role: "CAJERO", pin: "5937" });
  otraCajera = await contextoDe(sinImpresora, await crearEquipo(sinImpresora, "Caja 1"), b, "5937");
  productos[local.sistema.tenantId] = await prepararLocal(local, marisol);
  productos[sinImpresora.sistema.tenantId] = await prepararLocal(sinImpresora, otraCajera);
});

after(async () => {
  await Promise.all([local.cerrar(), sinImpresora.cerrar()]);
});

describe("la comanda de la venta directa (B6-16)", () => {
  test("al cobrarla, lo de cocina y de barra sale en su comanda, con su nota; lo que no se prepara, no", async () => {
    const c = await venta(local, marisol, [linea(local, "Hamburguesa", "500", "Sin cebolla"), linea(local, "Limonada", "200"), linea(local, "Agua mineral", "100")]);
    // $ 8,00 + IVA = $ 9,28.
    const r = valor(await cobrar(local, marisol, c, "928"));
    const [pedido, ...otros] = await pedidosDe(local, c.id);
    assert.equal(otros.length, 0);
    assert.equal(pedido!.tableId, null);
    assert.equal(pedido!.tableLabel, "Caja");
    assert.equal(pedido!.accountLabel, FACTURA_DE_PRUEBA.name.slice(0, 40));
    assert.deepEqual(
      (pedido!.items as { nombre: string; nota: string | null; area: string }[]).map((i) => [i.nombre, i.nota, i.area]),
      [
        ["Hamburguesa", "Sin cebolla", "COCINA"],
        ["Limonada", null, "BARRA"],
      ],
    );
    assert.deepEqual(pedido!.printJobs.map((j) => j.area).sort(), ["BARRA", "COCINA"]);
    assert.deepEqual(r.cuenta.lines.map((l) => [l.concept, l.orderId === pedido!.id]), [
      ["Hamburguesa", true],
      ["Limonada", true],
      ["Agua mineral", false],
    ]);
  });

  test("dejada pendiente sale ya; cobrada después, solo sale lo nuevo", async () => {
    const c = await venta(local, marisol, [linea(local, "Hamburguesa", "500")]);
    const pendiente = valor(await local.app.clientes.asignar(marisol, { idempotencyKey: randomUUID(), accountId: c.id, cliente: { nombre: "Prueba Cliente Pendiente", cedula: "V-30111222", telefono: "0414-5550001" } }, undefined, AHORA));
    assert.equal((await pedidosDe(local, c.id)).length, 1);
    assert.ok(pendiente.lines[0]!.orderId);
    const conMas = valor(await local.app.cuentas.guardar(marisol, { cuenta: { ...pendiente, lines: [...pendiente.lines, linea(local, "Limonada", "200")] } }, AHORA));
    // Lo que ya salió no lo quita una pantalla, ni una pantalla marca una línea como enviada.
    const quitada = await local.app.cuentas.guardar(marisol, { cuenta: { ...conMas, lines: conMas.lines.slice(1) } }, AHORA);
    assert.equal(!quitada.ok && quitada.problemas?.[0]?.message, "LINEA_QUITADA");
    const marcada = await local.app.cuentas.guardar(marisol, { cuenta: { ...conMas, lines: [...conMas.lines, { ...linea(local, "Limonada", "200"), orderId: randomUUID() }] } }, AHORA);
    assert.equal(!marcada.ok && marcada.problemas?.[0]?.message, "PEDIDO_DESDE_LA_PANTALLA");
    valor(await cobrar(local, marisol, conMas, "812"));
    const pedidos = await pedidosDe(local, c.id);
    assert.equal(pedidos.length, 2);
    assert.deepEqual((pedidos[1]!.items as { nombre: string }[]).map((i) => i.nombre), ["Limonada"]);
  });

  test("sin la impresora de cocina no se cobra, y no queda nada escrito", async () => {
    const c = await venta(sinImpresora, otraCajera, [linea(sinImpresora, "Hamburguesa", "500")]);
    const r = await cobrar(sinImpresora, otraCajera, c, "580");
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
    assert.match(!r.ok ? r.mensaje : "", /No hay impresora de comandas de cocina/);
    const asientos = await sinImpresora.base.conTenant(sinImpresora.sistema.tenantId, (tx) => tx.payment.count({ where: { documentId: c.id } }));
    assert.equal(asientos, 0);
    // Lo que no se prepara se cobra igual, sin papel.
    const agua = await venta(sinImpresora, otraCajera, [linea(sinImpresora, "Agua mineral", "100")]);
    valor(await cobrar(sinImpresora, otraCajera, agua, "116"));
  });
});
