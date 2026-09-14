/**
 * Pruebas del plano y la carta — F6-01, F6-03.
 *
 * Se prueba lo que impide: dos mesas con el mismo número y un plato sin precio.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FloorPlanSchema, MenuSchema, PlanoLocalSchema } from "./restaurante.ts";

const mesa = (id: string, label: string) => ({
  id,
  label,
  zone: "Salón",
  seats: 4,
  shape: "REDONDA" as const,
  x: 100,
  y: 100,
  width: 90,
  height: 90,
  rotation: 0,
});
const plato = (id: string, minor: string) => ({
  id,
  name: "Tequeños",
  category: "Para compartir",
  price: { minor, currency: "USD" },
  available: true,
});

describe("plano de mesas y carta (F6-01, F6-03)", () => {
  test("un plano con mesas distintas es válido", () => {
    assert.equal(FloorPlanSchema.safeParse([mesa("m1", "1"), mesa("m2", "2")]).success, true);
  });

  test("dos mesas con el mismo número se rechazan", () => {
    assert.equal(FloorPlanSchema.safeParse([mesa("m1", "1"), mesa("m2", "1")]).success, false);
  });

  test("un plano vacío se rechaza", () => {
    assert.equal(FloorPlanSchema.safeParse([]).success, false);
  });

  test("un plato a precio cero no entra en la carta", () => {
    assert.equal(MenuSchema.safeParse([plato("t", "0")]).success, false);
    assert.equal(MenuSchema.safeParse([plato("t", "450")]).success, true);
  });
});

describe("plano del local con geometría (V3, D11)", () => {
  const mesa = (id: string, label: string, x: number, y: number) => ({
    id,
    label,
    zone: "Salón",
    seats: 4,
    shape: "REDONDA" as const,
    x,
    y,
    width: 90,
    height: 90,
    rotation: 0,
  });
  const plano = (tables: object[]) => ({ width: 800, height: 600, tables, fixtures: [] });
  const valido = (p: unknown) => PlanoLocalSchema.safeParse(p).success;

  test("un plano con mesas separadas y dentro de las paredes es válido", () => {
    assert.equal(valido(plano([mesa("m1", "1", 120, 235), mesa("m2", "2", 270, 235)])), true);
  });

  test("una mesa fuera de las paredes no se publica", () => {
    assert.equal(valido(plano([mesa("m1", "1", 780, 235)])), false);
  });

  test("dos mesas una encima de otra no se publican", () => {
    assert.equal(valido(plano([mesa("m1", "1", 120, 235), mesa("m2", "2", 150, 235)])), false);
  });

  test("el giro no mueve la mesa: 0 a 359 grados y nada más", () => {
    assert.equal(valido(plano([{ ...mesa("m1", "1", 120, 235), rotation: 359 }])), true);
    assert.equal(valido(plano([{ ...mesa("m1", "1", 120, 235), rotation: 400 }])), false);
  });

  test("dos mesas con el mismo número siguen sin pasar", () => {
    assert.equal(valido(plano([mesa("m1", "1", 120, 235), mesa("m2", "1", 400, 235)])), false);
  });
});
