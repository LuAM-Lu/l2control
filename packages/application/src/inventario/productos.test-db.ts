/**
 * El catálogo de productos en el servidor, contra l2control_test — B9-1, F8-02.
 *
 * Lo que fijan: un local nace sin productos; administración (con elevación) crea uno con su primer
 * precio, lo edita, lo aparta y le programa precios con fecha; un precio nuevo no altera el que
 * rigió; un nombre repetido o un precio hacia atrás no entran; todo queda en la auditoría; nadie
 * más lo cambia y un local no ve el catálogo de otro. Corre con `pnpm test:db`, con reloj fijo.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, ProductoDto } from "@l2/contracts";
import { priceAt, priceTimeline } from "@l2/domain-inventory";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinElevar: Contexto;
let ctxCajera: Contexto;

const MIN = 60_000;
/** Jueves 1 oct 2026, 11:00 am en Caracas. Cada operación avanza un minuto: el reloj es fijo. */
const INICIO = Date.UTC(2026, 9, 1, 15);
let minuto = 0;
const reloj = () => INICIO + minuto++ * MIN;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const producto = (c: CatalogoDto, nombre: string): ProductoDto => c.productos.find((p) => p.nombre === nombre)!;
/** El precio de un producto en un instante, como lo calcula la caja. */
const precioEn = (p: ProductoDto, at: number) =>
  priceAt(
    priceTimeline(p.precios.map((t) => ({ id: t.id, productId: p.id, amountMinor: BigInt(t.precio.minor), effectiveFrom: Date.parse(t.desde), scheduledAt: Date.parse(t.programadoEl) }))),
    p.id,
    at,
  )?.amount ?? null;

const AGUA = { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "100" };

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Productos");
  otro = await abrirLocalDePrueba(URL_APP, "Productos de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinElevar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("un local nuevo", () => {
  test("nace sin productos: producción arranca vacía (M-12)", async () => {
    const c = await local.app.productos.leer(local.sistema);
    assert.deepEqual(c.productos, []);
    assert.equal(c.zonaHoraria, "America/Caracas");
  });
});

describe("administración arma el catálogo (F8-02)", () => {
  test("crear un producto: nace a la venta, con su precio rigiendo desde que se guarda", async () => {
    const ahora = reloj();
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: AGUA }, ahora));
    const agua = producto(c, "Agua mineral");
    assert.equal(agua.activo, true);
    assert.equal(agua.taxCode, "GENERAL");
    assert.equal(agua.precios.length, 1);
    assert.equal(agua.precios[0]!.desde, new Date(ahora).toISOString());
    assert.equal(agua.precios[0]!.programadoPor, "Abigail Karam");
    assert.equal(precioEn(agua, ahora), 100n);
  });

  test("un nombre repetido no entra, sin mayúsculas, acentos ni espacios de más", async () => {
    const r = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "  AGUA   Mineral " } }, reloj());
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.deepEqual(!r.ok && r.problemas?.[0]?.path, ["producto", "nombre"]);
    valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Café con leche", categoria: "Café", tipo: "PREPARADO", precioMinor: "150" } }, reloj()));
    const cafe = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "cafe con leche" } }, reloj());
    assert.equal(!cafe.ok && cafe.motivo, "INVALIDO");
  });

  test("un precio fuera de rango no entra: cero lo dice el contrato, el tope el dominio", async () => {
    const cero = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Malta", precioMinor: "0" } }, reloj());
    assert.equal(!cero.ok && cero.motivo, "INVALIDO");
    const caro = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Malta", precioMinor: "85566250" } }, reloj());
    assert.equal(!caro.ok && caro.motivo, "INVALIDO");
    assert.match(!caro.ok ? (caro.problemas?.[0]?.message ?? "") : "", /bolívares/);
  });

  test("editar cambia nombre, categoría, IVA y stock; lo que no cambia nada se rechaza", async () => {
    const agua = producto(await local.app.productos.leer(local.sistema), "Agua mineral");
    const edicion = { kind: "EDITAR", productId: agua.id, nombre: "Agua mineral 600 ml", categoria: "Bebidas", taxCode: "EXENTA", tipo: "PRODUCTO", codigoBarras: null, presentacion: null };
    const c = valor(await local.app.productos.aplicar(ctxAdmin, edicion, reloj()));
    assert.equal(producto(c, "Agua mineral 600 ml").taxCode, "EXENTA");
    const igual = await local.app.productos.aplicar(ctxAdmin, edicion, reloj());
    assert.equal(!igual.ok && igual.motivo, "INVALIDO");
    // Renombrarse como otro, tampoco.
    const choca = await local.app.productos.aplicar(ctxAdmin, { ...edicion, nombre: "Café con Leche" }, reloj());
    assert.equal(!choca.ok && choca.motivo, "INVALIDO");
  });

  test("apartar y volver a poner a la venta; lo mismo dos veces no hace nada", async () => {
    const agua = producto(await local.app.productos.leer(local.sistema), "Agua mineral 600 ml");
    let c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "ACTIVAR", productId: agua.id, activo: false }, reloj()));
    assert.equal(producto(c, "Agua mineral 600 ml").activo, false);
    // Apartado, su nombre sigue ocupado: se vuelve a poner a la venta, no se crea otro.
    const otraVez = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Agua mineral 600 ML" } }, reloj());
    assert.match(!otraVez.ok ? (otraVez.problemas?.[0]?.message ?? "") : "", /apartado/);
    valor(await local.app.productos.aplicar(ctxAdmin, { kind: "ACTIVAR", productId: agua.id, activo: false }, reloj()));
    c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "ACTIVAR", productId: agua.id, activo: true }, reloj()));
    assert.equal(producto(c, "Agua mineral 600 ml").activo, true);
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "product", entityId: agua.id });
    assert.equal(asientos.filter((a) => a.action === "producto.apartar").length, 1);
  });
});

