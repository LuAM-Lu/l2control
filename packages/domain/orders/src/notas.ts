/**
 * Notas rápidas del mesero — B6-12 (M-34, S-11).
 *
 * Al poner una nota a un plato, la tablet ofrece las más escritas para ese producto (y, si tiene pocas, las de su
 * categoría). Las aprende sola de los pedidos: nadie las configura. Dos notas son la misma sin mayúsculas ni espacios de
 * más; se enseña la forma en que más se escribió.
 *
 * Puro: las notas entran como argumento, ya filtradas por producto, categoría y periodo.
 */

/** Cuántas se ofrecen. */
export const NOTAS_SUGERIDAS = 5;

/** Cómo se escribe una nota limpia: sin espacios de más. */
export const notaLimpia = (texto: string): string => texto.trim().replace(/\s+/g, " ");

/** Lo que hace iguales a dos notas: sin mayúsculas ni espacios de más. */
export const claveDeNota = (texto: string): string => notaLimpia(texto).toLocaleLowerCase("es");

/** Las notas, de la más escrita a la menos, cada una en su forma más escrita. Empate: la que apareció antes. */
function porFrecuencia(notas: readonly string[]): string[] {
  const grupos = new Map<string, { n: number; orden: number; formas: Map<string, number> }>();
  notas.forEach((texto, i) => {
    const limpia = notaLimpia(texto);
    if (!limpia) return;
    const clave = claveDeNota(limpia);
    const g = grupos.get(clave) ?? { n: 0, orden: i, formas: new Map() };
    g.n += 1;
    g.formas.set(limpia, (g.formas.get(limpia) ?? 0) + 1);
    grupos.set(clave, g);
  });
  return [...grupos.values()]
    .sort((a, b) => b.n - a.n || a.orden - b.orden)
    .map((g) => [...g.formas].sort((a, b) => b[1] - a[1])[0]![0]);
}

/**
 * Las notas que se ofrecen para un plato: las más escritas para él y, si no llegan a `max`, las más escritas en su
 * categoría que no repitan ninguna.
 */
export function notasSugeridas(delProducto: readonly string[], deLaCategoria: readonly string[], max = NOTAS_SUGERIDAS): string[] {
  const propias = porFrecuencia(delProducto).slice(0, max);
  if (propias.length >= max) return propias;
  const ya = new Set(propias.map(claveDeNota));
  const otras = porFrecuencia(deLaCategoria).filter((n) => !ya.has(claveDeNota(n)));
  return [...propias, ...otras].slice(0, max);
}

/** Añadir una nota rápida a lo escrito: lo escrito se queda, y una que ya está no se repite. Hasta `max` caracteres. */
export function conNotaRapida(escrito: string, rapida: string, max = 80): string {
  const actual = notaLimpia(escrito);
  if (claveDeNota(actual).split(/,\s*/).includes(claveDeNota(rapida))) return actual;
  return (actual ? `${actual}, ${notaLimpia(rapida)}` : notaLimpia(rapida)).slice(0, max);
}
