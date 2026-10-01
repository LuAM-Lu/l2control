/**
 * Pruebas del plano — F6-01, B6-1.
 *
 * Se prueba lo que impide: dos mesas con el mismo número, mesas fuera del local o encimadas.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FloorPlanSchema, PlanoLocalSchema, PublicarPlanoCommandSchema } from "./restaurante.ts";

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

describe("plano de mesas (F6-01)", () => {
  test("un plano con mesas distintas es válido", () => {
    assert.equal(FloorPlanSchema.safeParse([mesa("m1", "1"), mesa("m2", "2")]).success, true);
  });

  test("dos mesas con el mismo número se rechazan", () => {
    assert.equal(FloorPlanSchema.safeParse([mesa("m1", "1"), mesa("m2", "1")]).success, false);
  });

  test("un plano vacío se rechaza", () => {
    assert.equal(FloorPlanSchema.safeParse([]).success, false);
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

describe("una mesa se retira, no se borra (V4, regla 5)", () => {
  const conGeo = (id: string, label: string, x: number, extra: object = {}) => ({
    ...mesa(id, label),
    x,
    y: 240,
    ...extra,
  });
  const plano = (tables: object[]) => ({ width: 800, height: 600, tables, fixtures: [] });

  test("una retirada conserva su número aunque otra lo reutilice", () => {
    const r = PlanoLocalSchema.safeParse(
      plano([conGeo("m1", "3", 130, { retiredAt: "2026-09-14T12:00:00.000Z" }), conGeo("m2", "3", 400)]),
    );
    assert.equal(r.success, true);
  });

  test("dos mesas del salón con el mismo número siguen sin pasar", () => {
    assert.equal(PlanoLocalSchema.safeParse(plano([conGeo("m1", "3", 130), conGeo("m2", "3", 400)])).success, false);
  });

  test("una retirada no estorba: puede quedar donde estaba otra", () => {
    const r = PlanoLocalSchema.safeParse(
      plano([conGeo("m1", "1", 130, { retiredAt: "2026-09-14T12:00:00.000Z" }), conGeo("m2", "2", 140)]),
    );
    assert.equal(r.success, true);
  });
});

describe("publicar el plano (B6-1)", () => {
  test("lleva el plano y la versión que se editó; nada más", () => {
    const plano = { width: 800, height: 600, tables: [mesa("m1", "1")], fixtures: [] };
    assert.equal(PublicarPlanoCommandSchema.safeParse({ plano, sobre: null }).success, true);
    assert.equal(PublicarPlanoCommandSchema.safeParse({ plano, sobre: 3 }).success, true);
    assert.equal(PublicarPlanoCommandSchema.safeParse({ plano, sobre: 3, publicadoEn: "2026-10-01T00:00:00.000Z" }).success, false);
    assert.equal(PublicarPlanoCommandSchema.safeParse({ plano: { ...plano, tables: [] }, sobre: null }).success, false);
  });
});
