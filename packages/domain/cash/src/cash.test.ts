/**
 * Pruebas del cobro mixto y el vuelto — §5.5 y §5.6.
 *
 * El caso que más importa es el que el cliente describió con sus palabras:
 * «lo que se paga; la diferencia se da de vuelto si el cliente lo requiere, o
 * queda en caja». Aquí está convertido en reglas que se pueden comprobar.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { type FrozenRate, fromMajor, toMajor, zero } from "@l2/domain-money";
import {
  MissingRateError,
  RetainedAboveThresholdError,
  SettlementImbalanceError,
  closeSettlement,
  computeBalance,
  reconcile,
  type Tender,
  type TenderMethod,
} from "./index.ts";

/* Tasa del día: 228,41 Bs por 1 USD, congelada en la transacción. */
const TASA: FrozenRate = {
  from: "VES",
  to: "USD",
  numerator: 22841n, // Bs, en unidades menores
  denominator: 100n, // por cada 1,00 USD
};

const USD_EFECTIVO: TenderMethod = {
  code: "EFECTIVO_USD",
  label: "Efectivo $",
  currency: "USD",
  canGiveChange: true,
};
const BS_EFECTIVO: TenderMethod = {
  code: "EFECTIVO_VES",
  label: "Efectivo Bs",
  currency: "VES",
  canGiveChange: true,
};
const PAGO_MOVIL: TenderMethod = {
  code: "PAGO_MOVIL",
  label: "Pago Móvil",
  currency: "VES",
  canGiveChange: false,
};

const usd = (v: string) => fromMajor(v, "USD");
const bs = (v: string) => fromMajor(v, "VES");
const SIN_RESIDUO = zero("USD");

const pago = (method: TenderMethod, amount: ReturnType<typeof usd>): Tender => ({
  method,
  amount,
  rate: amount.currency === "USD" ? null : TASA,
});

/* ---------------------------------------------------------- balance */

describe("cobro mixto (F4-03)", () => {
  test("suma pagos de monedas distintas con la tasa congelada", () => {
    // 50,00 USD + 11.420,50 Bs (= 50,00 USD a 228,41)
    const b = computeBalance(usd("100.00"), [
      pago(USD_EFECTIVO, usd("50.00")),
      pago(PAGO_MOVIL, bs("11420.50")),
    ], "USD");
    assert.equal(toMajor(b.tendered), "100.00");
    assert.equal(toMajor(b.outstanding), "0.00");
    assert.equal(toMajor(b.surplus), "0.00");
  });

  test("dice cuánto falta cuando el pago es parcial", () => {
    const b = computeBalance(usd("100.00"), [pago(USD_EFECTIVO, usd("30.00"))], "USD");
    assert.equal(toMajor(b.outstanding), "70.00");
    assert.equal(toMajor(b.surplus), "0.00");
  });

  test("dice cuánto sobra cuando se paga de más", () => {
    const b = computeBalance(usd("17.00"), [pago(USD_EFECTIVO, usd("20.00"))], "USD");
    assert.equal(toMajor(b.surplus), "3.00");
  });

  test("un pago en otra moneda SIN tasa no se acepta: fail-closed (ADR-005)", () => {
    const sinTasa: Tender = { method: PAGO_MOVIL, amount: bs("11420.50"), rate: null };
    assert.throws(() => computeBalance(usd("100.00"), [sinTasa], "USD"), MissingRateError);
  });
});

/* ------------------------------------------------------------ vuelto */

describe("vuelto y sus tres disposiciones (§5.6)", () => {
  test("vuelto entregado: el excedente sale de la gaveta", () => {
    const r = closeSettlement({
      due: usd("17.00"),
      tenders: [pago(USD_EFECTIVO, usd("20.00"))],
      dispositions: [{ kind: "CHANGE_OUT", amount: usd("3.00"), rate: null }],
      functional: "USD",
      maxRetained: SIN_RESIDUO,
    });
    assert.equal(toMajor(r.changeOut), "3.00");
    assert.equal(toMajor(r.tip), "0.00");
  });

  test("el cliente deja el vuelto de propina: NO es ingreso del negocio", () => {
    const r = closeSettlement({
      due: usd("17.00"),
      tenders: [pago(USD_EFECTIVO, usd("20.00"))],
      dispositions: [{ kind: "TIP_FROM_CHANGE", amount: usd("3.00") }],
      functional: "USD",
      maxRetained: SIN_RESIDUO,
    });
    assert.equal(toMajor(r.tip), "3.00");
    assert.equal(toMajor(r.changeOut), "0.00");
  });

  test("VUELTO CRUZADO: se paga en USD y se devuelve en Bs, a la MISMA tasa", () => {
    // Cuenta de 17,00. Paga con 20,00 USD. Vuelto de 3,00 USD en bolívares:
    // 3,00 × 228,41 = 685,23 Bs
    const r = closeSettlement({
      due: usd("17.00"),
      tenders: [pago(USD_EFECTIVO, usd("20.00"))],
      dispositions: [{ kind: "CHANGE_OUT", amount: bs("685.23"), rate: TASA }],
      functional: "USD",
      maxRetained: SIN_RESIDUO,
    });
    assert.equal(toMajor(r.changeOut), "3.00");
  });

  test("residuo retenido dentro del umbral", () => {
    const r = closeSettlement({
      due: usd("17.00"),
      tenders: [pago(USD_EFECTIVO, usd("17.02"))],
      dispositions: [{ kind: "ROUNDING_RETAINED", amount: usd("0.02") }],
      functional: "USD",
      maxRetained: usd("0.05"),
    });
    assert.equal(toMajor(r.retained), "0.02");
  });

  test("por encima del umbral NO se puede retener: hay que dar vuelto o marcarlo propina", () => {
    assert.throws(
      () =>
        closeSettlement({
          due: usd("17.00"),
          tenders: [pago(USD_EFECTIVO, usd("22.00"))],
          dispositions: [{ kind: "ROUNDING_RETAINED", amount: usd("5.00") }],
          functional: "USD",
          maxRetained: usd("0.05"),
        }),
      RetainedAboveThresholdError,
    );
  });

  test("se pueden combinar: parte de vuelto y parte de propina", () => {
    const r = closeSettlement({
      due: usd("17.00"),
      tenders: [pago(USD_EFECTIVO, usd("20.00"))],
      dispositions: [
        { kind: "CHANGE_OUT", amount: usd("2.00"), rate: null },
        { kind: "TIP_FROM_CHANGE", amount: usd("1.00") },
      ],
      functional: "USD",
      maxRetained: SIN_RESIDUO,
    });
    assert.equal(toMajor(r.changeOut), "2.00");
    assert.equal(toMajor(r.tip), "1.00");
  });
});

