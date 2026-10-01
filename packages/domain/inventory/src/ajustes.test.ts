import { test } from "node:test";
import assert from "node:assert/strict";
import { costOfSurplus, countMoves } from "./ajustes.ts";
import { costOfUnits } from "./costo.ts";

const A = "0199a0c0-0000-7000-8000-0000000000a1";
const B = "0199a0c0-0000-7000-8000-0000000000a2";
const C = "0199a0c0-0000-7000-8000-0000000000a3";

test("el conteo deja la existencia igual a lo contado: cada diferencia es un movimiento", () => {
  const moves = countMoves([
    { productId: B, expected: 10, counted: 7 },
    { productId: A, expected: 3, counted: 5 },
    { productId: C, expected: 4, counted: 4 },
  ]);
  assert.deepEqual(moves, [
    { productId: A, quantity: 2 },
    { productId: B, quantity: -3 },
  ]);
  // Esperado + movimiento = contado, en cada uno.
  assert.equal(10 + moves[1]!.quantity, 7);
});

test("lo que sobra entra al costo promedio; sin existencia, al último costo de entrada; sin nada, a cero", () => {
  assert.equal(costOfSurplus({ quantity: 48, valueMinor: 2880n }, null, 2), 120n); // $ 0,60 c/u
  assert.equal(costOfSurplus({ quantity: 0, valueMinor: 0n }, { quantity: 24, valueMinor: 1000n }, 3), 125n); // $ 10,00 / 24 × 3
  assert.equal(costOfSurplus({ quantity: 0, valueMinor: 0n }, null, 3), 0n);
  assert.throws(() => costOfSurplus({ quantity: 1, valueMinor: 50n }, null, 0), RangeError);
});

test("lo que falta sale al costo promedio, como una venta", () => {
  assert.equal(costOfUnits({ quantity: 10, valueMinor: 600n }, 3), 180n);
});