describe("la carta del restaurante es el catálogo (B6-1)", () => {
  test("un producto nace en la carta; un servicio, fuera de ella; y se puede decir al crearlo", async () => {
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Tequeños", categoria: "Pasapalos", tipo: "PREPARADO", precioMinor: "500" } }, reloj()));
    assert.equal(producto(c, "Tequeños").enCarta, true);
    const s = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Animación de fiesta", categoria: "Servicios", tipo: "SERVICIO", precioMinor: "5000" } }, reloj()));
    assert.equal(producto(s, "Animación de fiesta").enCarta, false);
    const f = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Pila AA", categoria: "Tienda", enCarta: false } }, reloj()));
    assert.equal(producto(f, "Pila AA").enCarta, false);
  });

  test("quitarlo de la carta lo audita; lo mismo dos veces no hace nada; la caja no puede", async () => {
    const tequenos = producto(await local.app.productos.leer(local.sistema), "Tequeños");
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "EN_CARTA", productId: tequenos.id, enCarta: false }, reloj()));
    assert.equal(producto(c, "Tequeños").enCarta, false);
    assert.equal(producto(c, "Tequeños").activo, true, "la caja lo sigue vendiendo");
    valor(await local.app.productos.aplicar(ctxAdmin, { kind: "EN_CARTA", productId: tequenos.id, enCarta: false }, reloj()));
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "product", entityId: tequenos.id });
    assert.equal(asientos.filter((a) => a.action === "producto.carta").length, 1);
    const cajera = await local.app.productos.aplicar(ctxCajera, { kind: "EN_CARTA", productId: tequenos.id, enCarta: true }, reloj());
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
    valor(await local.app.productos.aplicar(ctxAdmin, { kind: "EN_CARTA", productId: tequenos.id, enCarta: true }, reloj()));
  });
});

