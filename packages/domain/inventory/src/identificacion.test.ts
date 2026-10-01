import { test } from "node:test";
import assert from "node:assert/strict";
import { barcodeProblem, kindTracksStock, nextSku, normalizeBarcode, skuPrefix } from "./identificacion.ts";

test("el prefijo del SKU: tres letras de la categoría, sin acentos, con X si faltan", () => {
  assert.equal(skuPrefix("Bebidas"), "BEB");
  assert.equal(skuPrefix("Café"), "CAF");
  assert.equal(skuPrefix("  ñame frito"), "NAM");
  assert.equal(skuPrefix("Té"), "TEX");
  assert.equal(skuPrefix("3D"), "DXX");
});

test("el siguiente SKU sigue el correlativo de su prefijo", () => {
  assert.equal(nextSku("BEB", []), "BEB-0001");
  assert.equal(nextSku("BEB", ["BEB-0001", "BEB-0007", "GOL-0020", "BEBX-0099"]), "BEB-0008");
  assert.equal(nextSku("BEB", ["BEB-9999"]), "BEB-10000");
});

test("el código de barras: formato, y el dígito de control de los EAN y UPC", () => {
  assert.equal(barcodeProblem("4006381333931"), null); // EAN-13 que cuadra
  assert.equal(barcodeProblem("4006381333932"), "DIGITO_DE_CONTROL"); // una barra mal leída
  assert.equal(barcodeProblem("96385074"), null); // EAN-8
  assert.equal(barcodeProblem("036000291452"), null); // UPC-A
  assert.equal(barcodeProblem("ABC-123"), null); // un código propio, sin dígito de control
  assert.equal(barcodeProblem("12"), "FORMATO");
  assert.equal(barcodeProblem("con espacio"), "FORMATO");
  assert.equal(normalizeBarcode(" abc 123 "), "ABC123");
});

test("solo el producto lleva existencia", () => {
  assert.deepEqual([kindTracksStock("PRODUCTO"), kindTracksStock("PREPARADO"), kindTracksStock("SERVICIO")], [true, false, false]);
});
