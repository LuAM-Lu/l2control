/**
 * Pruebas del contrato del catálogo — F8-02 (B9-1).
 *
 * Se prueba lo que impide: un precio cero o en bolívares, un producto sin nombre o con un nombre
 * que no cabe en la caja, un cambio que declara el instante desde el navegador y un «borrar».
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CatalogoSchema, ProductoCommandSchema, TramoPrecioSchema } from "./productos.ts";

const ID = "0192f0a0-0000-7000-8000-000000000001";
const nuevo = { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", controlaStock: true, precioMinor: "100" };

describe("los cambios del catálogo", () => {
  test("crear un producto con su primer precio", () => {
    assert.equal(ProductoCommandSchema.safeParse({ kind: "CREAR", producto: nuevo }).success, true);
  });

  test("el precio es mayor que cero y va en centavos, no con coma", () => {
    for (const precioMinor of ["0", "1,50", "-100", "1.50", ""]) {
      assert.equal(ProductoCommandSchema.safeParse({ kind: "CREAR", producto: { ...nuevo, precioMinor } }).success, false, precioMinor);
    }
  });

  test("el nombre cabe en el botón de la caja", () => {
    assert.equal(ProductoCommandSchema.safeParse({ kind: "CREAR", producto: { ...nuevo, nombre: " " } }).success, false);
    assert.equal(ProductoCommandSchema.safeParse({ kind: "CREAR", producto: { ...nuevo, nombre: "x".repeat(41) } }).success, false);
  });

  test("el trato del IVA es general o exento: el reducido no se usa en el local (v0.30.1)", () => {
    assert.equal(ProductoCommandSchema.safeParse({ kind: "CREAR", producto: { ...nuevo, taxCode: "SUPER" } }).success, false);
    assert.equal(ProductoCommandSchema.safeParse({ kind: "CREAR", producto: { ...nuevo, taxCode: "EXENTA" } }).success, true);
    const r = ProductoCommandSchema.safeParse({ kind: "CREAR", producto: { ...nuevo, taxCode: "REDUCIDA" } });
    assert.equal(r.success, false);
    assert.match(r.error?.issues[0]?.message ?? "", /no usa el IVA reducido/);
    const editar = { kind: "EDITAR", productId: ID, nombre: "Agua", categoria: "Bebidas", taxCode: "REDUCIDA", controlaStock: true };
    assert.equal(ProductoCommandSchema.safeParse(editar).success, false);
  });

  test("un precio se programa con su DÍA; el instante no lo dice el navegador", () => {
    assert.equal(ProductoCommandSchema.safeParse({ kind: "PROGRAMAR_PRECIO", productId: ID, precioMinor: "120", dia: "2026-10-01" }).success, true);
    assert.equal(
      ProductoCommandSchema.safeParse({ kind: "PROGRAMAR_PRECIO", productId: ID, precioMinor: "120", dia: "2026-10-01", desde: "2026-09-01T00:00:00.000Z" }).success,
      false,
    );
  });

  test("no hay borrar: un producto se aparta", () => {
    assert.equal(ProductoCommandSchema.safeParse({ kind: "BORRAR", productId: ID }).success, false);
    assert.equal(ProductoCommandSchema.safeParse({ kind: "ACTIVAR", productId: ID, activo: false }).success, true);
  });
});

describe("el catálogo que llega a la caja", () => {
  const tramo = {
    id: "t1",
    precio: { minor: "100", currency: "USD" },
    desde: "2026-09-27T14:00:00.000Z",
    hasta: null,
    programadoEl: "2026-09-27T14:00:00.000Z",
    programadoPor: "Abigail Karam",
  };

  test("un precio del catálogo va en dólares", () => {
    assert.equal(TramoPrecioSchema.safeParse(tramo).success, true);
    assert.equal(TramoPrecioSchema.safeParse({ ...tramo, precio: { minor: "100", currency: "VES" } }).success, false);
  });

  test("un catálogo vacío vale: es un local nuevo", () => {
    assert.equal(CatalogoSchema.safeParse({ productos: [], zonaHoraria: "America/Caracas", diasPorAdelantado: 366 }).success, true);
  });

  test("dos productos no comparten identificador", () => {
    const p = { id: "p1", nombre: "Agua", categoria: "Bebidas", taxCode: "GENERAL", controlaStock: true, activo: true, precios: [tramo] };
    assert.equal(CatalogoSchema.safeParse({ productos: [p, p], zonaHoraria: "America/Caracas", diasPorAdelantado: 366 }).success, false);
  });
});
