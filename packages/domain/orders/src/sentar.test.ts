import { test } from "node:test";
import assert from "node:assert/strict";
import { exigidoAlCompletar, exigidoAlSentar, pideLaCedula } from "./sentar.ts";

test("B6-22: «Más seguro» pide la cédula al sentar; «Más rápido», solo el nombre", () => {
  assert.deepEqual(exigidoAlSentar("SEGURO", "SIEMPRE"), { cedula: true, telefono: true });
  assert.deepEqual(exigidoAlSentar("RAPIDO", "SIEMPRE"), { cedula: false, telefono: true });
  assert.deepEqual(exigidoAlSentar("RAPIDO", "DEUDA"), { cedula: false, telefono: false });
  assert.deepEqual(exigidoAlSentar("SEGURO", "DEUDA"), { cedula: true, telefono: false });
});

test("B6-22: al completar, la cédula siempre; el teléfono con «Siempre» o si queda debiendo", () => {
  assert.deepEqual(exigidoAlCompletar("SIEMPRE", false), { cedula: true, telefono: true });
  assert.deepEqual(exigidoAlCompletar("DEUDA", false), { cedula: true, telefono: false });
  assert.deepEqual(exigidoAlCompletar("DEUDA", true), { cedula: true, telefono: true });
});

test("B6-22: el primer pedido sale sin cédula; el segundo, no", () => {
  assert.equal(pideLaCedula({ sinCedula: true, pedidos: 0 }), false);
  assert.equal(pideLaCedula({ sinCedula: true, pedidos: 1 }), true);
  assert.equal(pideLaCedula({ sinCedula: true, pedidos: 3 }), true);
  assert.equal(pideLaCedula({ sinCedula: false, pedidos: 3 }), false);
});
