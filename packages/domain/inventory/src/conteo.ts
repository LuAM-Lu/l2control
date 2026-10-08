/**
 * El informe de diferencias de un conteo — B9-10 (M-29). Puro: de cada producto contado, lo que decía el sistema, lo
 * que se contó y lo que eso movió al costo, sumado por categoría y en total. Lo que falta es negativo (salió) y lo que
 * sobra, positivo (entró); un producto que cuadró cuenta como contado, sin diferencia.
 */

/** Un producto contado: su categoría, cuánto movió el conteo (contado − sistema) y su valor al costo, con signo. */
export type LineaContada = Readonly<{ categoria: string; diferencia: number; valorMinor: bigint }>;

export type TotalesDeConteo = Readonly<{
  contados: number;
  cuadran: number;
  /** Unidades que faltaron (en positivo) y su valor al costo (en positivo). */
  faltan: number;
  faltanMinor: bigint;
  /** Unidades que sobraron y su valor al costo. */
  sobran: number;
  sobranMinor: bigint;
  /** Lo que movió el conteo al costo: sobrantes menos faltantes. */
  netoMinor: bigint;
}>;

const vacio = (): { -readonly [K in keyof TotalesDeConteo]: TotalesDeConteo[K] } => ({
  contados: 0,
  cuadran: 0,
  faltan: 0,
  faltanMinor: 0n,
  sobran: 0,
  sobranMinor: 0n,
  netoMinor: 0n,
});

function sumar(t: ReturnType<typeof vacio>, l: LineaContada): void {
  t.contados += 1;
  if (l.diferencia === 0) t.cuadran += 1;
  else if (l.diferencia < 0) {
    t.faltan -= l.diferencia;
    t.faltanMinor -= l.valorMinor;
  } else {
    t.sobran += l.diferencia;
    t.sobranMinor += l.valorMinor;
  }
  t.netoMinor += l.valorMinor;
}

/** Los totales del conteo y los de cada categoría, en el orden en que aparecen. */
export function diferenciasDeConteo(lineas: readonly LineaContada[]): Readonly<{
  total: TotalesDeConteo;
  porCategoria: readonly (TotalesDeConteo & Readonly<{ categoria: string }>)[];
}> {
  const total = vacio();
  const porCategoria = new Map<string, ReturnType<typeof vacio>>();
  for (const l of lineas) {
    sumar(total, l);
    const c = porCategoria.get(l.categoria) ?? vacio();
    sumar(c, l);
    porCategoria.set(l.categoria, c);
  }
  return { total, porCategoria: [...porCategoria.entries()].map(([categoria, t]) => ({ categoria, ...t })) };
}
