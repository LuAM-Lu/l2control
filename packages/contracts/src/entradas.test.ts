import { test } from "node:test";
import assert from "node:assert/strict";
import { RegistrarEntradaCommandSchema } from "./entradas.ts";

const ID = "0199a0c0-0000-7000-8000-0000000000a1";
const OTRO = "0199a0c0-0000-7000-8000-0000000000a2";
const porBulto = (minor: string) => ({ por: "BULTO", minor });
const linea = { productId: ID, bultos: 2, unidadesPorBulto: 24, costo: porBulto("1200") };
const entrada = { idempotencyKey: "0199a0c0-0000-7000-8000-0000000000ff", tipo: "COMPRA", proveedor: "Distribuidora Polar", lineas: [linea] };

test("una compra de varias líneas, con proveedor y factura opcionales", () => {
  assert.equal(RegistrarEntradaCommandSchema.safeParse(entrada).success, true);
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, proveedor: undefined, tipo: "REPOSICION", lineas: [linea, { ...linea, productId: OTRO, costo: porBulto("0") }] }).success, true);
});

test("el costo de una línea va por unidad, por bulto o en total (M-24)", () => {
  for (const por of ["UNIDAD", "BULTO", "TOTAL"]) {
    assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, lineas: [{ ...linea, costo: { por, minor: "50" } }] }).success, true, por);
  }
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, lineas: [{ ...linea, costo: { por: "CAJA", minor: "50" } }] }).success, false);
  // La forma de antes (el costo del bulto suelto) ya no se acepta: la web y el servidor van juntos.
  const { costo: _, ...sinCosto } = linea;
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, lineas: [{ ...sinCosto, costoBultoMinor: "1200" }] }).success, false);
});

test("el inventario inicial no tiene proveedor ni factura, y admite hasta 300 líneas (T-10)", () => {
  const inicial = { idempotencyKey: entrada.idempotencyKey, tipo: "INICIAL", lineas: [linea] };
  assert.equal(RegistrarEntradaCommandSchema.safeParse(inicial).success, true);
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...inicial, proveedor: "Distribuidora Polar" }).success, false);
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...inicial, factura: "A-1" }).success, false);
  const muchas = Array.from({ length: 300 }, (_, i) => ({ ...linea, productId: `0199a0c0-0000-7000-8000-${String(i).padStart(12, "0")}` }));
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...inicial, lineas: muchas }).success, true);
  const demasiadas = [...muchas, { ...linea, productId: OTRO }];
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...inicial, lineas: demasiadas }).success, false);
});

test("lo que no entra: sin líneas, un producto dos veces, cantidades y costos mal escritos", () => {
  const malas: unknown[] = [
    { ...entrada, lineas: [] },
    { ...entrada, lineas: [linea, linea] },
    { ...entrada, lineas: [{ ...linea, bultos: 0 }] },
    { ...entrada, lineas: [{ ...linea, unidadesPorBulto: 1.5 }] },
    { ...entrada, lineas: [{ ...linea, costo: porBulto("12,00") }] },
    { ...entrada, lineas: [{ ...linea, costo: porBulto("-1") }] },
    { ...entrada, tipo: "REGALO" },
    { ...entrada, recibidaEn: "2026-09-30T10:00:00.000Z" }, // el instante lo pone el servidor
  ];
  for (const [i, m] of malas.entries()) assert.equal(RegistrarEntradaCommandSchema.safeParse(m).success, false, String(i));
});

test("una línea puede dar de alta un producto nuevo con su ficha corta (B9-6)", () => {
  const nuevo = { nombre: "Refresco de uva", categoria: "Bebidas", taxCode: "GENERAL", precioMinor: "150", codigoBarras: "4006381333931", presentacion: "Lata 355 ml" };
  const conNuevo = { ...entrada, lineas: [linea, { nuevo, bultos: 1, unidadesPorBulto: 24, costo: porBulto("1200") }] };
  assert.equal(RegistrarEntradaCommandSchema.safeParse(conNuevo).success, true);
  // Dos nuevos con el mismo nombre o el mismo código no van en la misma entrada.
  const repetido = { ...entrada, lineas: [{ nuevo, bultos: 1, unidadesPorBulto: 1, costo: porBulto("0") }, { nuevo: { ...nuevo, codigoBarras: undefined }, bultos: 1, unidadesPorBulto: 1, costo: porBulto("0") }] };
  assert.equal(RegistrarEntradaCommandSchema.safeParse(repetido).success, false);
  // Una línea es de un producto o de uno nuevo, no de los dos.
  assert.equal(RegistrarEntradaCommandSchema.safeParse({ ...entrada, lineas: [{ ...linea, nuevo }] }).success, false);
});
