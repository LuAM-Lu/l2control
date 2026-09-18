/**
 * Pruebas de la tabla de impuestos — F3-06, F3-07.
 *
 * Se prueba lo que impide: dos vigencias del mismo impuesto pisándose, un
 * «exento» que no es cero, quedarse sin vigencia abierta para un trato, y
 * editar el pasado en vez de programar el futuro.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ImpuestoCommandSchema,
  ImpuestosSchema,
  VigenciaIvaSchema,
} from "./impuestos.ts";

const abierta = (code: string, basisPoints: number, desde = "2026-01-01T00:00:00.000Z") => ({
  code,
  basisPoints,
  desde,
  hasta: null,
});

const tabla = {
  iva: [abierta("GENERAL", 1600), abierta("REDUCIDA", 800), abierta("EXENTA", 0)],
  igtfBasisPoints: 300,
  igtfDesde: "2026-01-01T00:00:00.000Z",
};

describe("una vigencia (F3-06)", () => {
  test("el IVA general al 16 %, abierta, es válida", () => {
    assert.equal(VigenciaIvaSchema.safeParse(abierta("GENERAL", 1600)).success, true);
  });

  test("la alícuota va en puntos básicos enteros y no pasa del 100 %", () => {
    for (const bp of [16, 10_001, 1600.5, -100]) {
      const r = VigenciaIvaSchema.safeParse(abierta("GENERAL", bp));
      assert.equal(r.success, bp === 16, `basisPoints ${bp}`);
    }
  });

  test("lo exento es cero: un «exento al 8 %» acabaría cobrándose", () => {
    assert.equal(VigenciaIvaSchema.safeParse(abierta("EXENTA", 800)).success, false);
    assert.equal(VigenciaIvaSchema.safeParse(abierta("EXENTA", 0)).success, true);
  });

  test("una vigencia no termina antes de empezar", () => {
    const r = VigenciaIvaSchema.safeParse({
      code: "GENERAL",
      basisPoints: 1600,
      desde: "2026-06-01T00:00:00.000Z",
      hasta: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(r.success, false);
  });
});

describe("la tabla completa (F3-06, F3-07)", () => {
  test("los tres tratos con su vigencia abierta y el IGTF", () => {
    assert.equal(ImpuestosSchema.safeParse(tabla).success, true);
  });

  test("dos vigencias del mismo impuesto no se pisan", () => {
    const solapadas = {
      ...tabla,
      iva: [
        { code: "GENERAL", basisPoints: 1600, desde: "2026-01-01T00:00:00.000Z", hasta: "2026-07-01T00:00:00.000Z" },
        { code: "GENERAL", basisPoints: 1400, desde: "2026-05-01T00:00:00.000Z", hasta: null },
        abierta("REDUCIDA", 800),
        abierta("EXENTA", 0),
      ],
    };
    assert.equal(ImpuestosSchema.safeParse(solapadas).success, false);
  });

  test("pero una detrás de otra sí: así es como cambia una alícuota", () => {
    const encadenadas = {
      ...tabla,
      iva: [
        { code: "GENERAL", basisPoints: 1600, desde: "2026-01-01T00:00:00.000Z", hasta: "2026-07-01T00:00:00.000Z" },
        { code: "GENERAL", basisPoints: 1400, desde: "2026-07-01T00:00:00.000Z", hasta: null },
        abierta("REDUCIDA", 800),
        abierta("EXENTA", 0),
      ],
    };
    assert.equal(ImpuestosSchema.safeParse(encadenadas).success, true);
  });

  test("dos tratos distintos a la vez no se pisan: son impuestos distintos", () => {
    assert.equal(ImpuestosSchema.safeParse(tabla).success, true);
  });

  test("cada trato necesita una vigencia abierta, o mañana no hay con qué calcular", () => {
    const cerrada = {
      ...tabla,
      iva: [
        { code: "GENERAL", basisPoints: 1600, desde: "2026-01-01T00:00:00.000Z", hasta: "2026-07-01T00:00:00.000Z" },
        abierta("REDUCIDA", 800),
        abierta("EXENTA", 0),
      ],
    };
    assert.equal(ImpuestosSchema.safeParse(cerrada).success, false);
  });

  test("sin ninguna alícuota no hay tabla", () => {
    assert.equal(ImpuestosSchema.safeParse({ ...tabla, iva: [] }).success, false);
  });
});

describe("cambiar una alícuota es programar la siguiente", () => {
  test("se programa con su fecha y quién lo hizo", () => {
    const r = ImpuestoCommandSchema.safeParse({
      kind: "PROGRAMAR_IVA",
      code: "GENERAL",
      basisPoints: 1400,
      desde: "2026-10-01T00:00:00.000Z",
      por: "Abigail Karam",
    });
    assert.equal(r.success, true);
  });

  test("el IGTF se programa igual", () => {
    const r = ImpuestoCommandSchema.safeParse({
      kind: "PROGRAMAR_IGTF",
      basisPoints: 300,
      desde: "2026-10-01T00:00:00.000Z",
      por: "Abigail Karam",
    });
    assert.equal(r.success, true);
  });

  test("sin decir quién, no: esto mueve lo que cobra el negocio", () => {
    const r = ImpuestoCommandSchema.safeParse({
      kind: "PROGRAMAR_IVA",
      code: "GENERAL",
      basisPoints: 1400,
      desde: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(r.success, false);
  });

  test("no existe editar ni borrar una vigencia: el pasado no se reescribe", () => {
    for (const kind of ["EDITAR_IVA", "BORRAR_VIGENCIA", "CORREGIR_IGTF"]) {
      assert.equal(ImpuestoCommandSchema.safeParse({ kind, basisPoints: 1400 }).success, false);
    }
  });
});
