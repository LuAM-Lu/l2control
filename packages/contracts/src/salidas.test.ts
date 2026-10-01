import { test } from "node:test";
import assert from "node:assert/strict";
import { RegistrarConteoCommandSchema, RegistrarSalidaCommandSchema } from "./salidas.ts";

const ID = "0199a0c0-0000-7000-8000-0000000000a1";
const OTRO = "0199a0c0-0000-7000-8000-0000000000a2";
const CLAVE = "0199a0c0-0000-7000-8000-0000000000ff";

test("una salida: motivo de lista cerrada, detalle opcional y unidades enteras", () => {
  const ok = { idempotencyKey: CLAVE, motivo: "MERMA", detalle: "Se rompieron al descargar", lineas: [{ productId: ID, cantidad: 2 }] };
  assert.equal(RegistrarSalidaCommandSchema.safeParse(ok).success, true);
  const malas: unknown[] = [
    { ...ok, motivo: "VARIOS" },
    { ...ok, motivo: undefined },
    { ...ok, lineas: [] },
    { ...ok, lineas: [{ productId: ID, cantidad: 0 }] },
    { ...ok, lineas: [{ productId: ID, cantidad: 1 }, { productId: ID, cantidad: 1 }] },
    { ...ok, detalle: "x" },
    { ...ok, autorizadoPor: OTRO }, // quién autoriza no va en el mando: va con su PIN
  ];
  for (const [i, m] of malas.entries()) assert.equal(RegistrarSalidaCommandSchema.safeParse(m).success, false, String(i));
});

test("un conteo: lo esperado y lo contado de cada producto, una vez", () => {
  const ok = { idempotencyKey: CLAVE, lineas: [{ productId: ID, esperado: 10, contado: 7 }, { productId: OTRO, esperado: 3, contado: 3 }] };
  assert.equal(RegistrarConteoCommandSchema.safeParse(ok).success, true);
  assert.equal(RegistrarConteoCommandSchema.safeParse({ ...ok, lineas: [{ productId: ID, esperado: 1, contado: -1 }] }).success, false);
  assert.equal(RegistrarConteoCommandSchema.safeParse({ ...ok, lineas: [ok.lineas[0], ok.lineas[0]] }).success, false);
  assert.equal(RegistrarConteoCommandSchema.safeParse({ ...ok, lineas: [] }).success, false);
});
