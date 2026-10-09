/**
 * El pedido del mesero y su comanda impresa — B6-2, ADR-022, F6-06, F6-09.
 *
 * La cocina trabaja con la comanda en papel: el sistema sabe lo que se pidió y lo que suma en la cuenta,
 * no «en fuego», «listo» ni «entregado» (ADR-022 retira esa máquina de estados). Aquí viven dos reglas:
 *
 *  1. **Qué entra en la cuenta** por un pedido (`lineasDelPedido`): cada plato del catálogo que se vende
 *     ahora, con su nombre, su precio y su IVA de este instante, una línea por unidad. Lo que la tablet
 *     vio viaja para comprobarlo: si el precio cambió entre medias, no se pide algo distinto de lo que se
 *     le leyó a la mesa.
 *  2. **En qué quedó la comanda** (`estadoDeComanda`) a partir de sus trabajos de impresión: impresa si
 *     alguno salió, y si no, lo que diga el último (en cola, no salió o descartada).
 *
 * Puro: sin reloj ni E/S. El catálogo y los trabajos entran como argumento.
 */

/** Lo que pide la tablet de un plato: cuántos, la nota para la cocina y el precio que enseñó. */
export type LineaPedida = Readonly<{ productId: string; cantidad: number; nota?: string | undefined; precioMinor: bigint }>;

/** Un plato del catálogo en este instante: su nombre, su precio y su trato del IVA. */
export type PlatoAhora<T extends string = string> = Readonly<{ name: string; amountMinor: bigint; taxCode: T }>;

/** Una unidad pedida, como entra en la cuenta. */
export type UnidadPedida<T extends string = string> = Readonly<{ productId: string; concepto: string; amountMinor: bigint; taxCode: T }>;

export type ProblemaDePedido =
  | Readonly<{ problema: "PEDIDO_VACIO" }>
  | Readonly<{ problema: "NO_SE_VENDE"; indice: number }>
  | Readonly<{ problema: "PRECIO_DISTINTO"; indice: number; nombre: string; ahoraMinor: bigint }>;

/** Más de esto en un solo pedido es un error de dedo, no una mesa con hambre. */
export const MAX_UNIDADES_POR_PEDIDO = 200;

/**
 * Las unidades que un pedido añade a la cuenta, o el primer problema. `platoEn` dice qué vende el
 * catálogo ahora (`null` si ese producto no se vende).
 */
export function lineasDelPedido<T extends string>(
  lineas: readonly LineaPedida[],
  platoEn: (productId: string) => PlatoAhora<T> | null,
): Readonly<{ ok: true; unidades: UnidadPedida<T>[] }> | Readonly<{ ok: false } & ProblemaDePedido> {
  if (lineas.length === 0) return { ok: false, problema: "PEDIDO_VACIO" };
  const unidades: UnidadPedida<T>[] = [];
  for (const [indice, l] of lineas.entries()) {
    const plato = platoEn(l.productId);
    if (!plato) return { ok: false, problema: "NO_SE_VENDE", indice };
    if (plato.amountMinor !== l.precioMinor) return { ok: false, problema: "PRECIO_DISTINTO", indice, nombre: plato.name, ahoraMinor: plato.amountMinor };
    for (let i = 0; i < l.cantidad; i += 1) {
      unidades.push({ productId: l.productId, concepto: plato.name, amountMinor: plato.amountMinor, taxCode: plato.taxCode });
    }
  }
  return { ok: true, unidades };
}

/** El estado de un trabajo de impresión (ADR-015, ADR-026). */
export type EstadoDeTrabajo = "PENDIENTE" | "ENVIADO" | "CONFIRMADO" | "FALLIDO" | "DESCARTADO";

/**
 * Lo que importa de una comanda (ADR-022 §2): **enviada** (el pedido existe y suma) y si salió en papel.
 * `EN_COLA` espera o se está imprimiendo; `NO_SALIO` hay que mirarlo (reimprimir); `DESCARTADA` alguien
 * decidió que no hace falta.
 */
export type EstadoDeComanda = "EN_COLA" | "IMPRESA" | "NO_SALIO" | "DESCARTADA";

/**
 * En qué quedó la comanda de un pedido, por sus trabajos (el original y sus reimpresiones). Si uno
 * salió, está impresa; si no, manda el último que se pidió.
 */
export function estadoDeComanda(trabajos: readonly Readonly<{ estado: EstadoDeTrabajo; creadoEn: number }>[]): EstadoDeComanda {
  if (trabajos.some((t) => t.estado === "CONFIRMADO")) return "IMPRESA";
  const ultimo = [...trabajos].sort((a, b) => b.creadoEn - a.creadoEn)[0];
  if (!ultimo) return "NO_SALIO";
  if (ultimo.estado === "FALLIDO") return "NO_SALIO";
  if (ultimo.estado === "DESCARTADO") return "DESCARTADA";
  return "EN_COLA";
}

/** ¿Hay que avisar de esta comanda? Lo que no salió, sí: ningún pedido se queda sin papel sin que alguien lo vea. */
export const comandaPideAtencion = (e: EstadoDeComanda): boolean => e === "NO_SALIO";

/* ──────────────────────────────── la comanda de cocina y la de barra (B6-10, M-34) */

/** Dónde se prepara un producto y en qué papel sale. `SIN_PAPEL`: se sirve sin comanda (un servicio, algo de mostrador). */
export type AreaDeProducto = "COCINA" | "BARRA" | "SIN_PAPEL";
/** Las áreas que tienen papel, en el orden en que salen. */
export type AreaDeComanda = "COCINA" | "BARRA";
export const AREAS_DE_COMANDA: readonly AreaDeComanda[] = ["COCINA", "BARRA"];

/** El área de un producto: la elegida o, sin elegir, la de su tipo (lo preparado, cocina; lo de nevera, barra; un servicio, sin papel). */
export function areaDe(tipo: "PRODUCTO" | "PREPARADO" | "SERVICIO", elegida: AreaDeProducto | null | undefined): AreaDeProducto {
  if (elegida) return elegida;
  return tipo === "PREPARADO" ? "COCINA" : tipo === "PRODUCTO" ? "BARRA" : "SIN_PAPEL";
}

/**
 * Los papeles de un pedido: uno por área con algo que preparar, cocina primero. Un pedido de antes de B6-10 (sus
 * líneas no dicen área) es un solo papel con todo, sin área (`null`). Uno de solo cosas sin papel no tiene ninguno.
 */
export function partesDelPedido<L extends Readonly<{ area?: AreaDeProducto | null | undefined }>>(
  lineas: readonly L[],
): Readonly<{ area: AreaDeComanda | null; lineas: L[] }>[] {
  if (lineas.some((l) => l.area === undefined || l.area === null)) return [{ area: null, lineas: [...lineas] }];
  return AREAS_DE_COMANDA.map((area) => ({ area, lineas: lineas.filter((l) => l.area === area) })).filter((p) => p.lineas.length > 0);
}

/** En qué quedó un pedido entero: lo que pide más atención de sus papeles. Sin ninguno, `SIN_PAPEL`. */
export function estadoDelPedido(estados: readonly EstadoDeComanda[]): EstadoDeComanda | "SIN_PAPEL" {
  if (estados.length === 0) return "SIN_PAPEL";
  for (const e of ["NO_SALIO", "EN_COLA", "DESCARTADA"] as const) if (estados.includes(e)) return e;
  return "IMPRESA";
}
