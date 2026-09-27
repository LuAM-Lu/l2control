/**
 * Pruebas del catálogo de productos — F8-02 (B9-1).
 *
 * Lo que fijan: el precio es un calendario (cambiarlo no altera lo que rigió), un cambio futuro se
 * corrige o se cancela programando otro para el mismo día, no se programa hacia atrás ni un precio
 * cero, y la caja solo ofrece lo que está a la venta y tiene precio en ese instante.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRICE_MINOR,
  categoriesOf,
  changesTimeline,
  nameClash,
  nameKey,
  priceAt,
  priceProblem,
  priceTimeline,
  sellableAt,
  type ScheduledPrice,
} from "./index.ts";

const H = 3_600_000;
const DIA = 24 * H;
const T0 = Date.UTC(2026, 8, 27, 14); // domingo 27 sep 2026, 10:00 am en Caracas

const precio = (id: string, productId: string, amountMinor: bigint, effectiveFrom: number, scheduledAt = effectiveFrom): ScheduledPrice => ({
  id,
  productId,
  amountMinor,
  effectiveFrom,
  scheduledAt,
});

describe("el precio es un calendario", () => {
  const agua = [precio("a1", "agua", 100n, T0), precio("a2", "agua", 120n, T0 + DIA, T0 + H)];

  test("cada tramo dura hasta el siguiente", () => {
    const tramos = priceTimeline(agua);
    assert.equal(tramos.length, 2);
    assert.equal(tramos[0]!.effectiveTo, T0 + DIA);
    assert.equal(tramos[1]!.effectiveTo, null);
  });

  test("cambiar el precio no altera el que rigió: lo vendido ayer sigue valiendo lo de ayer", () => {
    const tramos = priceTimeline(agua);
    assert.equal(priceAt(tramos, "agua", T0 + 2 * H)?.amount, 100n);
    assert.equal(priceAt(tramos, "agua", T0 + DIA)?.amount, 120n);
    assert.equal(priceAt(tramos, "agua", T0 + 30 * DIA)?.amount, 120n);
  });

  test("antes de su primer precio no hay precio: no se supone un cero", () => {
    assert.equal(priceAt(priceTimeline(agua), "agua", T0 - 1), null);
    assert.equal(priceAt(priceTimeline(agua), "malta", T0), null);
  });

  test("con el mismo comienzo manda el programado después: así se corrige un cambio futuro", () => {
    const corregido = [...agua, precio("a3", "agua", 150n, T0 + DIA, T0 + 2 * H)];
    assert.equal(priceAt(priceTimeline(corregido), "agua", T0 + DIA)?.amount, 150n);
  });

  test("programar el precio que rige para ese día cancela el cambio", () => {
    const cancelado = [...agua, precio("a3", "agua", 100n, T0 + DIA, T0 + 2 * H)];
    const tramos = priceTimeline(cancelado);
    assert.equal(tramos.length, 1);
    assert.equal(tramos[0]!.effectiveTo, null);
    assert.equal(priceAt(tramos, "agua", T0 + 5 * DIA)?.amount, 100n);
  });

  test("los productos no se mezclan", () => {
    const tramos = priceTimeline([...agua, precio("m1", "malta", 150n, T0)]);
    assert.equal(priceAt(tramos, "malta", T0 + DIA)?.amount, 150n);
    assert.equal(priceAt(tramos, "agua", T0 + DIA)?.amount, 120n);
  });

  test("el precio sale en dólares", () => {
    assert.equal(priceAt(priceTimeline(agua), "agua", T0)?.currency, "USD");
  });
});

describe("qué se puede programar", () => {
  const agua = [precio("a1", "agua", 100n, T0)];

  test("lo que no cambia el calendario no se guarda", () => {
    assert.equal(changesTimeline(agua, precio("x", "agua", 100n, T0 + DIA, T0 + H)), false);
    assert.equal(changesTimeline(agua, precio("x", "agua", 120n, T0 + DIA, T0 + H)), true);
  });

  test("el primer precio de un producto siempre cambia algo", () => {
    assert.equal(changesTimeline(agua, precio("x", "malta", 100n, T0 + H)), true);
  });

  test("ni cero ni negativo: lo que se regala es una cortesía, con su firma", () => {
    assert.equal(priceProblem({ amountMinor: 0n, effectiveFrom: T0 }, T0), "NO_POSITIVO");
    assert.equal(priceProblem({ amountMinor: -100n, effectiveFrom: T0 }, T0), "NO_POSITIVO");
  });

  test("por encima del tope, alguien se equivocó de moneda", () => {
    assert.equal(priceProblem({ amountMinor: MAX_PRICE_MINOR, effectiveFrom: T0 }, T0), null);
    assert.equal(priceProblem({ amountMinor: MAX_PRICE_MINOR + 1n, effectiveFrom: T0 }, T0), "EXCESIVO");
  });

  test("nunca hacia atrás", () => {
    assert.equal(priceProblem({ amountMinor: 100n, effectiveFrom: T0 - 1 }, T0), "EN_EL_PASADO");
    assert.equal(priceProblem({ amountMinor: 100n, effectiveFrom: T0 }, T0), null);
  });
});

describe("un nombre, un producto", () => {
  const productos = [
    { id: "p1", name: "Café con leche", category: "Café", active: true },
    { id: "p2", name: "Agua mineral", category: "Bebidas", active: false },
  ];

  test("sin mayúsculas, acentos ni espacios de más", () => {
    assert.equal(nameKey("  CAFÉ   con  Leche "), "cafe con leche");
    assert.equal(nameClash(productos, "cafe con leche")?.id, "p1");
  });

  test("uno que no se vende también choca: se vuelve a poner a la venta", () => {
    assert.equal(nameClash(productos, "Agua Mineral")?.id, "p2");
  });

  test("renombrarse a sí mismo no choca", () => {
    assert.equal(nameClash(productos, "Café con Leche", "p1"), undefined);
  });
});

describe("lo que ofrece la caja", () => {
  const productos = [
    { id: "agua", name: "Agua mineral", category: "Bebidas", active: true },
    { id: "malta", name: "Malta", category: "bebidas ", active: true },
    { id: "oreo", name: "Galletas", category: "Golosinas", active: false },
    { id: "cafe", name: "Café", category: "Café", active: true },
  ];
  const tramos = priceTimeline([
    precio("1", "agua", 100n, T0),
    precio("2", "malta", 150n, T0),
    precio("3", "oreo", 120n, T0),
    precio("4", "cafe", 100n, T0 + DIA, T0),
  ]);

  test("activo y con precio en ese instante, con ese precio", () => {
    const hoy = sellableAt(productos, tramos, T0 + H);
    assert.deepEqual(hoy.map((p) => p.id), ["agua", "malta"]);
    assert.equal(hoy[1]!.price.amount, 150n);
  });

  test("el que tiene su primer precio mañana entra mañana", () => {
    assert.deepEqual(sellableAt(productos, tramos, T0 + DIA).map((p) => p.id), ["agua", "malta", "cafe"]);
  });

  test("las categorías salen de lo que se vende, sin repetir", () => {
    assert.deepEqual(categoriesOf(sellableAt(productos, tramos, T0 + DIA)), ["Bebidas", "Café"]);
  });
});
