/**
 * Servido por plato — B6-11 (M-34, S-9; cambia en parte ADR-030).
 *
 * El mesero marca cada plato de un pedido cuando llega a la mesa (o «Servir todo» lo que falte), y lo puede deshacer en el
 * momento. Las marcas se agregan, nunca se corrigen: lo que vale de cada plato es la última. El pedido está servido
 * cuando lo está su último plato. Lo marcado por pedido antes de este paso (B6-8) cuenta como todo servido a esa hora.
 *
 * Puro: el instante entra como argumento (ADR-010).
 */

/** Hasta cuándo se deshace una marca de servido: «en el momento», no al otro día. */
export const DESHACER_SERVIDO_MS = 5 * 60_000;

/** Servido, cuándo y quién. `sinHora` (B6-13): marcado al pedir la cuenta; no se sabe cuándo llegó a la mesa. */
export type Servido = Readonly<{ en: number; por: string; sinHora?: boolean | undefined }>;

/** Una marca de un plato: su posición en el pedido, servido o deshecho, cuándo y quién. */
export type MarcaDePlato = Readonly<{ linea: number; tipo: "SERVIDO" | "DESHECHO"; en: number; por: string; sinHora?: boolean | undefined }>;

/**
 * Lo servido de cada plato de un pedido de `lineas` platos: la última marca de cada uno, sobre lo marcado por pedido
 * antes de B6-11 (`pedidoEntero`, todo servido a esa hora). Las marcas, en el orden en que se hicieron.
 */
export function servidoPorPlato(lineas: number, marcas: readonly MarcaDePlato[], pedidoEntero: Servido | null): (Servido | null)[] {
  const estado: (Servido | null)[] = Array.from({ length: lineas }, () => pedidoEntero);
  for (const m of [...marcas].sort((a, b) => a.en - b.en)) {
    if (m.linea < 0 || m.linea >= lineas) continue;
    estado[m.linea] = m.tipo === "SERVIDO" ? { en: m.en, por: m.por, ...(m.sinHora ? { sinHora: true } : {}) } : null;
  }
  return estado;
}

/** El pedido entero: servido cuando lo está su último plato, a la hora de ese. Si falta alguno, `null`. */
export function servidoDelPedido(platos: readonly (Servido | null)[]): Servido | null {
  if (platos.length === 0 || platos.some((p) => p === null)) return null;
  return (platos as Servido[]).reduce((ultimo, p) => (p.en > ultimo.en ? p : ultimo));
}

/** Por qué no se deshace un plato: no está servido, o se marcó hace más de lo que se deshace en el momento. */
export function problemaParaDeshacer(plato: Servido | null, ahora: number): "NO_SERVIDO" | "YA_NO" | null {
  if (!plato) return "NO_SERVIDO";
  return ahora - plato.en > DESHACER_SERVIDO_MS ? "YA_NO" : null;
}
