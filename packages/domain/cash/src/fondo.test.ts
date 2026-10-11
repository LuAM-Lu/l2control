import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { money } from "@l2/domain-money";
import { aperturaContraLoQueQuedo, dejarConFondoFijo } from "./index.ts";

/**
 * El fondo fijo (B3-22, M-38): el cierre propone dejar el fondo (sin pasar de lo contado) y la apertura dice si falta o
 * sobra de lo que quedó.
 */
const usd = (minor: number) => money(BigInt(minor), "USD");
const ves = (minor: number) => money(BigInt(minor), "VES");

describe("el fondo fijo (B3-22)", () => {
  test("al cerrar se propone dejar el fondo de cada moneda, nunca más de lo contado", () => {
    assert.deepEqual(dejarConFondoFijo([usd(2000), ves(0)], [usd(13550), ves(250000)]), [usd(2000), ves(0)]);
    assert.deepEqual(dejarConFondoFijo([usd(2000), ves(50000)], [usd(1500), ves(250000)]), [usd(1500), ves(50000)]);
  });

  test("con un fondo de $ 20, si al abrir se cuentan $ 15 faltan $ 5", () => {
    const a = aperturaContraLoQueQuedo([usd(1500), ves(0)], [usd(2000), ves(0)]);
    assert.equal(a.cuadra, false);
    assert.deepEqual(a.lineas[0]!.diferencia, usd(-500));
    assert.deepEqual(a.lineas[1]!.diferencia, ves(0));
  });

  test("lo contado igual a lo que quedó, cuadra; de más, sobra", () => {
    assert.equal(aperturaContraLoQueQuedo([usd(2000), ves(0)], [usd(2000), ves(0)]).cuadra, true);
    assert.deepEqual(aperturaContraLoQueQuedo([usd(2000), ves(1000)], [usd(2000), ves(0)]).lineas[1]!.diferencia, ves(1000));
  });
});
