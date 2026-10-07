import { test } from "node:test";
import assert from "node:assert/strict";
import { averageUnitCostMinor, costOfReturn, costOfUnits, entryLineProblem, entryLineTotals, marginBasisPoints, packCostOf } from "./costo.ts";

const porBulto = (minor: bigint) => ({ per: "PACK" as const, minor });

test("el costo tras dos compras a precios distintos es el del contador: (c₁ + c₂) / (q₁ + q₂)", () => {
  // 24 refrescos a $ 12,00 la caja ($ 0,50 c/u) y 24 a $ 14,40 ($ 0,60 c/u): $ 26,40 / 48 = $ 0,55.
  const primera = entryLineTotals({ packs: 1, packSize: 24, cost: porBulto(1200n) });
  const segunda = entryLineTotals({ packs: 1, packSize: 24, cost: porBulto(1440n) });
  const stock = { quantity: primera.units + segunda.units, valueMinor: primera.valueMinor + segunda.valueMinor };
  assert.deepEqual(stock, { quantity: 48, valueMinor: 2640n });
  assert.equal(averageUnitCostMinor(stock), 55n);
});

test("comprar por caja y vender por unidad cuadra: vender todo deja el valor en cero, al céntimo", () => {
  // Una caja de 24 por $ 10,00: $ 0,41666… c/u. Vender de una en una no pierde ni gana céntimos.
  let stock = { quantity: 24, valueMinor: 1000n };
  let salio = 0n;
  while (stock.quantity > 0) {
    const c = costOfUnits(stock, 1);
    salio += c;
    stock = { quantity: stock.quantity - 1, valueMinor: stock.valueMinor - c };
  }
  assert.equal(salio, 1000n);
  assert.equal(stock.valueMinor, 0n);
});

test("una venta se lleva su parte proporcional, redondeada al céntimo", () => {
  assert.equal(costOfUnits({ quantity: 3, valueMinor: 100n }, 1), 33n);
  assert.equal(costOfUnits({ quantity: 3, valueMinor: 100n }, 2), 67n);
  assert.equal(costOfUnits({ quantity: 3, valueMinor: 100n }, 3), 100n);
  assert.equal(costOfUnits({ quantity: 5, valueMinor: 0n }, 2), 0n); // lo regalado no cuesta
  assert.throws(() => costOfUnits({ quantity: 1, valueMinor: 50n }, 2), RangeError);
  assert.throws(() => costOfUnits({ quantity: 1, valueMinor: 50n }, 0), RangeError);
});

test("devolver lo que una cuenta sacó vuelve con lo que se llevó: el costo promedio no cambia", () => {
  const stock = { quantity: 48, valueMinor: 2640n };
  const sale = costOfUnits(stock, 2);
  const despues = { quantity: 46, valueMinor: stock.valueMinor - sale };
  const vuelve = costOfReturn({ quantity: 2, valueMinor: sale }, 2);
  assert.equal(averageUnitCostMinor({ quantity: despues.quantity + 2, valueMinor: despues.valueMinor + vuelve }), 55n);
  assert.equal(costOfReturn({ quantity: 2, valueMinor: 110n }, 1), 55n);
  assert.equal(costOfReturn({ quantity: 0, valueMinor: 0n }, 1), 0n);
});

test("el costo promedio, sin existencia, no existe", () => {
  assert.equal(averageUnitCostMinor({ quantity: 0, valueMinor: 0n }), null);
  assert.equal(averageUnitCostMinor({ quantity: 24, valueMinor: 1000n }), 42n);
});

test("el margen sobre el precio, en puntos básicos", () => {
  assert.equal(marginBasisPoints(150n, 55n), 6333); // $ 1,50 con costo $ 0,55: 63,33 %
  assert.equal(marginBasisPoints(100n, 120n), -2000); // por debajo del costo
  assert.equal(marginBasisPoints(100n, null), null);
});

test("una línea de entrada: bultos, unidades por bulto y costo, con sus topes", () => {
  assert.equal(entryLineProblem({ packs: 2, packSize: 24, cost: porBulto(1200n) }), null);
  assert.equal(entryLineProblem({ packs: 1, packSize: 6, cost: porBulto(0n) }), null); // lo regalado entra
  assert.equal(entryLineProblem({ packs: 0, packSize: 24, cost: porBulto(1200n) }), "BULTOS");
  assert.equal(entryLineProblem({ packs: 1.5, packSize: 24, cost: porBulto(1200n) }), "BULTOS");
  assert.equal(entryLineProblem({ packs: 1, packSize: 0, cost: porBulto(1200n) }), "UNIDADES_POR_BULTO");
  assert.equal(entryLineProblem({ packs: 1, packSize: 24, cost: porBulto(-1n) }), "COSTO_NEGATIVO");
  assert.equal(entryLineProblem({ packs: 200, packSize: 24, cost: porBulto(100_000n) }), "COSTO_EXCESIVO");
  assert.deepEqual(entryLineTotals({ packs: 2, packSize: 24, cost: porBulto(1200n) }), { units: 48, valueMinor: 2400n });
});

test("el costo de la línea, como venga en la factura: por unidad, por bulto o el total (M-24)", () => {
  // 24 latas sueltas (bultos de 1) a $ 0,50 cada una: $ 12,00.
  assert.deepEqual(entryLineTotals({ packs: 24, packSize: 1, cost: { per: "UNIT", minor: 50n } }), { units: 24, valueMinor: 1200n });
  // 2 cajas de 24 con el costo por unidad: 48 × $ 0,50.
  assert.deepEqual(entryLineTotals({ packs: 2, packSize: 24, cost: { per: "UNIT", minor: 50n } }), { units: 48, valueMinor: 2400n });
  // El total de la línea, tal cual: 3 unidades por $ 10,00 (no se reparte en céntimos aquí).
  assert.deepEqual(entryLineTotals({ packs: 3, packSize: 1, cost: { per: "LINE", minor: 1000n } }), { units: 3, valueMinor: 1000n });
  // El tope mira lo que cuesta la línea entera, sea cual sea la forma.
  assert.equal(entryLineProblem({ packs: 10_000, packSize: 1, cost: { per: "UNIT", minor: 1001n } }), "COSTO_EXCESIVO");
  assert.equal(entryLineProblem({ packs: 1, packSize: 1, cost: { per: "LINE", minor: 10_000_001n } }), "COSTO_EXCESIVO");
  assert.equal(entryLineProblem({ packs: 1, packSize: 1, cost: { per: "LINE", minor: 10_000_000n } }), null);
});

test("lo que costó cada bulto de una línea registrada, para proponerlo la próxima vez", () => {
  assert.equal(packCostOf({ packs: 2, valueMinor: 2400n }), 1200n);
  assert.equal(packCostOf({ packs: 3, valueMinor: 1000n }), 333n);
  assert.equal(packCostOf({ packs: 0, valueMinor: 0n }), null);
});
