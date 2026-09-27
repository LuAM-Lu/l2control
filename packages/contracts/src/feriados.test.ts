/**
 * Pruebas de los feriados bancarios en el cable — B2-4, D-FER.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FeriadosSchema, RegistrarFeriadoCommandSchema, RetirarFeriadoCommandSchema } from "./feriados.ts";

const feriado = (dia: string, id = dia) => ({ id, dia, nombre: "Día de la Resistencia Indígena", registradoPor: "Abigail Karam", registradoEl: "2026-09-27T14:00:00.000Z" });

describe("feriados", () => {
  test("registrar pide el día y el nombre, y nada más (ADR-017)", () => {
    assert.equal(RegistrarFeriadoCommandSchema.safeParse({ dia: "2026-10-12", nombre: "Resistencia Indígena" }).success, true);
    assert.equal(RegistrarFeriadoCommandSchema.safeParse({ dia: "2026-10-12", nombre: "" }).success, false);
    assert.equal(RegistrarFeriadoCommandSchema.safeParse({ dia: "12/10/2026", nombre: "Resistencia Indígena" }).success, false);
    assert.equal(RegistrarFeriadoCommandSchema.safeParse({ dia: "2026-10-12", nombre: "Resistencia Indígena", por: "Otra" }).success, false);
  });

  test("un día no está dos veces en la lista", () => {
    assert.equal(FeriadosSchema.safeParse({ feriados: [feriado("2026-10-12"), feriado("2026-12-25")] }).success, true);
    assert.equal(FeriadosSchema.safeParse({ feriados: [feriado("2026-10-12", "a"), feriado("2026-10-12", "b")] }).success, false);
  });

  test("retirar se pide por su identificador", () => {
    assert.equal(RetirarFeriadoCommandSchema.safeParse({ feriadoId: "01a0e11b-879b-75dd-bb18-70f1c287e118" }).success, true);
    assert.equal(RetirarFeriadoCommandSchema.safeParse({ dia: "2026-10-12" }).success, false);
  });
});