describe("el precio es un calendario", () => {
  test("cambiar el precio hoy rige desde ya; el que rigió se queda con lo vendido", async () => {
    const antes = producto(await local.app.productos.leer(local.sistema), "Agua mineral 600 ml");
    const venta = reloj(); // una venta de esta mañana, con el precio de entonces
    const ahora = reloj();
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "PROGRAMAR_PRECIO", productId: antes.id, precioMinor: "120", dia: "2026-10-01" }, ahora));
    const agua = producto(c, "Agua mineral 600 ml");
    assert.equal(precioEn(agua, venta), 100n);
    assert.equal(precioEn(agua, ahora), 120n);
    assert.equal(agua.precios.length, 2);
  });

  test("otro día rige desde su medianoche en el local, y hasta entonces sigue el de hoy", async () => {
    const agua = producto(await local.app.productos.leer(local.sistema), "Agua mineral 600 ml");
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "150", dia: "2026-10-05" }, reloj()));
    const nuevo = producto(c, "Agua mineral 600 ml");
    const medianoche = Date.UTC(2026, 9, 5, 4); // 5 oct, 12:00 am en Caracas
    assert.equal(precioEn(nuevo, medianoche - 1), 120n);
    assert.equal(precioEn(nuevo, medianoche), 150n);
  });

  test("programar el precio que rige para ese día cancela el cambio; repetirlo no cambia nada", async () => {
    const agua = producto(await local.app.productos.leer(local.sistema), "Agua mineral 600 ml");
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "120", dia: "2026-10-05" }, reloj()));
    assert.equal(precioEn(producto(c, "Agua mineral 600 ml"), Date.UTC(2026, 9, 6)), 120n);
    const igual = await local.app.productos.aplicar(ctxAdmin, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "120", dia: "2026-10-05" }, reloj());
    assert.equal(!igual.ok && igual.motivo, "INVALIDO");
  });

  test("nunca hacia atrás ni más allá de un año", async () => {
    const agua = producto(await local.app.productos.leer(local.sistema), "Agua mineral 600 ml");
    const ayer = await local.app.productos.aplicar(ctxAdmin, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "130", dia: "2026-09-30" }, reloj());
    assert.deepEqual(!ayer.ok && ayer.problemas?.[0]?.path, ["dia"]);
    const lejos = await local.app.productos.aplicar(ctxAdmin, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "130", dia: "2027-12-01" }, reloj());
    assert.equal(!lejos.ok && lejos.motivo, "INVALIDO");
  });

  test("cada cambio queda en la auditoría con quién lo hizo, y el precio con lo que regía", async () => {
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxAdmin.quien!.userId! });
    for (const accion of ["producto.crear", "producto.editar", "producto.apartar", "producto.activar", "precio.programar"]) {
      assert.ok(asientos.some((a) => a.action === accion), accion);
    }
    // El primer cambio de precio (el de hoy, de $ 1,00 a $ 1,20); la lista va de la más nueva a la más vieja.
    const precio = asientos.findLast((a) => a.action === "precio.programar")!;
    assert.deepEqual((precio.before as { precio: unknown }).precio, { minor: "100", currency: "USD" });
    assert.deepEqual((precio.after as { precio: unknown }).precio, { minor: "120", currency: "USD" });
  });
});

describe("nadie más lo cambia", () => {
  test("la caja lo lee, pero no lo cambia, y el intento queda en la auditoría", async () => {
    assert.ok((await local.app.productos.leer(ctxCajera)).productos.length > 0);
    const agua = producto(await local.app.productos.leer(ctxCajera), "Agua mineral 600 ml");
    const r = await local.app.productos.aplicar(ctxCajera, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "50", dia: "2026-10-01" }, reloj());
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxCajera.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "precio.programar" && a.outcome === "NEGADO"));
  });

  // Desde T-13 dar de alta es del inventario (sin elevación); el precio sigue pidiendo confirmar identidad (F2-04).
  test("administración sin confirmar su identidad da de alta, pero no cambia un precio (T-13, F2-04)", async () => {
    const alta = await local.app.productos.aplicar(ctxAdminSinElevar, { kind: "CREAR", producto: { ...AGUA, nombre: "Refresco" } }, reloj());
    assert.equal(alta.ok, true, JSON.stringify(alta));
    const refresco = producto(alta.ok ? alta.valor : await local.app.productos.leer(local.sistema), "Refresco");
    const precio = await local.app.productos.aplicar(ctxAdminSinElevar, { kind: "PROGRAMAR_PRECIO", productId: refresco.id, precioMinor: "175", dia: "2026-10-01" }, reloj());
    assert.equal(!precio.ok && precio.motivo, "ELEVACION_REQUERIDA");
  });

  test("un local no ve ni toca el catálogo de otro", async () => {
    assert.deepEqual((await otro.app.productos.leer(otro.sistema)).productos, []);
    const agua = producto(await local.app.productos.leer(local.sistema), "Agua mineral 600 ml");
    const r = await otro.app.productos.aplicar(otro.sistema, { kind: "PROGRAMAR_PRECIO", productId: agua.id, precioMinor: "50", dia: "2026-10-01" }, reloj());
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
  });
});

