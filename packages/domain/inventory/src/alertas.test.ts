import { test } from "node:test";
import assert from "node:assert/strict";
import { stockAlerts, stockStatus } from "./alertas.ts";

test("agotado, bajo su mínimo (en él o por debajo) y bien, de lo que ya arrancó", () => {
  assert.equal(stockStatus(0, 5, true), "AGOTADO");
  assert.equal(stockStatus(5, 5, true), "BAJO_MINIMO"); // en el punto de reorden ya avisa
  assert.equal(stockStatus(3, 5, true), "BAJO_MINIMO");
  assert.equal(stockStatus(6, 5, true), "BIEN");
  assert.equal(stockStatus(1, null, true), "BIEN"); // sin mínimo, solo avisa al agotarse
  assert.equal(stockStatus(0, null, true), "AGOTADO");
});

test("sin inventario inicial no es agotado: nunca se contó (B9-7)", () => {
  assert.equal(stockStatus(0, null, false), "SIN_INICIAL");
  assert.equal(stockStatus(0, 5, false), "SIN_INICIAL"); // con mínimo, tampoco es «bajo mínimo»
  // Lo que tiene existencia ya arrancó: el dato manda aunque llegue `iniciado` en falso.
  assert.equal(stockStatus(3, 5, false), "BAJO_MINIMO");
});

test("los avisos cuentan lo que está a la venta y lleva existencia", () => {
  const r = stockAlerts([
    { existencia: 0, minimo: 5, activo: true, iniciado: true },
    { existencia: 2, minimo: 5, activo: true, iniciado: true },
    { existencia: 0, minimo: 5, activo: false, iniciado: true }, // apartado: no se ofrece, no avisa
    { existencia: null, minimo: null, activo: true, iniciado: false }, // un café: no lleva existencia
    { existencia: 50, minimo: 5, activo: true, iniciado: true },
    { existencia: 0, minimo: null, activo: true, iniciado: false }, // el catálogo, sin contar todavía
    { existencia: 0, minimo: null, activo: false, iniciado: false }, // apartado sin contar: tampoco
  ]);
  assert.deepEqual(r, { sinInicial: 1, agotados: 1, bajoMinimo: 1 });
});
