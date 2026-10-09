/**
 * Las existencias en el servidor — B9-2, F8-05, I-10, ADR-023.
 *
 * La existencia es la suma de `stock_movement`. Sale cuando una línea de un producto entra en una
 * cuenta y vuelve cuando se quita sin pagar, en la MISMA transacción que guarda la versión de la
 * cuenta. Quién decide qué:
 *  · el dominio (`@l2/domain-inventory`): qué movimientos causa el cambio (`stockMovesOf`) y si hay
 *    con qué cubrirlos (`stockShortfalls`);
 *  · este archivo: el candado de cada producto (dos ventas a la vez no venden la última unidad dos
 *    veces), la suma, el valor al costo de cada movimiento (B9-3: la venta al costo promedio, la
 *    devolución con lo que su cuenta sacó) y los movimientos con su clave (cuenta, versión, producto);
 *  · la base: un movimiento no se edita ni se borra y ninguno deja la existencia por debajo de cero.
 *
 * Se hace en dos tiempos porque el movimiento cita la versión de la cuenta: primero se comprueba (y
 * se toman los candados) antes de escribir nada, y después de guardar la versión se asienta.
 */
import type { Rechazo } from "@l2/contracts";
import { costOfReturn, costOfUnits, stockMovesOf, stockShortfalls, type StockLine, type StockMove, type StockValue } from "@l2/domain-inventory";
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";

/** Lo que un cambio de cuenta va a mover, ya comprobado, valorado al costo y con sus candados tomados. */
export type MovimientosListos = readonly (StockMove & Readonly<{ valueMinor: bigint }>)[];

/**
 * Las unidades y el valor al costo de cada producto en la sucursal (la suma de sus movimientos). Sin
 * `productIds`, los de todos los que tienen alguno; un producto sin movimientos no sale (tiene cero).
 */
export async function existenciasDe(tx: Transaccion, branchId: string, productIds?: readonly string[]): Promise<Map<string, StockValue>> {
  const filas = await tx.stockMovement.groupBy({
    by: ["productId"],
    where: { branchId, ...(productIds ? { productId: { in: [...productIds] } } : {}) },
    _sum: { quantity: true, valueMinor: true },
  });
  return new Map(filas.map((f) => [f.productId, { quantity: f._sum.quantity ?? 0, valueMinor: f._sum.valueMinor ?? 0n }]));
}

/**
 * Cuándo arrancó la existencia de cada producto en la sucursal (B9-7): su fila de arranque o, si no la
 * tiene (lo cargado antes de B9-7, o con la versión anterior durante una vuelta atrás), su primer
 * movimiento; lo que llegue antes. Un producto que se cuenta y no sale aquí está «Sin inventario
 * inicial». Sin `productIds`, de todos.
 */
export async function arranquesDe(tx: Transaccion, branchId: string, productIds?: readonly string[]): Promise<Map<string, Date>> {
  const where = { branchId, ...(productIds ? { productId: { in: [...productIds] } } : {}) };
  // Lo de una entrada anulada no arranca nada (B9-12): un inventario inicial anulado vuelve a «Sin inventario inicial».
  const anuladas = (await tx.stockEntryVoid.findMany({ where: { branchId }, select: { entryId: true } })).map((a) => a.entryId);
  const sinAnuladas = anuladas.length > 0 ? { OR: [{ entryId: null }, { entryId: { notIn: anuladas } }] } : {};
  const primeros = await tx.stockMovement.groupBy({ by: ["productId"], where: { ...where, kind: { not: "ANULACION" }, ...sinAnuladas }, _min: { at: true } });
  const filas = await tx.stockStart.findMany({ where: { ...where, ...sinAnuladas }, select: { productId: true, startedAt: true } });
  const arranque = new Map<string, Date>();
  for (const f of primeros) if (f._min.at) arranque.set(f.productId, f._min.at);
  for (const f of filas) {
    const otro = arranque.get(f.productId);
    if (!otro || f.startedAt < otro) arranque.set(f.productId, f.startedAt);
  }
  return arranque;
}

