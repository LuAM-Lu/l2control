import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { money, type FrozenRate } from "@l2/domain-money";
import { cuadraLaDevolucion, devolucionDe, repartirDevolucion } from "./devolucion.ts";

/**
 * Lo que vuelve cuando un cliente devuelve parte de lo que compró (B3-14, M-34): el descuento en proporción, el IVA
 * recalculado por alícuota y el IGTF en proporción; y cómo vuelve por los pagos, cada uno en su moneda.
 */

const usd = (n: number) => money(BigInt(n), "USD");
const ves = (n: number) => money(BigInt(n), "VES");
/** 1 USD = 100,00 Bs. */
const A_BS: FrozenRate = { from: "USD", to: "VES", numerator: 1n, denominator: 100n };

const venta = {
  lineas: [
    { lineId: "a", amount: usd(200), taxBp: 1600 },
    { lineId: "b", amount: usd(200), taxBp: 1600 },
    { lineId: "c", amount: usd(100), taxBp: 0 },
  ],
  subtotal: usd(500),
  descuento: usd(0),
  ivaIncluido: false,
  igtf: usd(0),
  total: usd(564),
};

describe("lo que vuelve por las líneas devueltas (B3-14)", () => {
  test("sin descuento: la línea con su IVA; la exenta, sin IVA", () => {
    assert.deepEqual(devolucionDe(venta, ["a"]).total, usd(232));
    assert.deepEqual(devolucionDe(venta, ["c"]).total, usd(100));
    assert.deepEqual(devolucionDe(venta, ["a", "b", "c"]).total, usd(564));
  });

  test("con descuento: se reparte en proporción y el IVA se calcula sobre lo que queda", () => {
    const conDescuento = { ...venta, descuento: usd(50), total: usd(507) };
    const d = devolucionDe(conDescuento, ["a"]);
    assert.deepEqual([d.base, d.descuento, d.iva, d.total], [usd(200), usd(20), usd(29), usd(209)]);
  });

  test("con el IVA en el precio, no se suma otra vez; el IGTF va en proporción", () => {
    assert.deepEqual(devolucionDe({ ...venta, ivaIncluido: true, total: usd(500) }, ["a"]).total, usd(200));
    const conIgtf = { ...venta, igtf: usd(17), total: usd(581) };
    assert.deepEqual(devolucionDe(conIgtf, ["a"]).igtf, usd(7));
  });

  test("lo que no es de la venta no cuenta", () => {
    assert.deepEqual(devolucionDe(venta, ["zzz"]).total, usd(0));
  });

  test("de una línea, solo una parte: lo que un niño no usó de su paquete, con su IVA (B3-18)", () => {
    // De la «a» ($ 2,00 + 16 %) vuelve $ 0,50: $ 0,58 con su IVA.
    assert.deepEqual(devolucionDe(venta, ["a"], new Map([["a", usd(50)]])).total, usd(58));
    // Nunca más que la línea, ni menos que cero.
    assert.deepEqual(devolucionDe(venta, ["a"], new Map([["a", usd(900)]])).total, usd(232));
    assert.deepEqual(devolucionDe(venta, ["a"], new Map([["a", usd(-5)]])).total, usd(0));
  });
});

describe("cómo vuelve por los pagos", () => {
  test("de cada pago lo que falte, en su moneda, sin pasar de lo que le queda", () => {
    const r = repartirDevolucion(usd(300), [
      { restante: ves(10_000), desdeFuncional: A_BS },
      { restante: usd(500), desdeFuncional: null },
    ]);
    assert.deepEqual(r.montos, [ves(10_000), usd(200)]);
    assert.deepEqual(r.falta, usd(0));
  });

  test("si no alcanza, dice cuánto falta", () => {
    const r = repartirDevolucion(usd(300), [{ restante: usd(100), desdeFuncional: null }]);
    assert.deepEqual(r.falta, usd(200));
  });

  test("cuadra con un céntimo de redondeo por pago en otra moneda", () => {
    assert.equal(cuadraLaDevolucion(usd(300), [{ monto: ves(29_999), desdeFuncional: A_BS }]).cuadra, true);
    assert.equal(cuadraLaDevolucion(usd(300), [{ monto: usd(299), desdeFuncional: null }]).cuadra, false);
  });
});
