import { test } from "node:test";
import assert from "node:assert/strict";
import { stockMovesOf, stockShortfalls, unitsHeld } from "./existencias.ts";

const AGUA = "0199a0c0-0000-7000-8000-0000000000a1";
const MALTA = "0199a0c0-0000-7000-8000-0000000000a2";
const CAFE = "0199a0c0-0000-7000-8000-0000000000a3";
const todos = () => true;
const sinCafe = (id: string) => id !== CAFE;

test("cada línea de un producto es una unidad; lo del parque y lo movido no cuentan", () => {
  const held = unitsHeld([{ productId: AGUA }, { productId: AGUA }, { productId: MALTA, movedTo: "otra" }, {}]);
  assert.deepEqual([...held], [[AGUA, 2]]);
});

test("una cuenta nueva saca lo que vende; quitar una línea la devuelve", () => {
  assert.deepEqual(stockMovesOf(null, [{ productId: AGUA }, { productId: AGUA }, { productId: MALTA }], todos), [
    { productId: AGUA, quantity: -2 },
    { productId: MALTA, quantity: -1 },
  ]);
  assert.deepEqual(stockMovesOf([{ productId: AGUA }, { productId: AGUA }], [{ productId: AGUA }], todos, new Map([[AGUA, 2]])), [{ productId: AGUA, quantity: 1 }]);
});

test("guardar lo mismo, cobrar o regalar no mueve nada", () => {
  const lineas = [{ productId: AGUA }, { productId: MALTA }];
  assert.deepEqual(stockMovesOf(lineas, [...lineas], todos), []);
});

test("lo que no lleva existencia no se mueve", () => {
  assert.deepEqual(stockMovesOf(null, [{ productId: CAFE }, { productId: AGUA }], sinCafe), [{ productId: AGUA, quantity: -1 }]);
});

test("mover una línea a otra cuenta la devuelve aquí (la otra la saca)", () => {
  assert.deepEqual(stockMovesOf([{ productId: AGUA }], [{ productId: AGUA, movedTo: "mesa" }], todos, new Map([[AGUA, 1]])), [{ productId: AGUA, quantity: 1 }]);
});

test("los movimientos salen ordenados por producto (el orden de los candados)", () => {
  const ids = stockMovesOf(null, [{ productId: MALTA }, { productId: AGUA }], todos).map((m) => m.productId);
  assert.deepEqual(ids, [AGUA, MALTA].sort());
});

test("sin existencia no se vende: la última unidad sí, una de más no", () => {
  const hay = new Map([[AGUA, 1]]);
  assert.deepEqual(stockShortfalls([{ productId: AGUA, quantity: -1 }], hay), []);
  assert.deepEqual(stockShortfalls([{ productId: AGUA, quantity: -2 }], hay), [{ productId: AGUA, available: 1, requested: 2 }]);
});

test("lo que no se sabe que hay, no hay; una devolución nunca falta", () => {
  assert.deepEqual(stockShortfalls([{ productId: MALTA, quantity: -1 }], new Map()), [{ productId: MALTA, available: 0, requested: 1 }]);
  assert.deepEqual(stockShortfalls([{ productId: MALTA, quantity: 3 }], new Map()), []);
});

test("una cuenta no devuelve más de lo que sacó (lo que entró antes de llevarse la existencia)", () => {
  const antes = [{ productId: AGUA }, { productId: AGUA }, { productId: AGUA }];
  // Sacó una sola: quitar las tres devuelve una.
  assert.deepEqual(stockMovesOf(antes, [], todos, new Map([[AGUA, 1]])), [{ productId: AGUA, quantity: 1 }]);
  // No sacó nada: quitar no devuelve nada, y añadir sí saca.
  assert.deepEqual(stockMovesOf(antes, [{ productId: AGUA }], todos), []);
  assert.deepEqual(stockMovesOf(antes, [...antes, { productId: AGUA }], todos), [{ productId: AGUA, quantity: -1 }]);
});
