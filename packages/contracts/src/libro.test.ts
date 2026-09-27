/**
 * Pruebas del libro de pagos en el cable — B2-3, §5.5.
 *
 * Lo que no se puede expresar: un importe cero o negativo, la moneda que no es la del medio,
 * bolívares sin tasa, quién cobra o el IGTF declarados por el navegador, y un «Otro» sin explicar.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AsentarPagosCommandSchema, AsientoNuevoSchema, RevertirPagoCommandSchema } from "./libro.ts";

const TASA = "01a0e11b-879b-75dd-bb18-70f1c287e118";
const CLAVE = "01a0e11b-9750-72c9-b9c7-e7b48b7c4284";
const DOC = "01a0e11b-0000-7000-8000-000000000001";
const usd = (minor: string) => ({ kind: "COBRO", method: "EFECTIVO_USD", amount: { minor, currency: "USD" } });
const bs = (minor: string, rateId?: string) => ({ kind: "COBRO", method: "PAGO_MOVIL", amount: { minor, currency: "VES" }, ...(rateId ? { rateId } : {}) });

describe("un asiento", () => {
  test("en dólares, sin tasa; en bolívares, con la suya", () => {
    assert.equal(AsientoNuevoSchema.safeParse(usd("580")).success, true);
    assert.equal(AsientoNuevoSchema.safeParse(bs("427831", TASA)).success, true);
  });

  test("importe positivo", () => {
    for (const minor of ["0", "-580"]) assert.equal(AsientoNuevoSchema.safeParse(usd(minor)).success, false, minor);
  });

  test("en la moneda del medio", () => {
    assert.equal(AsientoNuevoSchema.safeParse({ ...usd("580"), amount: { minor: "580", currency: "VES" }, rateId: TASA }).success, false);
  });

  test("bolívares sin tasa, o dólares con tasa, no", () => {
    assert.equal(AsientoNuevoSchema.safeParse(bs("427831")).success, false);
    assert.equal(AsientoNuevoSchema.safeParse({ ...usd("580"), rateId: TASA }).success, false);
  });

  test("el navegador no dice el valor de la tasa ni el IGTF", () => {
    assert.equal(AsientoNuevoSchema.safeParse({ ...bs("427831", TASA), rateValue: "855.6625" }).success, false);
    assert.equal(AsientoNuevoSchema.safeParse({ ...usd("580"), igtf: { minor: "17", currency: "USD" } }).success, false);
  });
});

describe("asentar un cobro", () => {
  test("con su clave, su documento y al menos un asiento", () => {
    assert.equal(AsentarPagosCommandSchema.safeParse({ idempotencyKey: CLAVE, documentId: DOC, asientos: [usd("580")] }).success, true);
    assert.equal(AsentarPagosCommandSchema.safeParse({ idempotencyKey: CLAVE, documentId: DOC, asientos: [] }).success, false);
    assert.equal(AsentarPagosCommandSchema.safeParse({ documentId: DOC, asientos: [usd("580")] }).success, false);
  });

  test("quien cobra no lo declara el navegador (ADR-017)", () => {
    assert.equal(
      AsentarPagosCommandSchema.safeParse({ idempotencyKey: CLAVE, documentId: DOC, asientos: [usd("580")], cajero: "Marisol" }).success,
      false,
    );
  });
});

describe("revertir", () => {
  test("con motivo de la lista; «Otro» exige explicarlo", () => {
    const base = { idempotencyKey: CLAVE, paymentId: DOC };
    assert.equal(RevertirPagoCommandSchema.safeParse({ ...base, motivo: "ERROR_EN_COBRO" }).success, true);
    assert.equal(RevertirPagoCommandSchema.safeParse({ ...base, motivo: "OTRO" }).success, false);
    assert.equal(RevertirPagoCommandSchema.safeParse({ ...base, motivo: "OTRO", detalle: "Se cobró en la cuenta equivocada" }).success, true);
    assert.equal(RevertirPagoCommandSchema.safeParse({ ...base, motivo: "PORQUE_SI" }).success, false);
  });
});