/** Lo que arranca la existencia de un producto: lo que entró o lo que se contó (también cero). */
export type Arranque = Readonly<{ productId: string; quantity: number }>;

/**
 * Deja el arranque de los productos que todavía no lo tienen en la sucursal (B9-7), citando la entrada o
 * el conteo que los arranca. Se llama en su transacción, con los candados de los productos ya tomados y
 * ANTES de asentar sus movimientos: lo que ya tenía existencia no vuelve a arrancar.
 */
export async function asentarArranques(
  tx: Transaccion,
  ctx: Contexto,
  arranques: readonly Arranque[],
  causa: Readonly<{ entryId: string; adjustmentId?: undefined } | { adjustmentId: string; entryId?: undefined }> & Readonly<{ ahora: number; quien: string }>,
): Promise<void> {
  if (arranques.length === 0) return;
  const ya = await arranquesDe(tx, ctx.branchId, arranques.map((a) => a.productId));
  const nuevos = arranques.filter((a) => !ya.has(a.productId));
  if (nuevos.length === 0) return;
  await tx.stockStart.createMany({
    data: nuevos.map((a) => ({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId: a.productId,
      quantity: a.quantity,
      startedAt: new Date(causa.ahora),
      entryId: causa.entryId ?? null,
      adjustmentId: causa.adjustmentId ?? null,
      createdBy: ctx.quien?.userId ?? null,
      createdByName: causa.quien,
      deviceId: ctx.quien?.deviceId ?? null,
    })),
  });
}

