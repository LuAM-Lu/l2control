/**
 * Las entradas de mercancía y el costo promedio contra l2control_test — B9-3, F8-06, F8-01.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas): el precio del catálogo y el
 * IVA dependen de él. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxSupervisor: Contexto;
let ctxCajera: Contexto;
let ctxAdminElevado: Contexto;
const ids: Record<string, string> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

const PRECIOS: Record<string, string> = { Refresco: "150", Malta: "175", Chupeta: "50", Café: "120" };
const linea = (nombre: string) => ({
  id: randomUUID(),
  concept: nombre,
  kind: "RESTAURANTE" as const,
  amount: usd(PRECIOS[nombre]!),
  paid: false,
  productId: ids[nombre]!,
  taxCode: "GENERAL" as const,
});
const mostrador = (lines: unknown[]) => ({
  id: randomUUID(),
  kind: "MOSTRADOR",
  family: "Mostrador",
  mode: "PREPAGO",
  status: "POR_COBRAR",
  openedAt: new Date(AHORA).toISOString(),
  sessionIds: [],
  closedSessionIds: [],
  lines,
});
const vender = async (lines: unknown[]) => valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: mostrador(lines) }, AHORA));

const compra = (lineas: unknown[], extra: Record<string, unknown> = {}) => ({ idempotencyKey: randomUUID(), tipo: "COMPRA", lineas, ...extra });
const registrar = (cmd: unknown, ctx: Contexto = ctxSupervisor) => local.app.entradas.registrar(ctx, cmd, AHORA);
const producto = async (nombre: string) => (await local.app.productos.leer(ctxAdmin)).productos.find((p) => p.id === ids[nombre])!;
/** El valor al costo de lo que queda: la suma de los movimientos. */
const valorDe = async (nombre: string) =>
  (
    await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.aggregate({ where: { productId: ids[nombre]! }, _sum: { valueMinor: true, quantity: true } }))
  )._sum;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Entradas");
  otro = await abrirLocalDePrueba(URL_APP, "Entradas de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Depósito"), supervisor, "5937");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxAdminElevado = await contextoElevado(local, await crearEquipo(local, "Oficina elevada"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  for (const [nombre, precioMinor] of Object.entries(PRECIOS)) {
    const tipo = nombre !== "Café" ? ("PRODUCTO" as const) : ("PREPARADO" as const);
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo, precioMinor } }, AHORA - 5 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("registrar una entrada", () => {
  test("una compra de varias líneas: bultos × unidades, su costo, quién y cuándo", async () => {
    const e = valor(
      await registrar(
        compra(
          [
            { productId: ids.Refresco!, bultos: 2, unidadesPorBulto: 24, costoBultoMinor: "1200" },
            { productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" },
          ],
          { proveedor: "Distribuidora Polar", factura: "00012345" },
        ),
      ),
    );
    assert.equal(e.tipo, "COMPRA");
    assert.equal(e.proveedor, "Distribuidora Polar");
    assert.equal(e.factura, "00012345");
    assert.equal(e.recibidaPor, "Luis Guerrero");
    assert.equal(e.recibidaEn, new Date(AHORA).toISOString());
    assert.deepEqual(e.total, usd("3300"));
    const refresco = e.lineas.find((l) => l.productId === ids.Refresco)!;
    assert.deepEqual([refresco.bultos, refresco.unidadesPorBulto, refresco.unidades, refresco.costo], [2, 24, 48, usd("2400")]);

    const p = await producto("Refresco");
    assert.equal(p.existencia, 48);
    assert.deepEqual(p.costoPromedio, usd("50"));
    assert.equal(p.ultimoBulto, 24);
    // La lista la enseña, y el asiento cuenta el cambio en vivo (tema «catalogo»).
    assert.ok(valor(await local.app.entradas.leer(ctxAdmin)).entradas.some((x) => x.id === e.id));
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "inventario.entrada", entityId: e.id } }));
    assert.ok(asiento);
  });

  test("el costo tras dos compras a precios distintos es el del contador", async () => {
    // Ya hay 48 refrescos a $ 0,50 ($ 24,00). Llegan 24 a $ 0,80 ($ 19,20): $ 43,20 / 72 = $ 0,60.
    valor(await registrar(compra([{ productId: ids.Refresco!, bultos: 1, unidadesPorBulto: 24, costoBultoMinor: "1920" }])));
    const p = await producto("Refresco");
    assert.equal(p.existencia, 72);
    assert.deepEqual(p.costoPromedio, usd("60"));
  });

  test("un doble clic no carga dos veces la misma entrada, ni a la vez", async () => {
    const cmd = compra([{ productId: ids.Chupeta!, bultos: 1, unidadesPorBulto: 50, costoBultoMinor: "1000" }]);
    const a = valor(await registrar(cmd));
    const b = valor(await registrar(cmd));
    assert.equal(a.id, b.id);
    const otra = compra([{ productId: ids.Chupeta!, bultos: 1, unidadesPorBulto: 50, costoBultoMinor: "1000" }]);
    const [x, y] = await Promise.all([registrar(otra), registrar(otra)]);
    assert.equal(valor(x).id, valor(y).id);
    assert.equal((await producto("Chupeta")).existencia, 100);
  });

  test("lo que no entra: un producto sin control de stock, uno que no existe, un costo desmesurado", async () => {
    const cafe = await registrar(compra([{ productId: ids.Café!, bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "100" }]));
    assert.equal(!cafe.ok && cafe.problemas?.[0]?.message, "SIN_CONTROL_DE_STOCK");
    const fantasma = await registrar(compra([{ productId: randomUUID(), bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "100" }]));
    assert.deepEqual(!fantasma.ok && fantasma.problemas?.[0]?.path, ["lineas", 0, "productId"]);
    const caro = await registrar(compra([{ productId: ids.Malta!, bultos: 200, unidadesPorBulto: 24, costoBultoMinor: "100000" }]));
    assert.deepEqual(!caro.ok && caro.problemas?.[0]?.path, ["lineas", 0, "costoBultoMinor"]);
    // Nada a medias: una entrada con una línea mala no carga las buenas.
    const mixta = await registrar(compra([{ productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" }, { productId: ids.Café!, bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "100" }]));
    assert.equal(mixta.ok, false);
    assert.equal((await producto("Malta")).existencia, 12);
  });

  test("recibe administración o supervisión; la caja no carga ni lee entradas", async () => {
    const r = await registrar(compra([{ productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" }]), ctxCajera);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const leer = await local.app.entradas.leer(ctxCajera);
    assert.equal(!leer.ok && leer.motivo, "NO_PERMITIDO");
    valor(await registrar(compra([{ productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" }]), ctxAdmin));
    const rechazo = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "inventario.entrada", outcome: { not: "HECHO" } } }));
    assert.ok(rechazo, "el rechazo por permiso queda en la auditoría");
  });

  test("cada sucursal ve sus entradas, y no recibe productos ajenos", async () => {
    assert.deepEqual(valor(await otro.app.entradas.leer(otro.sistema)).entradas, []);
    const ajeno = await otro.app.entradas.registrar(otro.sistema, compra([{ productId: ids.Refresco!, bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "50" }]), AHORA);
    assert.equal(ajeno.ok, false);
  });
});

describe("el costo de lo vendido (costo promedio ponderado)", () => {
  test("comprar la caja de 24 y vender por unidad cuadra: vendido todo, el valor queda en cero", async () => {
    // 24 maltas más a $ 10,00 la caja: $ 0,41666… cada una, mezcladas con las que había.
    valor(await registrar(compra([{ productId: ids.Malta!, bultos: 1, unidadesPorBulto: 24, costoBultoMinor: "1000" }])));
    const antes = await valorDe("Malta");
    const hay = (await producto("Malta")).existencia!;
    // Se venden todas, de a una por cuenta y luego el resto de golpe.
    for (let i = 0; i < 5; i++) await vender([linea("Malta")]);
    await vender(Array.from({ length: hay - 5 }, () => linea("Malta")));
    const despues = await valorDe("Malta");
    assert.equal(despues.quantity, 0);
    assert.equal(despues.valueMinor, 0n, `entró ${antes.valueMinor} y debía salir todo`);
    const p = await producto("Malta");
    assert.equal(p.existencia, 0);
    assert.equal(p.costoPromedio, null);
  });

  test("una venta sale al costo promedio, y quitarla sin pagar vuelve con lo mismo: el costo no cambia", async () => {
    const antes = (await producto("Refresco")).costoPromedio;
    const c = await vender([linea("Refresco"), linea("Refresco")]);
    const venta = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.findFirst({ where: { accountId: c.id, kind: "VENTA" } }));
    assert.equal(venta!.valueMinor, -120n); // 2 × $ 0,60
    valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...c, lines: [c.lines[0]] } }, AHORA));
    const vuelta = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.findFirst({ where: { accountId: c.id, kind: "DEVOLUCION" } }));
    assert.equal(vuelta!.valueMinor, 60n);
    assert.deepEqual((await producto("Refresco")).costoPromedio, antes);
  });
});

describe("el stock mínimo (B9-5)", () => {
  test("lo fija quien recibe la mercancía, sin elevación; el catálogo lo enseña y queda en la auditoría", async () => {
    const r = valor(await local.app.productos.fijarMinimo(ctxSupervisor, { productId: ids.Refresco!, minimo: 24 }));
    assert.equal(r.productos.find((p) => p.id === ids.Refresco)!.minimo, 24);
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "producto.minimo", entityId: ids.Refresco! } }));
    assert.deepEqual(asiento?.after, { nombre: "Refresco", minimo: 24 });
    // Quitarlo deja solo el aviso de agotado.
    const sin = valor(await local.app.productos.fijarMinimo(ctxAdmin, { productId: ids.Refresco!, minimo: null }));
    assert.equal(sin.productos.find((p) => p.id === ids.Refresco)!.minimo, null);
  });

  test("la caja no lo fija, y lo que no lleva existencia no tiene mínimo", async () => {
    const caja = await local.app.productos.fijarMinimo(ctxCajera, { productId: ids.Refresco!, minimo: 5 });
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
    const cafe = await local.app.productos.fijarMinimo(ctxAdmin, { productId: ids.Café!, minimo: 5 });
    assert.equal(!cafe.ok && cafe.problemas?.[0]?.message, "SIN_CONTROL_DE_STOCK");
    const negativo = await local.app.productos.fijarMinimo(ctxAdmin, { productId: ids.Refresco!, minimo: -1 });
    assert.equal(!negativo.ok && negativo.motivo, "INVALIDO");
  });
});

