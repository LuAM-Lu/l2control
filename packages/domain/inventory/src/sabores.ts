/**
 * Duplicar con otros sabores — B9-8 (M-28). Puro: de una lista tecleada («Naranja, Manzana y Pera») salen los sabores, sin
 * repetir, y de «Jugo» más cada sabor, los nombres de los productos nuevos («Jugo Naranja», «Jugo Manzana», «Jugo Pera»).
 */
import { nameKey } from "./catalogo.ts";

/** Los sabores de una lista: separados por coma, punto y coma, salto de línea o « y »; sin vacíos ni repetidos. */
export function saboresDe(texto: string): string[] {
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const crudo of texto.split(/[,;\n]|\s+y\s+/i)) {
    const s = crudo.replace(/\s+/g, " ").trim();
    if (s === "" || vistos.has(nameKey(s))) continue;
    vistos.add(nameKey(s));
    r.push(s);
  }
  return r;
}

/** Los nombres de las copias: la base y cada sabor, separados por un espacio. */
export function nombresConSabores(base: string, texto: string): string[] {
  const b = base.replace(/\s+/g, " ").trim();
  return saboresDe(texto).map((s) => (b === "" ? s : `${b} ${s}`));
}
