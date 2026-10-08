/** La huella con que se agrupan los reportes del mismo error — T-11 (M-27, P-4). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { huellaDelError } from "./soporte.ts";

test("el código del error conocido manda sobre el texto", () => {
  assert.equal(huellaDelError("sin-tasa", ["Cualquier cosa"]), "codigo:sin-tasa");
});

test("el mismo error con otra cifra, otra tilde u otras mayúsculas es el mismo error", () => {
  const a = huellaDelError(null, ["Código no reconocido: AK-0142"]);
  assert.equal(a, huellaDelError(null, ["codigo no reconocido: ak-0977"]));
  assert.equal(huellaDelError(null, ["Faltan $ 1.234,50 por cobrar"]), huellaDelError(null, ["Faltan $ 3,00 por cobrar"]));
});

test("se mira el error más reciente; sin errores no hay huella", () => {
  assert.notEqual(huellaDelError(null, ["La impresora no responde", "Sin tasa"]), huellaDelError(null, ["Sin tasa", "La impresora no responde"]));
  assert.equal(huellaDelError(null, []), null);
  assert.equal(huellaDelError(undefined, ["   "]), null);
});
