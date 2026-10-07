/**
 * La lista de categorías del local vista desde un producto (T-10, M-24): cuáles hay, cómo se llama una
 * en la lista y asegurar que esté. Lo usan el alta y la edición de un producto, la entrada de mercancía y
 * la semilla; los cambios de la lista (crear, renombrar, unir, retirar) están en `categorias.ts`.
 */
import type { CategoriaDto } from "@l2/contracts";
import { cleanCategory, findCategory, nameKey } from "@l2/domain-inventory";
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";

/** Las categorías vigentes del local, con cuántos productos llevan cada una (activos o apartados). */
export async function categoriasDe(tx: Transaccion): Promise<CategoriaDto[]> {
  const filas = await tx.productCategory.findMany({ where: { retiredAt: null }, orderBy: { name: "asc" } });
  const productos = await tx.product.findMany({ select: { category: true } });
  const cuenta = new Map<string, number>();
  for (const p of productos) cuenta.set(nameKey(p.category), (cuenta.get(nameKey(p.category)) ?? 0) + 1);
  return filas
    .map((f) => ({ id: f.id, nombre: f.name, productos: cuenta.get(nameKey(f.name)) ?? 0 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * La categoría de la lista que es `nombre` (sin contar mayúsculas, acentos ni espacios): su nombre
 * como está en la lista. Si no existe, la crea y deja su asiento: dar de alta un producto con una
 * categoría nueva (en Productos, en una entrada o al pegar una lista) la añade a la lista.
 */
export async function asegurarCategoria(tx: Transaccion, ctx: Contexto, nombre: string, quien: string, ahora: number): Promise<string> {
  const limpio = cleanCategory(nombre);
  const vigentes = await tx.productCategory.findMany({ where: { retiredAt: null }, select: { name: true } });
  const ya = findCategory(vigentes, limpio);
  if (ya) return ya.name;
  const fila = await tx.productCategory.create({ data: { tenantId: ctx.tenantId, name: limpio, createdAt: new Date(ahora), createdByName: quien } });
  await auditar(tx, ctx, { action: "categoria.crear", entityType: "product_category", entityId: fila.id, after: { nombre: fila.name } });
  return fila.name;
}

/** Cómo se llama `nombre` en la lista (si ya está, sin contar mayúsculas ni acentos), sin crear nada. */
export async function categoriaComoEnLista(tx: Transaccion, nombre: string): Promise<string> {
  const limpio = cleanCategory(nombre);
  const vigentes = await tx.productCategory.findMany({ where: { retiredAt: null }, select: { name: true } });
  return findCategory(vigentes, limpio)?.name ?? limpio;
}
