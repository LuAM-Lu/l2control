import { test } from "node:test";
import assert from "node:assert/strict";
import { stockAlerts, stockStatus } from "./alertas.ts";

test("tres estados: agotado, bajo su mínimo (en él o por debajo) y bien", () => {
  assert.equal(stockStatus(0, 5), "AGOTADO");
  assert.equal(stockStatus(5, 5), "BAJO_MINIMO"); // en el punto de reorden ya avisa
  assert.equal(stockStatus(3, 5), "BAJO_MINIMO");
  assert.equal(stockStatus(6, 5), "BIEN");
  assert.equal(stockStatus(1, null), "BIEN"); // sin mínimo, solo avisa al agotarse
  assert.equal(stockStatus(0, null), "AGOTADO");
});

test("los avisos cuentan lo que está a la venta y lleva existencia", () => {
  const r = stockAlerts([
    { existencia: 0, minimo: 5, activo: true },
    { existencia: 2, minimo: 5, activo: true },
    { existencia: 0, minimo: 5, activo: false }, // apartado: no se ofrece, no avisa
    { existencia: null, minimo: null, activo: true }, // un café: no lleva existencia
    { existencia: 50, minimo: 5, activo: true },
  ]);
  assert.deepEqual(r, { agotados: 1, bajoMinimo: 1 });
});
