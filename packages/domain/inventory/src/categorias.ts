/**
 * Las categorías del catálogo como lista propia (T-10, M-24).
 *
 * Antes una categoría existía porque algún producto la llevaba escrita: un local nuevo no tenía
 * ninguna y un error al teclear creaba otra («Bebida» y «Bebidas»). Ahora el local tiene su lista, que
 * nace con unas de arranque, y un nombre que solo cambia en mayúsculas, acentos o espacios es la misma
 * categoría (`nameKey`, como los productos).
 */
import { nameKey } from "./catalogo.ts";

/**
 * Con las que nace un local (y las que la migración de T-10 añadió a los que ya existían): lo que vende
 * un parque con restaurante. Se renombran, se unen o se retiran como cualquier otra.
 */
export const STARTER_CATEGORIES: readonly string[] = [
  "Bebidas",
  "Snacks",
  "Golosinas",
  "Helados",
  "Postres",
  "Juguetes",
  "Entradas",
  "Platos",
  "Hamburguesas",
  "Servicios",
];

export const CATEGORY_MIN_LENGTH = 2;
export const CATEGORY_MAX_LENGTH = 24;

/** El nombre como se guarda: sin espacios en los bordes ni repetidos. */
export function cleanCategory(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export type CategoryProblem = "CORTA" | "LARGA";

/** Qué tiene mal el nombre de una categoría, o `null`. */
export function categoryProblem(name: string): CategoryProblem | null {
  const limpio = cleanCategory(name);
  if (limpio.length < CATEGORY_MIN_LENGTH) return "CORTA";
  if (limpio.length > CATEGORY_MAX_LENGTH) return "LARGA";
  return null;
}

/**
 * La categoría de la lista que es `name` (sin contar mayúsculas, acentos ni espacios), o `undefined`.
 * Escribir «bebidas» en un producto lo deja en «Bebidas» si ya existe.
 */
export function findCategory<C extends Readonly<{ name: string }>>(categories: readonly C[], name: string): C | undefined {
  const clave = nameKey(name);
  return categories.find((c) => nameKey(c.name) === clave);
}
