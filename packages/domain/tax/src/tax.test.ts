/**
 * Pruebas del motor de impuestos — §5.3 y §10.1.
 *
 * Cubren los ocho casos límite que el plan marca como imprescindibles. Cuando
 * lleguen las 20 facturas reales del contador (F0-05), se añaden aquí como
 * casos de referencia y **pasan a ser condición de despliegue** (F3-08).
 *
 * Las alícuotas de estas pruebas son valores de trabajo, NO una afirmación
 * sobre la normativa vigente. Eso lo confirma el contador (DEC-1).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { add, compare, fromMajor, money, subtract, sum, toMajor, zero } from "@l2/domain-money";
import {
  NoApplicableRuleError,
  pagoQueCubreConIgtf,
  computeDocument,
  computeIgtf,
  findRule,
  type DocumentLine,
  type PaymentMethodSpec,
  type TaxRule,
} from "./index.ts";

const AHORA = Date.parse("2026-09-09T14:00:00.000Z");
const ANTES = Date.parse("2026-01-15T14:00:00.000Z");

const REGLAS: TaxRule[] = [
  { code: "GENERAL", basisPoints: 1600, effectiveFrom: 0, effectiveTo: null },
  { code: "REDUCIDA", basisPoints: 800, effectiveFrom: 0, effectiveTo: null },
  { code: "EXENTA", basisPoints: 0, effectiveFrom: 0, effectiveTo: null },
];

const linea = (
  id: string,
  precio: string,
  cantidad: bigint,
  taxCode: DocumentLine["taxCode"] = "GENERAL",
): DocumentLine => ({
  id,
  description: id,
  unitPrice: fromMajor(precio, "USD"),
  quantity: cantidad,
  taxCode,
});

const doc = (over: Partial<Parameters<typeof computeDocument>[0]> = {}) =>
  computeDocument({
    lines: [linea("l1", "100.00", 1n)],
    rules: REGLAS,
    at: AHORA,
    currency: "USD",
    ...over,
  });

/* ------------------------------------------------------------ alícuotas */

describe("alícuotas con vigencia (F3-06)", () => {
  test("una factura vieja se recalcula con la regla que tenía", () => {
    const conCambio: TaxRule[] = [
      { code: "GENERAL", basisPoints: 1200, effectiveFrom: 0, effectiveTo: AHORA },
      { code: "GENERAL", basisPoints: 1600, effectiveFrom: AHORA, effectiveTo: null },
    ];
    assert.equal(findRule(conCambio, "GENERAL", ANTES).basisPoints, 1200);
    assert.equal(findRule(conCambio, "GENERAL", AHORA).basisPoints, 1600);
  });

  test("sin regla vigente NO se factura: fail-closed", () => {
    const futura: TaxRule[] = [
      { code: "GENERAL", basisPoints: 1600, effectiveFrom: AHORA + 1, effectiveTo: null },
    ];
    assert.throws(() => findRule(futura, "GENERAL", AHORA), NoApplicableRuleError);
  });

  test("suponer 0 % por falta de regla sería el peor error posible", () => {
    assert.throws(
      () => computeDocument({ lines: [linea("l1", "100.00", 1n)], rules: [], at: AHORA, currency: "USD" }),
      NoApplicableRuleError,
    );
  });
});

/* -------------------------------------------------------------- IVA */

