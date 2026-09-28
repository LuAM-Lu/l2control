/**
 * El corte del turno — F4-05 a F4-08, B3-5, D-JOR.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { fromMajor, toMajor, type FrozenRate } from "@l2/domain-money";
import {
  COUNT_THRESHOLD,
  countDifferenceInUsd,
  ledgerMovements,
  leftInDrawerProblem,
  openingMovements,
  reconcile,
  tallyShift,
  withdrawn,
  zSigner,
} from "./index.ts";

const usd = (m: string) => fromMajor(m, "USD");
const bs = (m: string) => fromMajor(m, "VES");
/** Bs. 100,00 por dólar, de bolívares a dólares (la forma de `frozenRateOf`). */
const aDolares: FrozenRate = { from: "VES", to: "USD", numerator: 100n, denominator: 1n };

describe("el turno desde su libro", () => {
  test("cobros, vuelto, propina y residuo: la gaveta cuenta solo el efectivo", () => {
    const t = tallyShift([
      ...openingMovements([usd("20.00"), bs("0.00")]),
      ...ledgerMovements([
        { kind: "COBRO", methodCode: "EFECTIVO_USD", amount: usd("5.00"), inDrawer: true },
        { kind: "VUELTO", methodCode: "EFECTIVO_USD", amount: usd("3.46"), inDrawer: true },
        { kind: "COBRO", methodCode: "PAGO_MOVIL", amount: bs("992.57"), inDrawer: false },
        { kind: "PROPINA", methodCode: "EFECTIVO_USD", amount: usd("0.50"), inDrawer: true },
      ]),
    ]);
    const gaveta = Object.fromEntries(t.drawer.map((d) => [d.currency, toMajor(d.expected)]));
    // 20 + 5 − 3,46: la propina ya estaba en los $ 5 entregados, y el Pago Móvil no está en la gaveta.
    assert.deepEqual(gaveta, { USD: "21.54", VES: "0.00" });
    const efectivo = t.byMethod.find((m) => m.methodCode === "EFECTIVO_USD")!;
    assert.equal(toMajor(efectivo.total), "21.54");
    const movil = t.byMethod.find((m) => m.methodCode === "PAGO_MOVIL")!;
    assert.equal(toMajor(movil.charged), "992.57");
  });

  test("una anulación entra con su signo y deshace lo que hizo el cobro", () => {
    const t = tallyShift(
      ledgerMovements([
        { kind: "COBRO", methodCode: "EFECTIVO_USD", amount: usd("5.00"), inDrawer: true },
        { kind: "VUELTO", methodCode: "EFECTIVO_USD", amount: usd("3.46"), inDrawer: true },
        { kind: "COBRO", methodCode: "EFECTIVO_USD", amount: usd("-5.00"), inDrawer: true },
        { kind: "VUELTO", methodCode: "EFECTIVO_USD", amount: usd("-3.46"), inDrawer: true },
      ]),
    );
    assert.equal(toMajor(t.drawer[0]!.expected), "0.00");
    assert.equal(toMajor(t.byMethod[0]!.charged), "0.00");
  });
});

describe("la diferencia del arqueo (D-JOR)", () => {
  const lineas = (dUsd: string, dBs: string) =>
    reconcile([
      { currency: "USD", counted: usd(dUsd), expected: usd("0.00") },
      { currency: "VES", counted: bs(dBs), expected: bs("0.00") },
    ]);

  test("en dólares, con la tasa del turno, sumando cada moneda sin compensar", () => {
    // Sobran $ 0,50 y faltan Bs. 30,00 (= $ 0,30): la diferencia es $ 0,80, no $ 0,20.
    assert.equal(toMajor(countDifferenceInUsd(lineas("0.50", "-30.00"), aDolares)!), "0.80");
  });

  test("hasta $ 1,00 firma la cajera; más, supervisión", () => {
    assert.equal(zSigner(countDifferenceInUsd(lineas("1.00", "0.00"), aDolares)), "CAJERA");
    assert.equal(zSigner(countDifferenceInUsd(lineas("0.60", "50.00"), aDolares)), "SUPERVISION");
    assert.equal(COUNT_THRESHOLD.amount, 100n);
  });

  test("una diferencia en bolívares sin tasa del turno no se sabe medir: firma supervisión", () => {
    assert.equal(countDifferenceInUsd(lineas("0.00", "1.00"), null), null);
    assert.equal(zSigner(null), "SUPERVISION");
    // Sin diferencia en bolívares, la tasa no hace falta.
    assert.equal(toMajor(countDifferenceInUsd(lineas("0.25", "0.00"), null)!), "0.25");
  });
});

describe("lo que queda en la gaveta y lo que se retira", () => {
  test("en un relevo se deja el fondo y se retira lo vendido", () => {
    const contado = [usd("42.00"), bs("1500.00")];
    const queda = [usd("20.00"), bs("1500.00")];
    assert.equal(leftInDrawerProblem(contado, queda), null);
    assert.deepEqual(withdrawn(contado, queda).map(toMajor), ["22.00", "0.00"]);
  });

  test("no se deja más de lo contado, ni negativo, ni en una moneda sin contar", () => {
    assert.equal(leftInDrawerProblem([usd("10.00")], [usd("10.01")]), "MAS_DE_LO_CONTADO");
    assert.equal(leftInDrawerProblem([usd("10.00")], [usd("-1.00")]), "NEGATIVO");
    assert.equal(leftInDrawerProblem([usd("10.00")], [bs("1.00")]), "MONEDA_SIN_CONTAR");
  });
});