describe("dar de alta un producto en la entrada (B9-6)", () => {
  const nuevo = { nombre: "Refresco de uva", categoria: "Bebidas", taxCode: "GENERAL", precioMinor: "150", codigoBarras: "036000291452", presentacion: "Lata 355 ml" };

  test("nace a la venta con su SKU, su código, su stock y su costo, en la misma entrada", async () => {
    const e = valor(
      await registrar(
        compra([
          { productId: ids.Refresco!, bultos: 1, unidadesPorBulto: 24, costoBultoMinor: "1200" },
          { nuevo, bultos: 2, unidadesPorBulto: 24, costoBultoMinor: "1440" },
        ]),
        ctxAdminElevado,
      ),
    );
    const uva = (await local.app.productos.leer(ctxAdmin)).productos.find((p) => p.nombre === "Refresco de uva")!;
    assert.deepEqual([uva.tipo, uva.activo, uva.codigoBarras, uva.presentacion, uva.existencia, uva.costoPromedio], ["PRODUCTO", true, "036000291452", "Lata 355 ml", 48, usd("60")]);
    assert.match(uva.sku, /^BEB-\d{4}$/);
    assert.ok(e.lineas.some((l) => l.productId === uva.id && l.unidades === 48));
    const alta = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "producto.crear", entityId: uva.id } }));
    assert.ok(alta, "el alta queda con su asiento");
  });

  test("crear es del catálogo: supervisión recibe pero no da de alta, y nada queda a medias", async () => {
    const r = await registrar(compra([{ productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" }, { nuevo: { ...nuevo, nombre: "Malta light", codigoBarras: undefined }, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" }]), ctxSupervisor);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    assert.equal((await local.app.productos.leer(ctxAdmin)).productos.some((p) => p.nombre === "Malta light"), false);
    // Un nuevo con el código de otro producto tampoco deja la entrada a medias.
    const antes = (await producto("Malta")).existencia;
    const choca = await registrar(compra([{ productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costoBultoMinor: "900" }, { nuevo: { ...nuevo, nombre: "Otra uva" }, bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "50" }]), ctxAdminElevado);
    assert.deepEqual(!choca.ok && choca.problemas?.[0]?.path, ["lineas", 1, "nuevo", "codigoBarras"]);
    assert.equal((await producto("Malta")).existencia, antes);
  });
});
