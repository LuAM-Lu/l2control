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
  ShiftClosedError,
  assertShiftAcceptsMoney,
  countDenominations,
  tallyShift,
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

/* --------------------------------------------------------- turno */

describe("turno de caja (F4-05, F4-06)", () => {
  test("un turno abierto acepta dinero", () => {
    assert.doesNotThrow(() => assertShiftAcceptsMoney("ABIERTO", "cobrar"));
    assert.doesNotThrow(() => assertShiftAcceptsMoney("EN_CIERRE", "cobrar"));
  });

  test("después del corte Z, NINGUNA operación monetaria toca el turno", () => {
    assert.throws(() => assertShiftAcceptsMoney("CERRADO_Z", "cobrar"), ShiftClosedError);
    assert.throws(() => assertShiftAcceptsMoney("CERRADO_Z", "anular"), ShiftClosedError);
  });
});

describe("totalización del turno", () => {
  const mv = (
    kind: Parameters<typeof tallyShift>[0][number]["kind"],
    methodCode: string,
    amount: ReturnType<typeof usd>,
    inDrawer: boolean,
  ) => ({ kind, methodCode, amount, inDrawer });

  test("lo que NO está en la gaveta no entra en el arqueo de efectivo", () => {
    // Es la distinción que hace que un arqueo sirva: el Pago Móvil no está
    // en el cajón, y contarlo contra el efectivo inventa una diferencia.
    const t = tallyShift([
      mv("OPENING_FLOAT", "EFECTIVO_USD", usd("50.00"), true),
      mv("PAYMENT", "EFECTIVO_USD", usd("100.00"), true),
      mv("PAYMENT", "PAGO_MOVIL", bs("22841.00"), false),
    ]);

    const gavetaUsd = t.drawer.find((d) => d.currency === "USD")!;
    assert.equal(toMajor(gavetaUsd.expected), "150.00");
    // Los bolívares del Pago Móvil no generan expectativa de gaveta.
    assert.equal(t.drawer.some((d) => d.currency === "VES"), false);
    // Pero sí se totalizan por medio, para conciliar contra su estado de cuenta.
    assert.equal(t.byMethod.some((m) => m.methodCode === "PAGO_MOVIL"), true);
  });

  test("el vuelto RESTA de la gaveta", () => {
    const t = tallyShift([
      mv("OPENING_FLOAT", "EFECTIVO_USD", usd("50.00"), true),
      mv("PAYMENT", "EFECTIVO_USD", usd("20.00"), true),
      mv("CHANGE_OUT", "EFECTIVO_USD", usd("3.00"), true),
    ]);
    const g = t.drawer.find((d) => d.currency === "USD")!;
    assert.equal(toMajor(g.cashIn), "20.00");
    assert.equal(toMajor(g.cashOut), "3.00");
    assert.equal(toMajor(g.expected), "67.00");
  });

  test("la propina en efectivo SÍ está en la gaveta aunque no sea ingreso", () => {
    const t = tallyShift([
      mv("OPENING_FLOAT", "EFECTIVO_USD", usd("0.00"), true),
      mv("TIP_IN_DRAWER", "EFECTIVO_USD", usd("3.00"), true),
    ]);
    assert.equal(toMajor(t.drawer[0]!.expected), "3.00");
  });

  test("una salida de caja resta", () => {
    const t = tallyShift([
      mv("OPENING_FLOAT", "EFECTIVO_USD", usd("100.00"), true),
      mv("PAYOUT", "EFECTIVO_USD", usd("25.00"), true),
    ]);
    assert.equal(toMajor(t.drawer[0]!.expected), "75.00");
  });

  test("separa monedas: dólares y bolívares no se mezclan en la gaveta", () => {
    const t = tallyShift([
      mv("OPENING_FLOAT", "EFECTIVO_USD", usd("50.00"), true),
      mv("OPENING_FLOAT", "EFECTIVO_VES", bs("1000.00"), true),
      mv("PAYMENT", "EFECTIVO_VES", bs("500.00"), true),
    ]);
    assert.equal(toMajor(t.drawer.find((d) => d.currency === "USD")!.expected), "50.00");
    assert.equal(toMajor(t.drawer.find((d) => d.currency === "VES")!.expected), "1500.00");
  });
});

describe("conteo por denominaciones (F4-07)", () => {
  test("suma billetes y monedas", () => {
    const total = countDenominations(
      [
        { denomination: usd("20.00"), count: 5 },
        { denomination: usd("5.00"), count: 3 },
        { denomination: usd("0.25"), count: 4 },
      ],
      "USD",
    );
    assert.equal(toMajor(total), "116.00");
  });

  test("un conteo vacío es cero, no un error", () => {
    assert.equal(toMajor(countDenominations([], "USD")), "0.00");
  });

  test("rechaza conteos negativos o fraccionarios", () => {
    assert.throws(
      () => countDenominations([{ denomination: usd("20.00"), count: -1 }], "USD"),
      RangeError,
    );
    assert.throws(
      () => countDenominations([{ denomination: usd("20.00"), count: 1.5 }], "USD"),
      RangeError,
    );
  });

  test("el arqueo completo: contar, comparar y ver la diferencia", () => {
    const t = tallyShift([
      { kind: "OPENING_FLOAT", methodCode: "EFECTIVO_USD", amount: usd("50.00"), inDrawer: true },
      { kind: "PAYMENT", methodCode: "EFECTIVO_USD", amount: usd("100.00"), inDrawer: true },
      { kind: "CHANGE_OUT", methodCode: "EFECTIVO_USD", amount: usd("30.00"), inDrawer: true },
    ]);
    const esperado = t.drawer[0]!.expected; // 120,00
    const contado = countDenominations(
      [
        { denomination: usd("20.00"), count: 5 },
        { denomination: usd("10.00"), count: 1 },
        { denomination: usd("5.00"), count: 1 },
      ],
      "USD",
    ); // 115,00

    const [linea] = reconcile([{ currency: "USD", counted: contado, expected: esperado }]);
    assert.equal(toMajor(linea!.expected), "120.00");
    assert.equal(toMajor(linea!.counted), "115.00");
    assert.equal(toMajor(linea!.difference), "-5.00"); // faltan 5
  });
});
