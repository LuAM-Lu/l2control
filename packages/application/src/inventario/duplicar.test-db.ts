/**
 * Duplicar un producto y sus sabores contra l2control_test — B9-8 (M-28).
 *
 * La pantalla copia la ficha del original (categoría, presentación, precio, IVA, mínimo y carta) y da de alta las copias
 * por el alta en lote (B9-7): aquí se comprueba que cada copia es un producto propio, con su SKU y su código, sin
 * inventario inicial, y que todo o nada. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogoDto } from "@l2/contracts";
import { abrirLocalDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-08T18:00:00.000Z");

let local: LocalDePrueba;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const de = (c: CatalogoDto, nombre: string) => c.productos.find((p) => p.nombre === nombre)!;
/** Lo que la pantalla manda por cada copia (`productoDeCopia`). */
const copia = (nombre: string, codigoBarras?: string) => ({
  nombre,
  categoria: "Bebidas",
  taxCode: "GENERAL" as const,
  tipo: "PRODUCTO" as const,
  precioMinor: "250",
  presentacion: "Botella 250 ml",
  minimo: 4,
  enCarta: false,
  ...(codigoBarras ? { codigoBarras } : {}),
});

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Duplicar");
  valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { ...copia("Jugo Naranja", "7591234567894") } }, AHORA - 60_000));
});

after(async () => {
  await local.cerrar();
});

describe("duplicar con otros sabores (B9-8)", () => {
  test("cada copia lleva la ficha del original, su SKU y su código, y nace sin inventario inicial", async () => {
    const c = valor(await local.app.productos.altaEnLote(local.sistema, { productos: [copia("Jugo Manzana", "7591234567887"), copia("Jugo Pera")] }, AHORA));
    const original = de(c, "Jugo Naranja");
    for (const nombre of ["Jugo Manzana", "Jugo Pera"]) {
      const p = de(c, nombre);
      assert.deepEqual([p.categoria, p.presentacion, p.taxCode, p.minimo, p.enCarta, p.precios.at(-1)?.precio.minor], ["Bebidas", "Botella 250 ml", "GENERAL", 4, false, "250"], nombre);
      assert.notEqual(p.sku, original.sku);
      assert.equal(p.inventarioInicialEl, null, "sin inventario inicial");
    }
    assert.equal(de(c, "Jugo Manzana").codigoBarras, "7591234567887");
    assert.equal(de(c, "Jugo Pera").codigoBarras, null);
  });

  test("todo o nada: un nombre o un código repetido no crea ninguno", async () => {
    const r = await local.app.productos.altaEnLote(local.sistema, { productos: [copia("Jugo Uva"), copia("Jugo Naranja")] }, AHORA);
    assert.equal(r.ok, false);
    const c = await local.app.productos.leer(local.sistema);
    assert.equal(c.productos.some((p) => p.nombre === "Jugo Uva"), false);
  });
});
