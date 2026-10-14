/**
 * Pagar el parque antes de salir — B4-19 (M-39, X-4). Lo puro: qué paquete se le sugiere a un niño con tiempo abierto.
 *
 * La familia pide pagar a mitad de la visita (en la caja, o en la puerta y la monitora la manda a la caja). El tiempo
 * abierto de cada niño pasa a un paquete desde que entró: se sugiere el más chico que cubre lo que lleva (menos la
 * gracia), y si ninguno alcanza, el mayor. Queda prepagado: al salir dentro de su tiempo no pasa por la caja; si se pasa,
 * el tiempo de más va a la caja; si sale antes, no se devuelve.
 */

type Paquete = Readonly<{ duration: Readonly<{ kind: "fixed"; minutes: number }> | Readonly<{ kind: "openEnded" }> }>;

const minutosDe = (p: Paquete) => (p.duration.kind === "fixed" ? p.duration.minutes : Number.POSITIVE_INFINITY);

/** Los paquetes de tiempo fijo, del más corto al más largo: los que se ofrecen al pagar antes de salir. */
export function paquetesParaPagarAntes<P extends Paquete>(paquetes: readonly P[]): P[] {
  return paquetes.filter((p) => p.duration.kind === "fixed").sort((a, b) => minutosDe(a) - minutosDe(b));
}

/** El paquete que cubre lo que lleva: el más chico de tiempo fijo que alcanza, o el mayor si ninguno; `null` sin paquetes. */
export function paqueteQueCubre<P extends Paquete>(paquetes: readonly P[], transcurridoMs: number, graceMinutes: number): P | null {
  const fijos = paquetesParaPagarAntes(paquetes);
  if (fijos.length === 0) return null;
  const lleva = Math.max(0, Math.ceil(transcurridoMs / 60_000) - graceMinutes);
  return fijos.find((p) => minutosDe(p) >= lleva) ?? fijos.at(-1)!;
}
