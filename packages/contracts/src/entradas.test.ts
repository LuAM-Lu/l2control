import { test } from "node:test";
import assert from "node:assert/strict";
import { RegistrarEntradaCommandSchema } from "./entradas.ts";

const ID = "0199a0c0-0000-7000-8000-0000000000a1";
const OTRO = "0199a0c0-0000-7000-8000-0000000000a2";
const linea = { productId: ID, bultos: 2, unidadesPorBulto: 24, costoBultoMinor: "1200" };
const entrada = { idempotencyKey: "0199a0c0-0000-7000-8000-0000000000ff", tipo: "COMPRA", proveedor: "Distribuidora Polar", lineas: [linea] };

test("una compra de varias líneas, con proveedor y factura opcionales", () => {
  assert.equal(RegistrarEntradaCommandSchema.safeParse(entrada).success, true);
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, proveedor: undefined, tipo: "REPOSICION", lineas: [linea, { ...linea, productId: OTRO, costoBultoMinor: "0" }] }).success, true);
});

test("lo que no entra: sin líneas, un producto dos veces, cantidades y costos mal escritos", () => {
  const malas: unknown[] = [
    { ...entrada, lineas: [] },
    { ...entrada, lineas: [linea, linea] },
    { ...entrada, lineas: [{ ...linea, bultos: 0 }] },
    { ...entrada, lineas: [{ ...linea, unidadesPorBulto: 1.5 }] },
    { ...entrada, lineas: [{ ...linea, costoBultoMinor: "12,00" }] },
    { ...entrada, lineas: [{ ...linea, costoBultoMinor: "-1" }] },
    { ...entrada, tipo: "REGALO" },
    { ...entrada, recibidaEn: "2026-09-30T10:00:00.000Z" }, // el instante lo pone el servidor
  ];
  for (const [i, m] of malas.entries()) assert.equal(RegistrarEntradaCommandSchema.safeParse(m).success, false, String(i));
});
