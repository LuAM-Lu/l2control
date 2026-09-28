/**
 * Pruebas de los mandos de la cuenta — B3-3.
 *
 * Se prueba lo que impide: una cuenta nueva sin UUID (un reintento abriría dos), un cobro en
 * bolívares sin tasa congelada, un pago cero y una anulación «Otro» sin explicar.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AnularCobroCommandSchema, CobrarCuentaCommandSchema, CortesiaCommandSchema, GuardarCuentaCommandSchema } from "./cuentas.ts";

const UUID = "0192f0a0-0000-7000-8000-000000000001";
const UUID2 = "0192f0a0-0000-7000-8000-000000000002";
const venta = {
  id: UUID,
  kind: "MOSTRADOR",
  family: "Mostrador",
  mode: "PREPAGO",
  status: "POR_COBRAR",
  openedAt: "2026-09-27T14:00:00.000Z",
  sessionIds: [],
  closedSessionIds: [],
  lines: [{ id: `${UUID}-snk-1`, concept: "Agua mineral", kind: "RESTAURANTE", amount: { minor: "120", currency: "USD" }, paid: false, productId: "p", taxCode: "GENERAL" }],
};
const cobro = {
  idempotencyKey: UUID2,
  accountId: UUID,
  version: 1,
  lineIds: [`${UUID}-snk-1`],
  total: { minor: "139", currency: "USD" },
  pagos: [{ method: "EFECTIVO_USD", amount: { minor: "500", currency: "USD" } }],
  destinoSobra: "VUELTO",
};

describe("guardar una cuenta", () => {
  test("una cuenta nueva lleva un UUID: un reintento no abre dos", () => {
    assert.equal(GuardarCuentaCommandSchema.safeParse({ cuenta: venta }).success, true);
    assert.equal(GuardarCuentaCommandSchema.safeParse({ cuenta: { ...venta, id: "c-dir-123" } }).success, false);
  });
});

describe("cobrar", () => {
  test("un cobro en dólares, con su total y sus líneas", () => {
    assert.equal(CobrarCuentaCommandSchema.safeParse(cobro).success, true);
  });

  test("en bolívares cita su tasa congelada", () => {
    const enBs = { ...cobro, pagos: [{ method: "EFECTIVO_VES", amount: { minor: "120000", currency: "VES" } }] };
    assert.equal(CobrarCuentaCommandSchema.safeParse(enBs).success, false);
    assert.equal(CobrarCuentaCommandSchema.safeParse({ ...enBs, rateId: UUID }).success, true);
  });

  test("un pago es mayor que cero; el IGTF y la tasa no los manda la pantalla", () => {
    assert.equal(CobrarCuentaCommandSchema.safeParse({ ...cobro, pagos: [{ method: "EFECTIVO_USD", amount: { minor: "0", currency: "USD" } }] }).success, false);
    assert.equal(CobrarCuentaCommandSchema.safeParse({ ...cobro, igtf: { minor: "15", currency: "USD" } }).success, false);
  });
});

describe("anular", () => {
  test("«Otro» exige explicarlo", () => {
    const anular = { idempotencyKey: UUID2, accountId: UUID, cobroKey: UUID, motivo: "OTRO", devoluciones: [] };
    assert.equal(AnularCobroCommandSchema.safeParse(anular).success, false);
    assert.equal(AnularCobroCommandSchema.safeParse({ ...anular, detalle: "Se cobró dos veces" }).success, true);
    const dos = [{ paymentIndex: 0, via: "EFECTIVO" }, { paymentIndex: 0, via: "EFECTIVO" }];
    assert.equal(AnularCobroCommandSchema.safeParse({ ...anular, detalle: "Se cobró dos veces", devoluciones: dos }).success, false);
  });

  test("una cortesía lleva su motivo; quitarla, no", () => {
    const c = { idempotencyKey: UUID2, accountId: UUID, version: 2, lineId: "l1", quitar: false };
    assert.equal(CortesiaCommandSchema.safeParse(c).success, false);
    assert.equal(CortesiaCommandSchema.safeParse({ ...c, motivo: "INVITACION" }).success, true);
    assert.equal(CortesiaCommandSchema.safeParse({ ...c, motivo: "OTRO" }).success, false);
    assert.equal(CortesiaCommandSchema.safeParse({ ...c, quitar: true }).success, true);
  });
});