/* ------------------------------------------------- invariante de cierre */

describe("la invariante de cierre no admite ajustes silenciosos", () => {
  test("si falta por cobrar, no se cierra", () => {
    assert.throws(
      () =>
        closeSettlement({
          due: usd("100.00"),
          tenders: [pago(USD_EFECTIVO, usd("30.00"))],
          dispositions: [],
          functional: "USD",
          maxRetained: SIN_RESIDUO,
        }),
      SettlementImbalanceError,
    );
  });

  test("si sobra y NADIE dice qué hacer con ello, no se cierra", () => {
    // Es el caso peligroso: 3,00 que se quedarían sin explicación.
    assert.throws(
      () =>
        closeSettlement({
          due: usd("17.00"),
          tenders: [pago(USD_EFECTIVO, usd("20.00"))],
          dispositions: [],
          functional: "USD",
          maxRetained: SIN_RESIDUO,
        }),
      SettlementImbalanceError,
    );
  });

  test("si las disposiciones no suman el excedente, no se cierra", () => {
    assert.throws(
      () =>
        closeSettlement({
          due: usd("17.00"),
          tenders: [pago(USD_EFECTIVO, usd("20.00"))],
          dispositions: [{ kind: "CHANGE_OUT", amount: usd("2.50"), rate: null }],
          functional: "USD",
          maxRetained: SIN_RESIDUO,
        }),
      SettlementImbalanceError,
    );
  });

  test("PROPIEDAD: cuando cuadra, Σ pagos = total + vuelto + propina + residuo", () => {
    const casos = [
      { due: "17.00", pago: "20.00", vuelto: "3.00" },
      { due: "5.00", pago: "5.00", vuelto: "0.00" },
      { due: "0.01", pago: "1.00", vuelto: "0.99" },
      { due: "123.45", pago: "200.00", vuelto: "76.55" },
    ];
    for (const c of casos) {
      const r = closeSettlement({
        due: usd(c.due),
        tenders: [pago(USD_EFECTIVO, usd(c.pago))],
        dispositions:
          c.vuelto === "0.00"
            ? []
            : [{ kind: "CHANGE_OUT", amount: usd(c.vuelto), rate: null }],
        functional: "USD",
        maxRetained: SIN_RESIDUO,
      });
      const aplicado =
        r.balance.due.amount + r.changeOut.amount + r.tip.amount + r.retained.amount;
      assert.equal(r.balance.tendered.amount, aplicado, `no cuadra en ${c.due}/${c.pago}`);
    }
  });

  test("pago mixto con vuelto: el caso real de la taquilla", () => {
    // Cuenta de 60,00. Paga 50,00 en Pago Móvil (Bs) y 20,00 USD en efectivo.
    // Sobran 10,00 y se devuelven en efectivo USD.
    const r = closeSettlement({
      due: usd("60.00"),
      tenders: [pago(PAGO_MOVIL, bs("11420.50")), pago(USD_EFECTIVO, usd("20.00"))],
      dispositions: [{ kind: "CHANGE_OUT", amount: usd("10.00"), rate: null }],
      functional: "USD",
      maxRetained: SIN_RESIDUO,
    });
    assert.equal(toMajor(r.balance.tendered), "70.00");
    assert.equal(toMajor(r.changeOut), "10.00");
  });
});

/* ------------------------------------------------------------- arqueo */

describe("cuadre de caja (F4-07)", () => {
  test("calcula la diferencia por moneda, nunca en un solo número", () => {
    const r = reconcile([
      { currency: "USD", counted: usd("150.00"), expected: usd("152.00") },
      { currency: "VES", counted: bs("5000.00"), expected: bs("4980.00") },
    ]);
    assert.equal(toMajor(r[0]!.difference), "-2.00"); // faltan 2 USD
    assert.equal(toMajor(r[1]!.difference), "20.00"); // sobran 20 Bs
  });

  test("sumar monedas escondería justo lo que hay que ver", () => {
    // Un faltante en dólares y un sobrante en bolívares NO se compensan.
    const r = reconcile([
      { currency: "USD", counted: usd("100.00"), expected: usd("110.00") },
      { currency: "VES", counted: bs("2284.10"), expected: bs("0.00") },
    ]);
    assert.notEqual(r[0]!.difference.amount, 0n);
    assert.notEqual(r[1]!.difference.amount, 0n);
  });

  test("cuando cuadra, la diferencia es cero", () => {
    const r = reconcile([{ currency: "USD", counted: usd("100.00"), expected: usd("100.00") }]);
    assert.equal(r[0]!.difference.amount, 0n);
  });
});
