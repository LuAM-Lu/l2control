/**
 * Lo que el informe del parque cuenta de las estancias — B11-6 (M-37).
 *
 * Funciones puras: las estancias entran con sus instantes (ADR-010); la que sigue en sala, hasta el instante del
 * informe, que pone quien llama.
 */

/** Una estancia vista como intervalo: de cuándo entró a cuándo salió (o hasta el instante del informe). */
export type Intervalo = Readonly<{ desde: number; hasta: number }>;

/**
 * El aforo pico: cuántos niños hubo a la vez como máximo y el primer instante en que se llegó. Una salida y una entrada
 * en el mismo instante no se suman: sale primero. `null` sin estancias.
 */
export function picoDeAforo(estancias: readonly Intervalo[]): Readonly<{ ninos: number; en: number }> | null {
  if (estancias.length === 0) return null;
  const marcas = estancias.flatMap((e) => [
    { t: e.desde, d: 1 },
    { t: Math.max(e.desde, e.hasta), d: -1 },
  ]);
  marcas.sort((a, b) => a.t - b.t || a.d - b.d);
  let ahora = 0;
  let mejor = { ninos: 0, en: marcas[0]!.t };
  for (const m of marcas) {
    ahora += m.d;
    if (ahora > mejor.ninos) mejor = { ninos: ahora, en: m.t };
  }
  return mejor;
}