describe("IVA", () => {
  test("caso simple: 100,00 al 16 % da 116,00", () => {
    const r = doc();
    assert.equal(toMajor(r.subtotal), "100.00");
    assert.equal(toMajor(r.taxTotal), "16.00");
    assert.equal(toMajor(r.total), "116.00");
  });

  test("T-TAX-05 · mezcla de exentos y gravados", () => {
    const r = doc({
      lines: [linea("gravado", "100.00", 1n), linea("exento", "50.00", 1n, "EXENTA")],
    });
    assert.equal(toMajor(r.subtotal), "150.00");
    // Solo tributa la parte gravada.
    assert.equal(toMajor(r.taxTotal), "16.00");
    assert.equal(toMajor(r.total), "166.00");

    const exento = r.buckets.find((b) => b.code === "EXENTA");
    assert.equal(toMajor(exento!.base), "50.00");
    assert.equal(toMajor(exento!.tax), "0.00");
  });

  test("agrupa por alícuota antes de calcular, no línea a línea", () => {
    // Tres líneas de 0,03 al 16 % → 0,0048 cada una.
    // Línea a línea con redondeo daría 0,00 × 3 = 0,00.
    // Agrupado: 0,09 × 16 % = 0,0144 → 0,01. Esa es la cifra correcta.
    const r = doc({
      lines: [linea("a", "0.03", 1n), linea("b", "0.03", 1n), linea("c", "0.03", 1n)],
    });
    assert.equal(toMajor(r.taxTotal), "0.01");
  });

  test("T-TAX-08 · el total cuadra al céntimo con la suma de sus partes", () => {
    const r = doc({
      lines: [linea("a", "17.53", 3n), linea("b", "4.99", 7n), linea("c", "0.01", 1n)],
    });
    const recompuesto = sum(
      [...r.buckets.map((b) => b.base), ...r.buckets.map((b) => b.tax), r.serviceCharge],
      "USD",
    );
    assert.equal(recompuesto.amount, r.total.amount);
  });
});

/* --------------------------------------------------------- descuentos */

describe("descuentos (T-TAX-06)", () => {
  test("el descuento reduce la base ANTES del IVA", () => {
    const r = doc({ discounts: [{ kind: "AMOUNT", value: fromMajor("20.00", "USD") }] });
    assert.equal(toMajor(r.discountTotal), "20.00");
    // 80,00 × 16 % = 12,80
    assert.equal(toMajor(r.taxTotal), "12.80");
    assert.equal(toMajor(r.total), "92.80");
  });

  test("se PRORRATEA entre líneas: restarlo del total regalaría IVA debido", () => {
    // 100 gravado + 100 exento, 20 de descuento → 10 a cada una.
    const r = doc({
      lines: [linea("gravado", "100.00", 1n), linea("exento", "100.00", 1n, "EXENTA")],
      discounts: [{ kind: "AMOUNT", value: fromMajor("20.00", "USD") }],
    });
    const gravado = r.buckets.find((b) => b.code === "GENERAL");
    assert.equal(toMajor(gravado!.base), "90.00");
    assert.equal(toMajor(gravado!.tax), "14.40");

    // Si se hubiera restado del total, la base gravada habría sido 80,00 y el
    // IVA 12,80: se habrían regalado 1,60 que sí se deben.
    assert.notEqual(toMajor(gravado!.tax), "12.80");
  });

  test("un descuento porcentual se calcula sobre el subtotal", () => {
    const r = doc({ discounts: [{ kind: "PERCENT", basisPoints: 1000 }] });
    assert.equal(toMajor(r.discountTotal), "10.00");
    assert.equal(toMajor(r.total), "104.40"); // 90 + 14,40
  });

  test("nunca se descuenta más de lo que vale la cuenta", () => {
    const r = doc({ discounts: [{ kind: "AMOUNT", value: fromMajor("500.00", "USD") }] });
    assert.equal(toMajor(r.discountTotal), "100.00");
    assert.equal(toMajor(r.total), "0.00");
  });
});

/* ---------------------------------------------------------- servicio */

