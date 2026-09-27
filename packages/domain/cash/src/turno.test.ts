/**
 * Pruebas de la apertura del turno — B3-1, F4-01, I-06.
 *
 * El fondo se declara por moneda de la gaveta (dólares y bolívares), cero vale y negativo no; sin
 * turno abierto no se cobra, y después del corte Z tampoco.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fromMajor, toMajor } from "@l2/domain-money";
import { chargeProblem, openingFloatProblem, openingMovements, tallyShift } from "./index.ts";

const usd = (v: string) => fromMajor(v, "USD");
const bs = (v: string) => fromMajor(v, "VES");

describe("el fondo inicial (F4-01)", () => {
  test("uno por moneda de la gaveta; cero vale", () => {
    assert.equal(openingFloatProblem([usd("20.00"), bs("0.00")]), null);
  });

  test("lo que no vale", () => {
    assert.equal(openingFloatProblem([usd("20.00")]), "FALTA_MONEDA");
    assert.equal(openingFloatProblem([usd("20.00"), usd("5.00"), bs("0.00")]), "MONEDA_REPETIDA");
    assert.equal(openingFloatProblem([usd("20.00"), bs("0.00"), fromMajor("5.00", "USDT")]), "MONEDA_SIN_GAVETA");
    assert.equal(openingFloatProblem([usd("-1.00"), bs("0.00")]), "FONDO_NEGATIVO");
  });

  test("el fondo entra en la gaveta como movimiento del turno, no de un punto", () => {
    const t = tallyShift(openingMovements([usd("20.00"), bs("1500.00")]));
    const gaveta = Object.fromEntries(t.drawer.map((d) => [d.currency, toMajor(d.expected)]));
    assert.deepEqual(gaveta, { USD: "20.00", VES: "1500.00" });
    assert.deepEqual(t.byPoint, []);
  });
});

describe("cobrar exige turno", () => {
  test("sin turno, no; abierto o en cierre, sí; con corte Z, no", () => {
    assert.equal(chargeProblem(null), "SIN_TURNO");
    assert.equal(chargeProblem({ status: "ABIERTO" }), null);
    assert.equal(chargeProblem({ status: "EN_CIERRE" }), null);
    assert.equal(chargeProblem({ status: "CERRADO_Z" }), "TURNO_CERRADO");
  });
});
