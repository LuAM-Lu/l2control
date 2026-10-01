/**
 * Pruebas del contrato del catálogo — F8-02 (B9-1).
 *
 * Se prueba lo que impide: un precio cero o en bolívares, un producto sin nombre o con un nombre
 * que no cabe en la caja, un cambio que declara el instante desde el navegador y un «borrar».
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CatalogoSchema, ProductoCommandSchema, ProductoNuevoSchema, ProductoSchema, TramoPrecioSchema } from "./productos.ts";

const ID = "0192f0a0-0000-7000-8000-000000000001";
const nuevo = { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "100" };

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
    const editar = { kind: "EDITAR", productId: ID, nombre: "Agua", categoria: "Bebidas", taxCode: "REDUCIDA", tipo: "PRODUCTO", codigoBarras: null, presentacion: null };
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
    assert.equal(ProductoCommandSchema.safeParse({ kind: "EN_CARTA", productId: ID, enCarta: false }).success, true);
    assert.equal(ProductoCommandSchema.safeParse({ kind: "EN_CARTA", productId: ID }).success, false);
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
    const p = { id: "p1", nombre: "Agua", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", controlaStock: true, sku: "BEB-0001", codigoBarras: null, presentacion: null, activo: true, enCarta: true, precios: [tramo], existencia: 3, costoPromedio: null, ultimoBulto: null, minimo: null, valor: null };
    assert.equal(CatalogoSchema.safeParse({ productos: [p, p], zonaHoraria: "America/Caracas", diasPorAdelantado: 366 }).success, false);
  });

  test("la existencia: solo de lo que controla stock, entera y nunca negativa (B9-2)", () => {
    const p = { id: "p1", nombre: "Agua", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", controlaStock: true, sku: "BEB-0001", codigoBarras: null, presentacion: null, activo: true, enCarta: true, precios: [tramo], existencia: 0, costoPromedio: null, ultimoBulto: null, minimo: 5, valor: null };
    assert.equal(ProductoSchema.safeParse(p).success, true);
    assert.equal(ProductoSchema.safeParse({ ...p, existencia: null }).success, false);
    assert.equal(ProductoSchema.safeParse({ ...p, existencia: -1 }).success, false);
    assert.equal(ProductoSchema.safeParse({ ...p, tipo: "PREPARADO", controlaStock: false, existencia: null, minimo: null }).success, true);
    assert.equal(ProductoSchema.safeParse({ ...p, tipo: "PREPARADO", controlaStock: false, existencia: null }).success, false); // un mínimo sin existencia
    assert.equal(ProductoSchema.safeParse({ ...p, tipo: "PREPARADO", controlaStock: false, existencia: 2 }).success, false);
  });

  test("el costo promedio: solo con existencia (B9-3)", () => {
    const p = { id: "p1", nombre: "Agua", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", controlaStock: true, sku: "BEB-0001", codigoBarras: null, presentacion: null, activo: true, enCarta: true, precios: [tramo], existencia: 0, costoPromedio: null, ultimoBulto: 24, minimo: null, valor: null };
    assert.equal(ProductoSchema.safeParse(p).success, true);
    assert.equal(ProductoSchema.safeParse({ ...p, costoPromedio: { minor: "55", currency: "USD" } }).success, false);
    assert.equal(ProductoSchema.safeParse({ ...p, existencia: 10, costoPromedio: { minor: "55", currency: "USD" } }).success, true);
  });
});

describe("identificación y tipo (B9-6)", () => {
  const tramo = { id: "t1", precio: { minor: "100", currency: "USD" }, desde: "2026-09-27T14:00:00.000Z", hasta: null, programadoEl: "2026-09-27T14:00:00.000Z", programadoPor: "Abigail Karam" };
  test("el código de barras se guarda sin espacios y en mayúsculas; solo un producto lo lleva", () => {
    const r = ProductoNuevoSchema.safeParse({ ...nuevo, codigoBarras: " 4006381 333931 " });
    assert.equal(r.success && r.data.codigoBarras, "4006381333931");
    assert.equal(ProductoNuevoSchema.safeParse({ ...nuevo, tipo: "SERVICIO", codigoBarras: "4006381333931" }).success, false);
    assert.equal(ProductoNuevoSchema.safeParse({ ...nuevo, codigoBarras: "ab" }).success, false);
    assert.equal(ProductoNuevoSchema.safeParse({ ...nuevo, tipo: "OTRO" }).success, false);
    assert.equal(ProductoNuevoSchema.safeParse({ ...nuevo, controlaStock: true }).success, false); // ya no: lo dice el tipo
  });

  test("el tipo y el control de existencia dicen lo mismo; el SKU tiene su forma", () => {
    const p = { id: "p1", nombre: "Agua", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", controlaStock: true, sku: "BEB-0001", codigoBarras: null, presentacion: "Botella 600 ml", activo: true, enCarta: true, precios: [tramo], existencia: 3, costoPromedio: null, ultimoBulto: null, minimo: null, valor: { minor: "150", currency: "USD" } };
    assert.equal(ProductoSchema.safeParse(p).success, true);
    assert.equal(ProductoSchema.safeParse({ ...p, tipo: "SERVICIO" }).success, false);
    assert.equal(ProductoSchema.safeParse({ ...p, sku: "beb-1" }).success, false);
  });
});
