/**
 * Pruebas del plano y la carta — F6-01, F6-03.
 *
 * Se prueba lo que impide: dos mesas con el mismo número y un plato sin precio.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FloorPlanSchema, MenuSchema } from "./restaurante.ts";

const mesa = (id: string, label: string) => ({ id, label, zone: "Salón", seats: 4 });
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
