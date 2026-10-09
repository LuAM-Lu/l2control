/**
 * La comanda de cocina y la de barra — B6-10 (M-34).
 *
 * Cada plato de un pedido dice en qué área se prepara (la de su producto al pedirlo, guardada en el pedido): un papel por
 * área con algo que preparar, cada uno en la impresora de su área. Lo que se sirve sin papel no sale. Un pedido de antes
 * de este paso es un solo papel con todo, en la de cocina. Lo usan el pedido (enviar, reimprimir, leer) y su anulación.
 */
import { areaDe, type AreaDeComanda, type AreaDeProducto } from "@l2/domain-orders";
import type { ProductKind } from "@l2/domain-inventory";
import type { Transaccion } from "@l2/database";
import { impresoraDe, type Oficio } from "../impresion/impresion.ts";

/** Un plato del pedido como se guardó: con su área desde B6-10. */
export type LineaGuardada = Readonly<{ productId: string; nombre: string; cantidad: number; nota: string | null; area?: AreaDeProducto }>;

/** Cómo se rotula cada papel. */
export const NOMBRE_DE_AREA: Record<AreaDeComanda, string> = { COCINA: "Cocina", BARRA: "Barra" };

/** La impresora de cada área: la de cocina es la de comandas de siempre. Un papel de antes (sin área), en la de cocina. */
export const oficioDe = (area: AreaDeComanda | null): Oficio => (area === "BARRA" ? "barra" : "comandas");

/** El área de cada producto, ahora: la elegida o la de su tipo. */
export async function areasDeProductos(tx: Transaccion, ids: readonly string[]): Promise<Map<string, AreaDeProducto>> {
  const filas = await tx.product.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, kind: true, prepArea: true } });
  return new Map(filas.map((p) => [p.id, areaDe(p.kind as ProductKind, p.prepArea as AreaDeProducto | null)]));
}

/**
 * La primera de estas áreas sin impresora encendida, con su mensaje; `null` si todas tienen. Sin papel la cocina (o la
 * barra) no se entera: no se envía ni se anula a ciegas (fail-closed, ADR-022).
 */
export async function areaSinImpresora(tx: Transaccion, branchId: string, areas: readonly (AreaDeComanda | null)[]): Promise<AreaDeComanda | "COMANDAS" | null> {
  for (const a of areas) if (!(await impresoraDe(tx, branchId, oficioDe(a)))) return a ?? "COMANDAS";
  return null;
}

/** «No hay impresora de comandas de barra encendida», para decirlo con lo que no pasó. */
export const sinImpresoraPara = (area: AreaDeComanda | "COMANDAS", queNoPaso: string) =>
  `No hay impresora de comandas${area === "COCINA" ? " de cocina" : area === "BARRA" ? " de barra" : ""} encendida: ${queNoPaso}. Configúrala en Ajustes → Impresoras.`;

/**
 * El área en que salió cada plato de un pedido, por su producto. En un pedido de antes (sin áreas), `null`: su anulación
 * va, como su comanda, en un solo papel a la de cocina.
 */
export function areaEnElPedido(lineas: readonly LineaGuardada[], productId: string | undefined): AreaDeProducto | null {
  if (lineas.some((l) => l.area === undefined)) return null;
  return lineas.find((l) => l.productId === productId)?.area ?? null;
}
