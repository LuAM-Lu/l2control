import { test } from "node:test";
import assert from "node:assert/strict";
import { CambioSchema, EventoDelNavegadorSchema } from "./tiempo-real.ts";

const id = "0199a0c0-0000-7000-8000-0000000000e1";
const at = "2026-09-29T15:00:00.000Z";

test("un cambio nombra al menos un tema conocido", () => {
  assert.equal(CambioSchema.safeParse({ temas: ["sala", "cuentas"] }).success, true);
  assert.equal(CambioSchema.safeParse({ temas: [] }).success, false);
  assert.equal(CambioSchema.safeParse({ temas: ["todo"] }).success, false);
});

test("una pantalla manda eventos del restaurante, no lo que ya sabe el servidor", () => {
  assert.equal(EventoDelNavegadorSchema.safeParse({ id, at, type: "mesa.pide_cuenta", tableId: "m1" }).success, true);
  // La sala es del servidor desde B4-2: un navegador no cierra una estancia por el bus.
  assert.equal(EventoDelNavegadorSchema.safeParse({ id, at, type: "estancia.cerrada", sessionId: id }).success, false);
  // Ni declara un pedido: es del servidor desde B6-2.
  assert.equal(EventoDelNavegadorSchema.safeParse({ id, at, type: "pedido.listo", orderId: id }).success, false);
});
