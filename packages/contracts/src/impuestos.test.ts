/**
 * Pruebas de la tabla de impuestos — F3-06, F3-07, B2-2.
 *
 * Se prueba lo que impide: dos vigencias del mismo impuesto pisándose, una que
 * termina antes de empezar, un IVA sin trato o un IGTF con él, programar lo
 * exento, y que el navegador declare quién programa o desde qué instante.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ImpuestosSchema, ProgramarImpuestoCommandSchema, VigenciaImpuestoSchema } from "./impuestos.ts";

let n = 0;
const vigencia = (impuesto: "IVA" | "IGTF", code: string | null, basisPoints: number, desde = "2026-09-01T04:00:00.000Z", hasta: string | null = null) => ({
  id: `v${++n}`,
  impuesto,
  code,
  basisPoints,
  desde,
  hasta,
  programadaEl: "2026-09-01T04:00:00.000Z",
  programadaPor: "Abigail Karam",
});

const tabla = (vigencias: unknown[]) => ({ vigencias, zonaHoraria: "America/Caracas", diasPorAdelantado: 366 });
const BASE = [vigencia("IVA", "GENERAL", 1600), vigencia("IVA", "REDUCIDA", 800), vigencia("IGTF", null, 300)];

describe("una vigencia (F3-06)", () => {
  test("el IVA general al 16 %, abierta, es válida", () => {
    assert.equal(VigenciaImpuestoSchema.safeParse(vigencia("IVA", "GENERAL", 1600)).success, true);
  });

  test("la alícuota va en puntos básicos enteros y no pasa del 100 %", () => {
    for (const bp of [16, 10_001, 1600.5, -100]) {
      const r = VigenciaImpuestoSchema.safeParse(vigencia("IVA", "GENERAL", bp));
      assert.equal(r.success, bp === 16, `basisPoints ${bp}`);
    }
  });

  test("el IVA lleva trato y el IGTF no", () => {
    assert.equal(VigenciaImpuestoSchema.safeParse(vigencia("IVA", null, 1600)).success, false);
    assert.equal(VigenciaImpuestoSchema.safeParse(vigencia("IGTF", "GENERAL", 300)).success, false);
  });

  test("lo exento no es una vigencia: es cero siempre", () => {
    assert.equal(VigenciaImpuestoSchema.safeParse(vigencia("IVA", "EXENTA", 0)).success, false);
  });

  test("una vigencia no termina antes de empezar", () => {
    const r = VigenciaImpuestoSchema.safeParse(vigencia("IVA", "GENERAL", 1600, "2026-09-10T04:00:00.000Z", "2026-09-01T04:00:00.000Z"));
    assert.equal(r.success, false);
  });
});

describe("el calendario", () => {
  test("vacío vale: un local nuevo aún no tiene impuestos (y la caja no cobra)", () => {
    assert.equal(ImpuestosSchema.safeParse(tabla([])).success, true);
  });

  test("una vigencia cerrada seguida de la siguiente del mismo impuesto es válida", () => {
    const r = ImpuestosSchema.safeParse(
      tabla([
        vigencia("IVA", "GENERAL", 1600, "2026-09-01T04:00:00.000Z", "2026-10-01T04:00:00.000Z"),
        vigencia("IVA", "GENERAL", 1500, "2026-10-01T04:00:00.000Z"),
        ...BASE.slice(1),
      ]),
    );
    assert.equal(r.success, true);
  });

  test("dos vigencias del mismo impuesto que se pisan se rechazan", () => {
    const r = ImpuestosSchema.safeParse(tabla([...BASE, vigencia("IVA", "GENERAL", 1500, "2026-09-15T04:00:00.000Z")]));
    assert.equal(r.success, false);
  });

  test("el general y el reducido no se pisan entre sí", () => {
    assert.equal(ImpuestosSchema.safeParse(tabla(BASE)).success, true);
  });
});

describe("programar un cambio", () => {
  const cmd = { impuesto: "IVA", code: "GENERAL", basisPoints: 1500, dia: "2026-10-01" };

  test("un IVA general para un día es válido", () => {
    assert.equal(ProgramarImpuestoCommandSchema.safeParse(cmd).success, true);
  });

  test("el IGTF, sin trato", () => {
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ impuesto: "IGTF", code: null, basisPoints: 300, dia: "2026-10-01" }).success, true);
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ ...cmd, impuesto: "IGTF" }).success, false);
  });

  test("lo exento no se programa", () => {
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ ...cmd, code: "EXENTA", basisPoints: 0 }).success, false);
  });

  test("un IGTF del 100 % no tiene pago que lo cubra", () => {
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ impuesto: "IGTF", code: null, basisPoints: 10_000, dia: "2026-10-01" }).success, false);
  });

  test("el navegador no dice quién programa ni desde qué instante (ADR-017)", () => {
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ ...cmd, por: "Abigail Karam" }).success, false);
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ ...cmd, desde: "2026-10-01T04:00:00.000Z" }).success, false);
  });

  test("el día es un día, no un instante", () => {
    assert.equal(ProgramarImpuestoCommandSchema.safeParse({ ...cmd, dia: "2026-10-01T04:00:00.000Z" }).success, false);
  });
});