describe("servicio y propina (DEC-6)", () => {
  test("fuera de la base imponible: suma al total pero no genera IVA", () => {
    const r = doc({ service: { basisPoints: 1000, taxable: false, taxCode: "GENERAL" } });
    assert.equal(toMajor(r.serviceCharge), "10.00");
    assert.equal(toMajor(r.taxTotal), "16.00"); // solo sobre los 100
    assert.equal(toMajor(r.total), "126.00");
  });

  test("dentro de la base imponible: también tributa", () => {
    const r = doc({ service: { basisPoints: 1000, taxable: true, taxCode: "GENERAL" } });
    assert.equal(toMajor(r.serviceCharge), "10.00");
    assert.equal(toMajor(r.taxTotal), "17.60"); // 110 × 16 %
    assert.equal(toMajor(r.total), "127.60");
  });

  test("se calcula sobre el neto, después del descuento", () => {
    const r = doc({
      discounts: [{ kind: "AMOUNT", value: fromMajor("20.00", "USD") }],
      service: { basisPoints: 1000, taxable: false, taxCode: "GENERAL" },
    });
    assert.equal(toMajor(r.serviceCharge), "8.00"); // 10 % de 80, no de 100
  });
});

/* -------------------------------------------------------------- IGTF */

const USD_EFECTIVO: PaymentMethodSpec = {
  code: "EFECTIVO_USD",
  label: "Efectivo $",
  currency: "USD",
  triggersIgtf: true,
};
const BS_PAGO_MOVIL: PaymentMethodSpec = {
  code: "PAGO_MOVIL",
  label: "Pago Móvil",
  currency: "VES",
  triggersIgtf: false,
};
const USDT: PaymentMethodSpec = {
  code: "USDT",
  label: "USDT",
  currency: "USDT",
  triggersIgtf: true,
};

describe("IGTF (§5.3)", () => {
  test("T-TAX-01 · pago 100 % en bolívares no tributa", () => {
    const r = computeIgtf(
      [{ method: BS_PAGO_MOVIL, amount: fromMajor("11600.00", "VES") }],
      300,
      "VES",
    );
    assert.equal(r.lines.length, 0);
    assert.equal(r.total.amount, zero("VES").amount);
  });

  test("T-TAX-02 · pago 100 % en divisas tributa sobre el monto con IVA", () => {
    const r = computeIgtf([{ method: USD_EFECTIVO, amount: fromMajor("116.00", "USD") }], 300, "USD");
    assert.equal(toMajor(r.total), "3.48"); // 3 % de 116,00
  });

  test("T-TAX-03 · en pago mixto, SOLO la porción en divisas", () => {
    const r = computeIgtf(
      [
        { method: USD_EFECTIVO, amount: fromMajor("50.00", "USD") },
        { method: BS_PAGO_MOVIL, amount: fromMajor("15048.00", "VES") },
      ],
      300,
      "USD",
    );
    assert.equal(r.lines.length, 1);
    assert.equal(r.lines[0]!.methodCode, "EFECTIVO_USD");
    assert.equal(toMajor(r.total), "1.50"); // 3 % de 50, no del total
  });

  test("T-TAX-04 · el criptoactivo tributa igual que la divisa", () => {
    const r = computeIgtf([{ method: USDT, amount: fromMajor("116.00", "USDT") }], 300, "USDT");
    assert.equal(toMajor(r.total), "3.48");
  });

  test("un pago de cero no genera línea", () => {
    const r = computeIgtf([{ method: USD_EFECTIVO, amount: zero("USD") }], 300, "USD");
    assert.equal(r.lines.length, 0);
  });

  test("que un medio tribute es un DATO, no se deduce de la moneda", () => {
    // El mismo USD, marcado como no sujeto: el motor obedece al dato.
    const exento: PaymentMethodSpec = { ...USD_EFECTIVO, triggersIgtf: false };
    const r = computeIgtf([{ method: exento, amount: fromMajor("116.00", "USD") }], 300, "USD");
    assert.equal(r.total.amount, 0n);
  });

  test("el IGTF NO forma parte del total del documento", () => {
    // Depende del medio de pago, que se desconoce al armar la cuenta.
    const d = doc();
    assert.equal(toMajor(d.total), "116.00");
  });
});

/* ------------------------------------------------------- devoluciones */

