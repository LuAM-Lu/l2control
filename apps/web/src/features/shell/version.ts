/**
 * La versión del sistema (M-10), incrustada al compilar desde el package.json raíz
 * (`next.config.ts`). El número del medio cuenta los pasos de la ruta ya entregados.
 *
 * Fuera de Next (una prueba, un script) no hay nada incrustado: se dice «sin versión» en vez de
 * inventar un número.
 */
export type VersionDelSistema = Readonly<{
  /** «0.14.0», sin la «v». Vacío si no se compiló con Next. */
  numero: string;
  /** «Etapa 2 · Dinero». */
  etapa: string;
  /** Pasos de la ruta entregados (el MINOR) y los que tiene la ruta. */
  entregados: number | null;
  pasos: number | null;
}>;

function leer(): VersionDelSistema {
  // Next reemplaza cada `process.env.L2_…` por su valor al compilar; por eso se leen uno a uno.
  const numero = process.env.L2_VERSION ?? "";
  const etapa = process.env.L2_ETAPA ?? "";
  const pasos = Number.parseInt(process.env.L2_PASOS ?? "", 10);
  const menor = Number.parseInt(numero.split(".")[1] ?? "", 10);
  return {
    numero,
    etapa,
    entregados: Number.isInteger(menor) ? menor : null,
    pasos: Number.isInteger(pasos) ? pasos : null,
  };
}

export const VERSION: VersionDelSistema = leer();

/** «v0.14.0 · Etapa 2 · Dinero», o «Sin versión» si no hay número. */
export function rotuloDeVersion(v: VersionDelSistema = VERSION): string {
  if (!v.numero) return "Sin versión";
  return v.etapa ? `v${v.numero} · ${v.etapa}` : `v${v.numero}`;
}
