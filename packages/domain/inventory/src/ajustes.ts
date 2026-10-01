/**
 * Salidas y conteo físico — B9-4, F8-07.
 *
 * Una SALIDA saca con un motivo de lista cerrada: lo que se dañó o venció, lo que consumió el
 * personal, lo que se regaló fuera de una cuenta y lo que se devolvió al proveedor. Un CONTEO deja la
 * existencia igual a lo contado: lo que falta sale y lo que sobra entra, cada diferencia con su
 * movimiento. Las dos las autoriza alguien (§7.3) y las guarda `@l2/application`.
 */
import { money, multiply, multiplyByRate } from "@l2/domain-money";
import type { StockMove } from "./existencias.ts";
import type { StockValue } from "./costo.ts";

/** Por qué sale algo del inventario sin venderse. Lista cerrada (§7.5): «varios» no explica nada. */
export const STOCK_OUT_REASONS = ["MERMA", "CONSUMO_INTERNO", "REGALO", "DEVOLUCION_PROVEEDOR"] as const;
export type StockOutReason = (typeof STOCK_OUT_REASONS)[number];

/** Una línea de un conteo: lo que el sistema decía cuando se contó y lo que se contó. */
export type CountLine = Readonly<{ productId: string; expected: number; counted: number }>;

/** Lo que mueve un conteo: lo contado menos lo esperado, de cada producto con diferencia. */
export function countMoves(lines: readonly CountLine[]): StockMove[] {
  return lines
    .filter((l) => l.counted !== l.expected)
    .map((l) => ({ productId: l.productId, quantity: l.counted - l.expected }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
}

/**
 * Lo que vale al costo lo que un conteo encuentra de más: al costo promedio de lo que hay; sin
 * existencia, al último costo de entrada por unidad (`lastUnitCost`, el valor y las unidades de esa
 * entrada); sin ninguno de los dos, cero. Así el conteo no inventa un costo.
 */
export function costOfSurplus(stock: StockValue, lastUnitCost: StockValue | null, units: number): bigint {
  if (!Number.isInteger(units) || units <= 0) throw new RangeError("Lo que sobra son unidades enteras y positivas");
  const base = stock.quantity > 0 && stock.valueMinor > 0n ? stock : lastUnitCost && lastUnitCost.quantity > 0 ? lastUnitCost : null;
  if (!base) return 0n;
  return multiplyByRate(multiply(money(base.valueMinor, "USD"), BigInt(units)), 1n, BigInt(base.quantity), "HALF_UP").amount;
}