describe("identificación y tipo (B9-6)", () => {
  test("el SKU lo pone el servidor: prefijo de la categoría y correlativo, sin repetirse", async () => {
    const a = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Jugo de naranja", categoria: "Jugos" } }, reloj()));
    const b = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Jugo de mango", categoria: "Jugos" } }, reloj()));
    assert.equal(producto(a, "Jugo de naranja").sku, "JUG-0001");
    assert.equal(producto(b, "Jugo de mango").sku, "JUG-0002");
    // El SKU no cambia aunque cambie la categoría.
    const mango = producto(b, "Jugo de mango");
    const editado = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "EDITAR", productId: mango.id, nombre: "Jugo de mango", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", codigoBarras: null, presentacion: "Vaso 300 ml" }, reloj()));
    assert.deepEqual([producto(editado, "Jugo de mango").sku, producto(editado, "Jugo de mango").presentacion], ["JUG-0002", "Vaso 300 ml"]);
  });

  test("el código de barras: bien leído, de un solo producto y solo en lo que se cuenta", async () => {
    const c = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Galleta María", categoria: "Golosinas", codigoBarras: "4006381333931" } }, reloj()));
    assert.equal(producto(c, "Galleta María").codigoBarras, "4006381333931");
    const repetido = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Galleta Soda", categoria: "Golosinas", codigoBarras: "4006381333931" } }, reloj());
    assert.equal(!repetido.ok && repetido.problemas?.[0]?.message, "Ya es de «Galleta María»");
    const torcido = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Galleta Soda", categoria: "Golosinas", codigoBarras: "4006381333932" } }, reloj());
    assert.match((!torcido.ok && torcido.problemas?.[0]?.message) || "", /dígito de control/);
    const servicio = await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Alquiler del salón", categoria: "Eventos", tipo: "SERVICIO", codigoBarras: "ABC-1234" } }, reloj());
    assert.equal(servicio.ok, false);
    const s = valor(await local.app.productos.aplicar(ctxAdmin, { kind: "CREAR", producto: { ...AGUA, nombre: "Alquiler del salón", categoria: "Eventos", tipo: "SERVICIO" } }, reloj()));
    const alquiler = producto(s, "Alquiler del salón");
    assert.deepEqual([alquiler.tipo, alquiler.controlaStock, alquiler.existencia, alquiler.sku], ["SERVICIO", false, null, "EVE-0001"]);
  });

  test("lo que tiene existencia no cambia de tipo hasta sacarla o contarla", async () => {
    const c = await local.app.productos.leer(local.sistema);
    const galleta = producto(c, "Galleta María");
    valor(await local.app.entradas.registrar(local.sistema, { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: galleta.id, bultos: 1, unidadesPorBulto: 6, costo: { por: "BULTO", minor: "300" } }] }, reloj()));
    const r = await local.app.productos.aplicar(ctxAdmin, { kind: "EDITAR", productId: galleta.id, nombre: "Galleta María", categoria: "Golosinas", taxCode: "GENERAL", tipo: "PREPARADO", codigoBarras: null, presentacion: null }, reloj());
    assert.match(!r.ok ? r.mensaje : "", /tiene 6 en stock/);
  });
});
