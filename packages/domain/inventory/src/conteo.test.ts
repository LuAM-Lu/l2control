import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenciasDeConteo } from "./conteo.ts";

test("faltantes y sobrantes por categoría y en total, al costo; lo que cuadró cuenta como contado", () => {
  const { total, porCategoria } = diferenciasDeConteo([
    { categoria: "Bebidas", diferencia: -2, valorMinor: -100n },
    { categoria: "Bebidas", diferencia: 0, valorMinor: 0n },
    { categoria: "Golosinas", diferencia: 3, valorMinor: 90n },
    { categoria: "Bebidas", diferencia: 1, valorMinor: 75n },
  ]);
  assert.deepEqual(total, { contados: 4, cuadran: 1, faltan: 2, faltanMinor: 100n, sobran: 4, sobranMinor: 165n, netoMinor: 65n });
  assert.deepEqual(porCategoria, [
    { categoria: "Bebidas", contados: 3, cuadran: 1, faltan: 2, faltanMinor: 100n, sobran: 1, sobranMinor: 75n, netoMinor: -25n },
    { categoria: "Golosinas", contados: 1, cuadran: 0, faltan: 0, faltanMinor: 0n, sobran: 3, sobranMinor: 90n, netoMinor: 90n },
  ]);
});

test("un conteo sin diferencias", () => {
  const { total } = diferenciasDeConteo([{ categoria: "Bebidas", diferencia: 0, valorMinor: 0n }]);
  assert.deepEqual(total, { contados: 1, cuadran: 1, faltan: 0, faltanMinor: 0n, sobran: 0, sobranMinor: 0n, netoMinor: 0n });
});
