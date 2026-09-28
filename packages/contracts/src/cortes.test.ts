/**
 * Pruebas del contrato del cierre — F4-05 a F4-08, B3-5.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ArqueoCommandSchema, CorteZCommandSchema, IncobrableCommandSchema } from "./cortes.ts";

const UUID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const usd = (minor: string) => ({ minor, currency: "USD" });
const bs = (minor: string) => ({ minor, currency: "VES" });

describe("el arqueo", () => {
  const conteo = {
    turnoId: UUID,
    conteos: [
      { currency: "USD", billetes: [{ denominacion: usd("2000"), cantidad: 2 }] },
      { currency: "VES", billetes: [] },
    ],
  };

  test("se cuentan las dos monedas, una vez cada una, por billetes", () => {
    assert.equal(ArqueoCommandSchema.safeParse(conteo).success, true);
    assert.equal(ArqueoCommandSchema.safeParse({ ...conteo, conteos: [conteo.conteos[0]] }).success, false);
    assert.equal(ArqueoCommandSchema.safeParse({ ...conteo, conteos: [conteo.conteos[0], conteo.conteos[0]] }).success, false);
  });

  test("un billete va en su moneda, vale más que cero y se cuenta en enteros", () => {
    const con = (b: object) => ({ ...conteo, conteos: [{ currency: "USD", billetes: [b] }, conteo.conteos[1]] });
    assert.equal(ArqueoCommandSchema.safeParse(con({ denominacion: bs("2000"), cantidad: 1 })).success, false);
    assert.equal(ArqueoCommandSchema.safeParse(con({ denominacion: usd("0"), cantidad: 1 })).success, false);
    assert.equal(ArqueoCommandSchema.safeParse(con({ denominacion: usd("100"), cantidad: 1.5 })).success, false);
    assert.equal(ArqueoCommandSchema.safeParse(con({ denominacion: usd("100"), cantidad: -1 })).success, false);
  });
});

describe("el corte Z y la cuenta incobrable", () => {
  test("lo que se deja en la gaveta no es negativo", () => {
    const z = { idempotencyKey: UUID, turnoId: UUID, arqueoId: UUID, cierre: "RELEVO", quedaEnGaveta: [usd("2000")] };
    assert.equal(CorteZCommandSchema.safeParse(z).success, true);
    assert.equal(CorteZCommandSchema.safeParse({ ...z, quedaEnGaveta: [usd("-1")] }).success, false);
    assert.equal(CorteZCommandSchema.safeParse({ ...z, cierre: "CUALQUIERA" }).success, false);
  });

  test("«Otro» exige explicar por qué no se cobra", () => {
    const c = { idempotencyKey: UUID, accountId: UUID, version: 3, motivo: "OTRO" };
    assert.equal(IncobrableCommandSchema.safeParse(c).success, false);
    assert.equal(IncobrableCommandSchema.safeParse({ ...c, detalle: "Se accidentó y salió de urgencia" }).success, true);
    assert.equal(IncobrableCommandSchema.safeParse({ ...c, motivo: "SE_FUE_SIN_PAGAR" }).success, true);
  });
});
