/**
 * Pruebas de la venta cerrada y su recibo — C12, DEC-24.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { VentaCerradaSchema } from "./ventas.ts";

const recibo = {
  orden: "#1041",
  cuenta: "Ana Rojas",
  cuando: "11/09/2026 · 2:21 pm",
  facturaA: "Consumidor final",
  lineas: [{ cantidad: 1, concepto: "Paquete 1 hora · Vale", importe: "$ 5.00" }],
  subtotal: "$ 5.00",
  impuestos: [{ etiqueta: "IVA 16%", monto: "$ 0.80" }],
  total: "$ 5.80",
  totalBs: "Bs. 1.324,78",
  tasa: "228,41 Bs/$",
  pagos: [{ medio: "Pago Móvil", detalle: "Banesco · Ref. ···4821", monto: "Bs. 1.324,78" }],
  vuelto: null,
  destinoVuelto: null,
  cajera: "Marisol Prieto",
  telefono: null,
};

const venta = {
  id: "v-1",
  orderNumber: 1041,
  accountId: "c-rojas",
  closedAt: "2026-09-11T18:21:00.000Z",
  cashier: { id: "u-marisol", name: "Marisol Prieto" },
  total: { minor: "580", currency: "USD" },
  methods: ["Pago Móvil"],
  recibo,
  prints: [],
};

const valida = (v: unknown) => VentaCerradaSchema.safeParse(v).success;

describe("venta cerrada (C12)", () => {
  test("una venta con su recibo y sin impresiones es válida", () => {
    assert.equal(valida(venta), true);
  });

  test("las impresiones se registran con instante y quién", () => {
    assert.equal(valida({ ...venta, prints: [{ at: "2026-09-11T18:22:00.000Z", by: { id: "u-1", name: "Marisol" } }] }), true);
    assert.equal(valida({ ...venta, prints: [{ at: "ayer", by: null }] }), false);
  });

  test("sin pagos o sin líneas no hay recibo", () => {
    assert.equal(valida({ ...venta, recibo: { ...recibo, pagos: [] } }), false);
    assert.equal(valida({ ...venta, recibo: { ...recibo, lineas: [] } }), false);
  });

  test("el total viaja con su moneda", () => {
    assert.equal(valida({ ...venta, total: { minor: "580" } }), false);
  });
});
