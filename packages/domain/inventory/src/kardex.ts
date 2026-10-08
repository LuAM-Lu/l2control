/**
 * El kárdex — B11-3 (M-29). Puro: los movimientos de un producto en un periodo con el saldo después de cada uno.
 *
 * La existencia es la suma de los movimientos (B9-2), así que el saldo al empezar un periodo es la suma de los de antes,
 * y el de después de cada movimiento, ese saldo más los que van. Un conteo que cuadró o un inventario inicial en cero no
 * mueven nada (cantidad 0) pero se ven: también son algo que pasó. El orden es el del instante y, a la par, el de
 * llegada; el saldo final del periodo es la existencia a esa hora.
 */

/** Lo mínimo de un movimiento para el kárdex: cuándo y cuánto (positivo entra, negativo sale, 0 no mueve). */
export type MovimientoDeKardex = Readonly<{ at: number; quantity: number }>;

export type FilaDeKardex<T extends MovimientoDeKardex> = T & Readonly<{ saldo: number }>;

/** Los movimientos en orden, cada uno con el saldo que dejó. No reordena lo que llega en el mismo instante. */
export function conSaldo<T extends MovimientoDeKardex>(inicial: number, movimientos: readonly T[]): FilaDeKardex<T>[] {
  const enOrden = movimientos.map((m, i) => [m, i] as const).sort(([a, i], [b, j]) => a.at - b.at || i - j);
  let saldo = inicial;
  return enOrden.map(([m]) => {
    saldo += m.quantity;
    return { ...m, saldo };
  });
}

/** Lo que entró, lo que salió (en positivo) y el saldo final de un periodo. */
export function resumenDeKardex(inicial: number, movimientos: readonly MovimientoDeKardex[]): Readonly<{ entradas: number; salidas: number; final: number }> {
  let entradas = 0;
  let salidas = 0;
  for (const m of movimientos) {
    if (m.quantity > 0) entradas += m.quantity;
    else salidas -= m.quantity;
  }
  return { entradas, salidas, final: inicial + entradas - salidas };
}
