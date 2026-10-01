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

test("una línea puede dar de alta un producto nuevo con su ficha corta (B9-6)", () => {
  const nuevo = { nombre: "Refresco de uva", categoria: "Bebidas", taxCode: "GENERAL", precioMinor: "150", codigoBarras: "4006381333931", presentacion: "Lata 355 ml" };
  const conNuevo = { ...entrada, lineas: [linea, { nuevo, bultos: 1, unidadesPorBulto: 24, costoBultoMinor: "1200" }] };
  assert.equal(RegistrarEntradaCommandSchema.safeParse(conNuevo).success, true);
  // Dos nuevos con el mismo nombre o el mismo código no van en la misma entrada.
  const repetido = { ...entrada, lineas: [{ nuevo, bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "0" }, { nuevo: { ...nuevo, codigoBarras: undefined }, bultos: 1, unidadesPorBulto: 1, costoBultoMinor: "0" }] };
  assert.equal(RegistrarEntradaCommandSchema.safeParse(repetido).success, false);
  // Una línea es de un producto o de uno nuevo, no de los dos.
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, lineas: [{ ...linea, nuevo }] }).success, false);
});
