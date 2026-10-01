/**
 * El costo — B9-3, F8-06, F8-01 (solo lo que se vende tal cual; los insumos de cocina, después del piloto).
 *
 * Costo promedio ponderado perpetuo: el inventario de un producto tiene unidades y un VALOR al costo
 * (en centavos de dólar, `bigint`). Una entrada suma lo que costó; una venta saca su parte
 * proporcional del valor; el costo promedio es valor entre unidades. Llevar el valor (y no un costo
 * unitario redondeado) evita que el redondeo se acumule: cuando se vende la última unidad, sale
 * exactamente lo que quedaba, y tras dos compras el costo es (c₁ + c₂) / (q₁ + q₂), como lo calcula
 * el contador.
 *
 * Se compra por bultos y se vende por unidades (la caja de 24 refrescos): la entrada dice cuántos
 * bultos de cuántas unidades y lo que costó cada bulto; las unidades son bultos × unidades por bulto.
 */

import { money, multiply, multiplyByRate, subtract } from "@l2/domain-money";

/** Unidades y valor al costo de un producto en una sucursal: la suma de sus movimientos. */
export type StockValue = Readonly<{ quantity: number; valueMinor: bigint }>;

/** Los costos van en la moneda funcional (DEC-2): el dólar. */
const USD = "USD" as const;

/** `valor × a / b` al céntimo, redondeando a la mitad hacia arriba: la aritmética es de `@l2/domain-money`. */
const proporcion = (valueMinor: bigint, a: bigint, b: bigint): bigint => multiplyByRate(money(valueMinor, USD), a, b, "HALF_UP").amount;

/**
 * El valor al costo que se lleva una venta de `units` unidades (positivo: lo que sale). Su parte
 * proporcional del valor del inventario; la última unidad se lleva lo que quede, al céntimo.
 * Sin unidades no hay venta: lanza (lo impide antes `stockShortfalls`).
 */
export function costOfUnits(stock: StockValue, units: number): bigint {
  if (!Number.isInteger(units) || units <= 0) throw new RangeError("Se venden unidades enteras y positivas");
  if (units > stock.quantity) throw new RangeError("No se vende más de lo que hay");
  if (stock.valueMinor <= 0n) return 0n;
  if (units === stock.quantity) return stock.valueMinor;
  return proporcion(stock.valueMinor, BigInt(units), BigInt(stock.quantity));
}

/**
 * Lo que vuelve al valor del inventario cuando una cuenta devuelve `units` de las que sacó: su parte
 * de lo que esas salidas se llevaron, para que vender y devolver no cambie el costo promedio.
 */
export function costOfReturn(taken: StockValue, units: number): bigint {
  if (!Number.isInteger(units) || units <= 0) throw new RangeError("Se devuelven unidades enteras y positivas");
  if (taken.quantity <= 0 || taken.valueMinor <= 0n) return 0n;
  if (units >= taken.quantity) return taken.valueMinor;
  return proporcion(taken.valueMinor, BigInt(units), BigInt(taken.quantity));
}

/** El costo promedio de una unidad, redondeado al céntimo para enseñarlo; `null` sin existencia. */
export function averageUnitCostMinor(stock: StockValue): bigint | null {
  if (stock.quantity <= 0) return null;
  return proporcion(stock.valueMinor > 0n ? stock.valueMinor : 0n, 1n, BigInt(stock.quantity));
}

/**
 * El margen sobre el precio, en puntos básicos (2500 = 25 %): (precio − costo) / precio. Negativo si
 * se vende por debajo del costo. `null` sin costo o sin precio. Es para enseñar, no para cobrar.
 */
export function marginBasisPoints(priceMinor: bigint, unitCostMinor: bigint | null): number | null {
  if (unitCostMinor === null || priceMinor <= 0n) return null;
  const margen = subtract(money(priceMinor, USD), money(unitCostMinor, USD));
  // Puntos básicos: un número pequeño y entero, no dinero; sale de la misma aritmética exacta.
  return Number(multiplyByRate(margen, 10_000n, priceMinor, "HALF_UP").amount);
}

/** Topes de una línea de entrada: por encima, alguien se equivocó al teclear. */
export const MAX_PACKS = 10_000;
export const MAX_PACK_SIZE = 1_000;
/** Hasta $ 100.000,00 por línea: por encima, se tecleó en bolívares. */
export const MAX_ENTRY_LINE_MINOR = 10_000_000n;

/** Una línea de entrada: tantos bultos de tantas unidades, a tanto el bulto. */
export type EntryLine = Readonly<{ packs: number; packSize: number; packCostMinor: bigint }>;

export type EntryLineProblem = "BULTOS" | "UNIDADES_POR_BULTO" | "COSTO_NEGATIVO" | "COSTO_EXCESIVO";

/** Qué tiene mal una línea de entrada, o `null`. Un costo cero vale: lo que el proveedor regala. */
export function entryLineProblem(l: EntryLine): EntryLineProblem | null {
  if (!Number.isInteger(l.packs) || l.packs < 1 || l.packs > MAX_PACKS) return "BULTOS";
  if (!Number.isInteger(l.packSize) || l.packSize < 1 || l.packSize > MAX_PACK_SIZE) return "UNIDADES_POR_BULTO";
  if (l.packCostMinor < 0n) return "COSTO_NEGATIVO";
  if (multiply(money(l.packCostMinor, USD), BigInt(l.packs)).amount > MAX_ENTRY_LINE_MINOR) return "COSTO_EXCESIVO";
  return null;
}

/** Las unidades que entran y lo que cuestan en total. */
export function entryLineTotals(l: EntryLine): Readonly<{ units: number; valueMinor: bigint }> {
  return { units: l.packs * l.packSize, valueMinor: multiply(money(l.packCostMinor, USD), BigInt(l.packs)).amount };
}
