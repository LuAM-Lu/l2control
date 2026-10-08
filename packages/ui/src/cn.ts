import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Los escalones de la escala de texto (T-16), los mismos `--text-*` de `packages/config/tokens.css`. tailwind-merge
 * solo conoce los tamaños de Tailwind: sin decírselo, toma `text-detalle` por un color y lo descarta al lado de
 * `text-ink-2` (el tamaño desaparecía sin aviso). `cn.test.ts` comprueba que esta lista y los tokens coinciden.
 */
export const ESCALA_DE_TEXTO = ["pagina", "seccion", "tarjeta", "subtitulo", "cuerpo", "detalle", "nota", "etiqueta", "cifra"] as const;

const twMerge = extendTailwindMerge({ extend: { theme: { text: [...ESCALA_DE_TEXTO] } } });

/** Combina clases resolviendo conflictos de Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
