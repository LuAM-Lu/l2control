import { test } from "node:test";
import assert from "node:assert/strict";
import { conSaldo, resumenDeKardex } from "./kardex.ts";

test("cada movimiento con el saldo que deja, desde el del inicio del periodo", () => {
  const filas = conSaldo(10, [
    { at: 3, quantity: -2, que: "venta" },
    { at: 1, quantity: 24, que: "compra" },
    { at: 2, quantity: 0, que: "conteo que cuadró" },
  ]);
  assert.deepEqual(
    filas.map((f) => [f.que, f.saldo]),
    [
      ["compra", 34],
      ["conteo que cuadró", 34],
      ["venta", 32],
    ],
  );
});

test("en el mismo instante se respeta el orden de llegada", () => {
  const filas = conSaldo(0, [
    { at: 5, quantity: 3, n: 1 },
    { at: 5, quantity: -1, n: 2 },
  ]);
  assert.deepEqual(
    filas.map((f) => [f.n, f.saldo]),
    [
      [1, 3],
      [2, 2],
    ],
  );
});

test("el resumen: lo que entró, lo que salió y el saldo final es el último saldo", () => {
  const movimientos = [
    { at: 1, quantity: 24 },
    { at: 2, quantity: -3 },
    { at: 3, quantity: -1 },
    { at: 4, quantity: 0 },
  ];
  assert.deepEqual(resumenDeKardex(5, movimientos), { entradas: 24, salidas: 4, final: 25 });
  assert.equal(conSaldo(5, movimientos).at(-1)?.saldo, 25);
  assert.deepEqual(resumenDeKardex(7, []), { entradas: 0, salidas: 0, final: 7 });
});