describe("T-TAX-07 · devoluciones y notas de crédito", () => {
  test("una cantidad negativa reversa base e IVA proporcionalmente", () => {
    const r = doc({ lines: [linea("devuelto", "100.00", -1n)] });
    assert.equal(toMajor(r.subtotal), "-100.00");
    assert.equal(toMajor(r.taxTotal), "-16.00");
    assert.equal(toMajor(r.total), "-116.00");
  });

  test("una devolución parcial reversa solo su parte", () => {
    const r = doc({ lines: [linea("vendido", "100.00", 3n), linea("devuelto", "100.00", -1n)] });
    assert.equal(toMajor(r.subtotal), "200.00");
    assert.equal(toMajor(r.taxTotal), "32.00");
  });

  test("REGRESIÓN: una nota de crédito sin descuento no se descuenta sola", () => {
    // El recorte del descuento comparaba contra un subtotal negativo y
    // convertía un descuento de cero en la cuenta entera.
    const r = doc({ lines: [linea("devuelto", "100.00", -1n)], discounts: [] });
    assert.equal(toMajor(r.discountTotal), "0.00");
    assert.equal(toMajor(r.total), "-116.00");
  });

  test("un descuento sí se prorratea en una cuenta con signos mezclados", () => {
    const r = doc({
      lines: [linea("vendido", "100.00", 2n), linea("devuelto", "100.00", -1n)],
      discounts: [{ kind: "AMOUNT", value: fromMajor("30.00", "USD") }],
    });
    assert.equal(toMajor(r.discountTotal), "30.00");
    // El reparto por magnitud cuadra exactamente con lo concedido.
    assert.equal(toMajor(r.subtotal), "100.00");
  });

  test("el IGTF de una devolución también se reversa", () => {
    const r = computeIgtf(
      [{ method: USD_EFECTIVO, amount: fromMajor("-116.00", "USD") }],
      300,
      "USD",
    );
    assert.equal(toMajor(r.total), "-3.48");
  });
});

describe("pago que cubre la deuda con su propio IGTF (cobrar exacto)", () => {
  const igtfDe = (p: ReturnType<typeof fromMajor>) =>
    computeIgtf(
      [{ method: { code: "EFECTIVO_USD", label: "Efectivo $", currency: "USD", triggersIgtf: true }, amount: p }],
      300,
      "USD",
    ).total;

  test("una deuda de 100,00 se salda con 103,09, no con 103,00", () => {
    const p = pagoQueCubreConIgtf(fromMajor("100.00", "USD"), 300);
    assert.equal(toMajor(p), "103.09");
    assert.equal(toMajor(igtfDe(fromMajor("103.00", "USD"))), "3.09");
  });

  test("el monto es el MENOR que cubre: un céntimo menos ya no alcanza", () => {
    for (const deuda of ["0.01", "1.16", "9.50", "11.02", "57.40", "250.00", "1234.56"]) {
      const d = fromMajor(deuda, "USD");
      const p = pagoQueCubreConIgtf(d, 300);
      assert.ok(compare(p, add(d, igtfDe(p))) >= 0, `${deuda}: ${toMajor(p)} no cubre`);
      const menos = subtract(p, money(1n, "USD"));
      assert.ok(compare(menos, add(d, igtfDe(menos))) < 0, `${deuda}: ${toMajor(menos)} ya cubría`);
    }
  });

  test("sin IGTF el pago es la deuda, y sin deuda no hay nada que pagar", () => {
    assert.equal(toMajor(pagoQueCubreConIgtf(fromMajor("11.02", "USD"), 0)), "11.02");
    assert.equal(toMajor(pagoQueCubreConIgtf(zero("USD"), 300)), "0.00");
  });

  test("una alícuota imposible se rechaza, no se aproxima", () => {
    assert.throws(() => pagoQueCubreConIgtf(fromMajor("10.00", "USD"), 10_000), RangeError);
    assert.throws(() => pagoQueCubreConIgtf(fromMajor("10.00", "USD"), -1), RangeError);
  });
});
