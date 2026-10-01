import { test } from "node:test";
import assert from "node:assert/strict";
import { leerVinculacion } from "./vinculacion.ts";

test("se lee la orden entera del panel, las dos cosas sueltas o solo el código", () => {
  assert.deepEqual(leerVinculacion("l2-impresion instalar https://l2.abby.com/ k7mq-4xpz"), { servidor: "https://l2.abby.com", codigo: "K7MQ-4XPZ" });
  assert.deepEqual(leerVinculacion("  K7MQ4XPZ   http://192.168.1.10:3001 "), { servidor: "http://192.168.1.10:3001", codigo: "K7MQ-4XPZ" });
  assert.deepEqual(leerVinculacion("HKP7-AYY5"), { servidor: null, codigo: "HKP7-AYY5" });
  assert.deepEqual(leerVinculacion("no sé"), { servidor: null, codigo: null });
});
