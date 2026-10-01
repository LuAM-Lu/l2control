/**
 * Las existencias — B9-2, F8-05, I-10, ADR-023.
 *
 * La existencia de un producto es la SUMA de sus movimientos: nada la guarda como un número que se
 * edita. Un producto sale cuando su línea entra en una cuenta (la venta de mostrador, la cuenta de la
 * mesa, el consumo de una familia) y vuelve cuando la línea se quita sin pagar. Una cortesía no
 * devuelve nada: se entregó. Lo cobrado tampoco: se vendió.
 *
 * Aquí se decide qué movimientos causa un cambio de una cuenta y si hay con qué cubrirlos. Guardarlos
 * (con el candado del producto, en la transacción de la cuenta) es de `@l2/application`.
 */

/** Lo que este módulo necesita de una línea de cuenta: de qué producto es y si se movió a otra. */
export type StockLine = Readonly<{ productId?: string | undefined; movedTo?: string | undefined }>;

/** Un movimiento que causa un cambio: positivo entra (vuelve al estante), negativo sale. */
export type StockMove = Readonly<{ productId: string; quantity: number }>;

/**
 * Cuántas unidades de cada producto tiene una cuenta: cada línea de un producto es una unidad. Una
 * línea movida a otra cuenta ya no es de esta (la otra la cuenta como suya).
 */
export function unitsHeld(lines: readonly StockLine[]): Map<string, number> {
  const held = new Map<string, number>();
  for (const l of lines) {
    if (l.productId === undefined || l.movedTo !== undefined) continue;
    held.set(l.productId, (held.get(l.productId) ?? 0) + 1);
  }
  return held;
}

/**
 * Los movimientos que causa pasar de `before` (`null` si la cuenta es nueva) a `after`, solo de los
 * productos que llevan existencia. Ordenados por producto: quien toma sus candados en este orden no se
 * cruza con otra venta que los pida al revés.
 *
 * `taken` es lo que la cuenta tiene sacado de cada producto según sus movimientos. Una cuenta no
 * devuelve más de lo que sacó: una línea que entró antes de llevarse la existencia (una cuenta abierta
 * antes de B9-2, o un producto al que se le encendió el control después) no sacó nada, y quitarla no
 * pone en el estante una unidad que nunca salió de él.
 */
export function stockMovesOf(
  before: readonly StockLine[] | null,
  after: readonly StockLine[],
  tracksStock: (productId: string) => boolean,
  taken: ReadonlyMap<string, number> = new Map(),
): StockMove[] {
  const antes = unitsHeld(before ?? []);
  const despues = unitsHeld(after);
  const productos = [...new Set([...antes.keys(), ...despues.keys()])].filter(tracksStock).sort();
  const moves: StockMove[] = [];
  for (const productId of productos) {
    // Más unidades en la cuenta = menos en el estante.
    const diff = (antes.get(productId) ?? 0) - (despues.get(productId) ?? 0);
    const quantity = diff > 0 ? Math.min(diff, Math.max(0, taken.get(productId) ?? 0)) : diff;
    if (quantity !== 0) moves.push({ productId, quantity });
  }
  return moves;
}

/** Un producto que no alcanza: cuánto hay y cuánto se pide. */
export type StockShortfall = Readonly<{ productId: string; available: number; requested: number }>;

/**
 * Lo que no alcanza (ADR-023 §3): cada salida que dejaría su producto por debajo de cero. Vacío si
 * todo alcanza. `available` es la existencia de cada producto antes del cambio; sin dato, cero
 * (fail-closed: lo que no se sabe que hay, no hay).
 */
export function stockShortfalls(moves: readonly StockMove[], available: ReadonlyMap<string, number>): StockShortfall[] {
  return moves
    .filter((m) => m.quantity < 0 && (available.get(m.productId) ?? 0) + m.quantity < 0)
    .map((m) => ({ productId: m.productId, available: available.get(m.productId) ?? 0, requested: -m.quantity }));
}
