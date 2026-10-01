import { test } from "node:test";
import assert from "node:assert/strict";
import { cambioDePlanoProblem, mesasRetiradas } from "./plano.ts";

const m = (id: string, retiredAt?: string) => ({ id, label: id.replace("m", ""), ...(retiredAt ? { retiredAt } : {}) });
const R = "2026-10-01T12:00:00.000Z";

test("el primer plano se publica; mover, renumerar o añadir mesas también", () => {
  assert.equal(cambioDePlanoProblem(null, [m("m1"), m("m2")], new Set()), null);
  assert.equal(cambioDePlanoProblem([m("m1")], [m("m1"), m("m2")], new Set(["m1"])), null);
});

test("una mesa no desaparece: se retira", () => {
  assert.deepEqual(cambioDePlanoProblem([m("m1"), m("m2")], [m("m1")], new Set()), { problema: "MESA_DESAPARECE", mesa: "2" });
  assert.equal(cambioDePlanoProblem([m("m1"), m("m2")], [m("m1"), m("m2", R)], new Set()), null);
});

test("una mesa con su cuenta abierta no se retira; una ya retirada sigue igual", () => {
  assert.deepEqual(cambioDePlanoProblem([m("m1"), m("m2")], [m("m1"), m("m2", R)], new Set(["m2"])), { problema: "MESA_OCUPADA", mesa: "2" });
  assert.equal(cambioDePlanoProblem([m("m1"), m("m2", R)], [m("m1"), m("m2", R)], new Set(["m1"])), null);
});

test("las recién retiradas son las que no lo estaban antes", () => {
  assert.deepEqual(mesasRetiradas([m("m1"), m("m2", R)], [m("m1", R), m("m2", R), m("m3", R)]), ["m1", "m3"]);
  assert.deepEqual(mesasRetiradas(null, [m("m1")]), []);
});
