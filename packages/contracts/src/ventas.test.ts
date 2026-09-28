/**
 * Pruebas de la venta cerrada — C12, DEC-24, B3-4 (la guarda el servidor).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DevolucionSchema, VentaCerradaSchema } from "./ventas.ts";

const usd = (minor: string) => ({ minor, currency: "USD" });

const venta = {
  id: "0192a3b4-0000-7e8f-9a0b-1c2d3e4f5a6b",
  orderNumber: 1041,
  accountId: "0192a3b4-1111-7e8f-9a0b-1c2d3e4f5a6b",
  cobroKey: "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
  closedAt: "2026-09-11T18:21:00.000Z",
  businessDate: "2026-09-11",
  cashier: "Marisol Prieto",
  cuenta: { kind: "FAMILIA", family: "Ana Rojas", tableLabel: null },
  parte: null,
  cliente: { kind: "CONSUMIDOR_FINAL" },
  lineas: [{ lineId: "paq-s1", concept: "Paquete 1 hora", amount: usd("500"), cortesia: null }],
  subtotal: usd("500"),
  impuestos: [{ basisPoints: 1600, tax: usd("80") }],
  igtf: { basisPoints: 300, amount: usd("0") },
  total: usd("580"),
  tasa: { id: "0192a3b4-2222-7e8f-9a0b-1c2d3e4f5a6b", value: "228.41" },
  payments: [
    {
      methodCode: "PAGO_MOVIL",
      label: "Pago Móvil",
      cash: false,
      dataKind: "PAGO_MOVIL",
      paid: { minor: "132478", currency: "VES" },
      refundable: { minor: "132478", currency: "VES" },
      referencia: "Banco 0134 · Ref. ···4821",
    },
  ],
  sobra: null,
  prints: [],
  voided: null,
};

const valida = (v: unknown) => VentaCerradaSchema.safeParse(v).success;

describe("venta cerrada (C12, B3-4)", () => {
  test("una venta con sus líneas, impuestos y pagos, sin impresiones, es válida", () => {
    assert.equal(valida(venta), true);
  });

  test("las impresiones dicen cuándo, quién y si fue copia", () => {
    assert.equal(valida({ ...venta, prints: [{ at: "2026-09-11T18:22:00.000Z", by: "Marisol Prieto", copia: false }] }), true);
    assert.equal(valida({ ...venta, prints: [{ at: "ayer", by: "Marisol", copia: false }] }), false);
  });

  test("sin líneas no hay venta; el total viaja con su moneda", () => {
    assert.equal(valida({ ...venta, lineas: [] }), false);
    assert.equal(valida({ ...venta, total: { minor: "580" } }), false);
  });

  test("el documento del cliente va como texto corto (enmascarado)", () => {
    assert.equal(valida({ ...venta, cliente: { kind: "IDENTIFICADO", name: "Inversiones Rojas", document: "J-40···7-1" } }), true);
    assert.equal(valida({ ...venta, cliente: { kind: "IDENTIFICADO", name: "X", document: "J-401234567-1-con-mucho-texto" } }), false);
  });
});

describe("anular una venta (DEC-24)", () => {
  const anulacion = {
    at: "2026-09-11T19:00:00.000Z",
    requestedBy: "Marisol Prieto",
    authorizedBy: { name: "Luis Guerrero", role: "SUPERVISOR" },
    reason: "ERROR_EN_COBRO",
    note: null,
    refunds: [{ paymentIndex: 0, via: "MISMO_MEDIO", amount: { minor: "132478", currency: "VES" }, reference: "···4821" }],
  };
  const anulada = (a: object) => valida({ ...venta, voided: { ...anulacion, ...a } });

  test("una anulación autorizada, con su devolución, es válida", () => {
    assert.equal(anulada({}), true);
  });

  test("autoriza un supervisor o el administrador, nunca una cajera", () => {
    assert.equal(anulada({ authorizedBy: { name: "Carla", role: "CAJERO" } }), false);
    assert.equal(anulada({ authorizedBy: { name: "Abigail Karam", role: "ADMIN" } }), true);
  });

  test("se devuelve exactamente lo que quedó, en su moneda, y una vez", () => {
    assert.equal(anulada({ refunds: [{ ...anulacion.refunds[0], amount: { minor: "200000", currency: "VES" } }] }), false);
    assert.equal(anulada({ refunds: [{ ...anulacion.refunds[0], amount: usd("580") }] }), false);
    assert.equal(anulada({ refunds: [anulacion.refunds[0], anulacion.refunds[0]] }), false);
    assert.equal(anulada({ refunds: [{ ...anulacion.refunds[0], paymentIndex: 3 }] }), false);
  });

  test("la referencia de una devolución tiene al menos cuatro caracteres", () => {
    assert.equal(DevolucionSchema.safeParse({ paymentIndex: 0, via: "MISMO_MEDIO", reference: "12" }).success, false);
    assert.equal(DevolucionSchema.safeParse({ paymentIndex: 0, via: "EFECTIVO" }).success, true);
  });
});