/** El candado de la existencia de un producto: quien vende, devuelve o recibe lo toma antes de sumar. */
export async function bloquearProducto(tx: Transaccion, branchId: string, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`existencia:${branchId}:${productId}`}, 0))::text AS candado`;
}

/**
 * Comprueba que hay con qué cubrir lo que el cambio saca, tomando antes el candado de cada producto
 * que mueve (en orden, para no cruzarse con otra venta). Devuelve los movimientos que hay que asentar
 * tras guardar la versión, o el rechazo si algo no alcanza (ADR-023 §3: sin excepción con
 * autorización; se carga la entrada que falta o se corrige con un conteo).
 *
 * `rutaDe` dice qué línea señalar en el rechazo para un producto.
 */
export async function comprobarExistencias(
  tx: Transaccion,
  ctx: Contexto,
  /** La cuenta que cambia; `null` si es nueva (no ha sacado nada). */
  accountId: string | null,
  antes: readonly StockLine[] | null,
  despues: readonly StockLine[],
  rutaDe: (productId: string) => (string | number)[],
): Promise<MovimientosListos | Rechazo> {
  const tocados = [...new Set([...(antes ?? []), ...despues].map((l) => l.productId).filter((id): id is string => id !== undefined))];
  if (tocados.length === 0) return [];
  const productos = await tx.product.findMany({ where: { id: { in: tocados } }, select: { id: true, name: true, tracksStock: true } });
  const conExistencia = new Set(productos.filter((p) => p.tracksStock).map((p) => p.id));
  // Lo que esta cuenta tiene sacado según sus movimientos (unidades y su valor): no devuelve más.
  const sacado = new Map<string, StockValue>();
  if (accountId && antes) {
    const filas = await tx.stockMovement.groupBy({ by: ["productId"], where: { accountId }, _sum: { quantity: true, valueMinor: true } });
    for (const f of filas) sacado.set(f.productId, { quantity: -(f._sum.quantity ?? 0), valueMinor: -(f._sum.valueMinor ?? 0n) });
  }
  const moves = stockMovesOf(antes, despues, (id) => conExistencia.has(id), new Map([...sacado].map(([id, v]) => [id, v.quantity])));
  if (moves.length === 0) return [];

  // Un candado por producto que mueve, en el orden de `stockMovesOf`: la suma y el costo que se leen
  // después son los que valen al asentar. Uno a uno: en una transacción nunca dos consultas a la vez.
  for (const m of moves) await bloquearProducto(tx, ctx.branchId, m.productId);
  const hay = await existenciasDe(tx, ctx.branchId, moves.map((m) => m.productId));
  const faltan = stockShortfalls(moves, new Map([...hay].map(([id, v]) => [id, v.quantity])));
  if (faltan.length === 0) {
    // Al costo (B9-3): la venta se lleva su parte del valor; la devolución, lo que esta cuenta sacó.
    return moves.map((m) => ({
      ...m,
      valueMinor:
        m.quantity < 0
          ? -costOfUnits(hay.get(m.productId) ?? { quantity: 0, valueMinor: 0n }, -m.quantity)
          : costOfReturn(sacado.get(m.productId) ?? { quantity: 0, valueMinor: 0n }, m.quantity),
    }));
  }

  const nombre = new Map(productos.map((p) => [p.id, p.name]));
  // Lo que nunca se contó (B9-7) no está agotado: le falta su inventario inicial, y eso es lo que se dice.
  const arrancados = await arranquesDe(tx, ctx.branchId, faltan.map((f) => f.productId));
  const sinInicial = faltan.filter((f) => !arrancados.has(f.productId));
  const primero = faltan[0]!;
  const quedan = (n: number) => (n === 0 ? "no queda ninguno" : n === 1 ? "queda 1" : `quedan ${n}`);
  if (sinInicial.length === faltan.length) {
    const nombres = sinInicial.map((f) => `«${nombre.get(f.productId) ?? "ese producto"}»`).join(", ");
    return {
      ok: false,
      motivo: "INVALIDO",
      mensaje: `${nombres} ${sinInicial.length === 1 ? "todavía no tiene" : "todavía no tienen"} inventario inicial: se vende cuando se cuente (Inventario → Entradas → Inventario inicial).`,
      problemas: sinInicial.map((f) => ({ path: rutaDe(f.productId), message: "SIN_INVENTARIO_INICIAL" })),
    };
  }
  return {
    ok: false,
    motivo: "INVALIDO",
    mensaje:
      faltan.length === 1
        ? `Sin existencia de ${nombre.get(primero.productId) ?? "ese producto"}: ${quedan(primero.available)}. Hay que cargar la entrada de mercancía.`
        : `Sin existencia de ${faltan.map((f) => nombre.get(f.productId) ?? "un producto").join(", ")}. Hay que cargar la entrada de mercancía.`,
    problemas: faltan.map((f) => ({ path: rutaDe(f.productId), message: arrancados.has(f.productId) ? `SIN_EXISTENCIA: ${quedan(f.available)}` : "SIN_INVENTARIO_INICIAL" })),
  };
}

/**
 * Asienta los movimientos comprobados, citando la versión de la cuenta que los causa. Se llama en la
 * misma transacción, después de guardar esa versión (el movimiento la cita con su FK).
 */
export async function asentarExistencias(
  tx: Transaccion,
  ctx: Contexto,
  moves: MovimientosListos,
  causa: Readonly<{ accountId: string; version: number; ahora: number; quien: string }>,
): Promise<void> {
  if (moves.length === 0) return;
  // I-10: el movimiento es el registro; el asiento dice quién lo causó y cuenta el cambio en vivo.
  await auditar(tx, ctx, {
    action: "existencia.mover",
    entityType: "account",
    entityId: causa.accountId,
    after: {
      version: causa.version,
      movimientos: moves.map((m) => ({ productId: m.productId, cantidad: m.quantity, valor: { minor: String(m.valueMinor), currency: "USD" } })),
    },
  });
  await tx.stockMovement.createMany({
    data: moves.map((m) => ({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      productId: m.productId,
      quantity: m.quantity,
      kind: m.quantity < 0 ? "VENTA" : "DEVOLUCION",
      valueMinor: m.valueMinor,
      accountId: causa.accountId,
      accountVersion: causa.version,
      at: new Date(causa.ahora),
      createdBy: ctx.quien?.userId ?? null,
      createdByName: causa.quien,
      deviceId: ctx.quien?.deviceId ?? null,
    })),
  });
}
