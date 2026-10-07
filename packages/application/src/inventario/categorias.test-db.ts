/**
 * Las categorías del catálogo como lista propia contra l2control_test — T-10, M-24.
 * Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_CATEGORIES } from "@l2/domain-inventory";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let ctxElevado: Contexto;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const aplicar = (cmd: unknown, ctx: Contexto = ctxElevado) => local.app.categorias.aplicar(ctx, cmd, AHORA);
const categorias = async () => (await local.app.productos.leer(ctxAdmin)).categorias;
const deNombre = async (nombre: string) => (await categorias()).find((c) => c.nombre === nombre);
const crearProducto = async (nombre: string, categoria: string) =>
  valor(await local.app.productos.aplicar(ctxElevado, { kind: "CREAR", producto: { nombre, categoria, taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100" } }, AHORA)).productos.find(
    (p) => p.nombre === nombre,
  )!;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Categorías");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxElevado = await contextoElevado(local, await crearEquipo(local, "Oficina elevada"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
});

after(async () => {
  await local.cerrar();
});

describe("la lista de categorías", () => {
  test("un local nuevo nace con las de arranque, sin productos", async () => {
    const lista = await categorias();
    for (const c of STARTER_CATEGORIES) assert.ok(lista.some((x) => x.nombre === c && x.productos === 0), c);
  });

  test("un producto con «bebidas » queda en «Bebidas»; uno con una categoría nueva la añade a la lista", async () => {
    const agua = await crearProducto("Agua mineral", "  bebidas ");
    assert.equal(agua.categoria, "Bebidas");
    assert.equal((await deNombre("Bebidas"))?.productos, 1);
    const pan = await crearProducto("Pan de jamón", "Panadería");
    assert.equal(pan.categoria, "Panadería");
    assert.equal((await deNombre("Panadería"))?.productos, 1);
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "categoria.crear", after: { path: ["nombre"], equals: "Panadería" } } }));
    assert.ok(asiento, "la categoría nueva queda en la auditoría");
  });

  test("crear una que ya existe (con otras mayúsculas o acentos) se rechaza", async () => {
    valor(await aplicar({ kind: "CREAR", nombre: "Cafetería" }));
    const otra = await aplicar({ kind: "CREAR", nombre: "CAFETERIA" });
    assert.equal(!otra.ok && otra.motivo, "INVALIDO");
  });

  test("renombrar cambia el nombre en sus productos; encima de otra, no (se unen)", async () => {
    const pan = (await deNombre("Panadería"))!;
    valor(await aplicar({ kind: "RENOMBRAR", id: pan.id, nombre: "Panadería y dulces" }));
    const catalogo = await local.app.productos.leer(ctxAdmin);
    assert.equal(catalogo.productos.find((p) => p.nombre === "Pan de jamón")!.categoria, "Panadería y dulces");
    const encima = await aplicar({ kind: "RENOMBRAR", id: pan.id, nombre: "bebidas" });
    assert.match(!encima.ok ? encima.mensaje : "", /únelas/);
    // Cambiar solo las mayúsculas de la misma, sí.
    valor(await aplicar({ kind: "RENOMBRAR", id: pan.id, nombre: "PANADERÍA Y DULCES" }));
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "categoria.renombrar", entityId: pan.id } }));
    assert.deepEqual(asiento?.before, { nombre: "Panadería" });
  });

  test("unir pasa los productos a la otra y retira la que se va", async () => {
    const pan = (await deNombre("PANADERÍA Y DULCES"))!;
    const postres = (await deNombre("Postres"))!;
    valor(await aplicar({ kind: "UNIR", id: pan.id, en: postres.id }));
    const lista = await categorias();
    assert.equal(lista.some((c) => c.id === pan.id), false);
    assert.equal(lista.find((c) => c.id === postres.id)?.productos, 1);
    const catalogo = await local.app.productos.leer(ctxAdmin);
    assert.equal(catalogo.productos.find((p) => p.nombre === "Pan de jamón")!.categoria, "Postres");
  });

  test("retirar: solo una vacía; la que tiene productos se une", async () => {
    const bebidas = (await deNombre("Bebidas"))!;
    const llena = await aplicar({ kind: "RETIRAR", id: bebidas.id });
    assert.equal(!llena.ok && llena.problemas?.[0]?.message, "Tiene productos");
    const juguetes = (await deNombre("Juguetes"))!;
    valor(await aplicar({ kind: "RETIRAR", id: juguetes.id }));
    assert.equal((await categorias()).some((c) => c.id === juguetes.id), false);
    // Retirada, se puede volver a crear con el mismo nombre.
    valor(await aplicar({ kind: "CREAR", nombre: "Juguetes" }));
  });

  test("es del catálogo: la caja no la cambia y administración confirma su identidad", async () => {
    const caja = await aplicar({ kind: "CREAR", nombre: "Helados de máquina" }, ctxCajera);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
    const sinConfirmar = await aplicar({ kind: "CREAR", nombre: "Helados de máquina" }, ctxAdmin);
    assert.equal(!sinConfirmar.ok && sinConfirmar.motivo, "ELEVACION_REQUERIDA");
  });
});
