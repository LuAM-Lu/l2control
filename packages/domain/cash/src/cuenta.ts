/**
 * La cuenta que cobra la caja — DEC-21, §9.10.9, B3-3.
 *
 * Tres clases de cuenta, y cada una dice de quién es: la de una **familia** (sus niños), la de una
 * **mesa** del salón y la de una venta de **mostrador** (ni niños ni mesa: consumo del catálogo).
 *
 * Aquí viven las reglas que comparten la pantalla y el servidor:
 *
 *  · qué se cobra ahora (`chargeableLines`, `documentLinesOf`) y cómo queda la cuenta al cobrar una
 *    parte o al anular el cobro (`markPartPaid`, `revertPaid`);
 *  · **qué cambio acepta el servidor** de una pantalla (`accountChangeProblem`). La pantalla arma
 *    la cuenta nueva con sus transiciones; el servidor la compara con la que tiene y rechaza lo que
 *    solo él puede hacer. La regla que lo ordena: **una línea pagada no se toca, y marcar pagado
 *    es del cobro**, nunca de un «guardar».
 *
 * Los tipos son estructurales: la forma del contrato (`FamilyAccountSchema`) encaja sin que el
 * dominio lo importe. Validarla contra el contrato es de quien llama.
 */
import { money, type CurrencyCode } from "@l2/domain-money";
import type { DocumentLine, TaxCode } from "@l2/domain-tax";

export type AccountKind = "FAMILIA" | "MESA" | "MOSTRADOR";
export type AccountStatus = "ABIERTA" | "POR_COBRAR" | "COBRADA";

export type AccountLineDoc = Readonly<{
  id: string;
  concept: string;
  kind: "PAQUETE" | "EXCEDENTE" | "RESTAURANTE";
  amount: Readonly<{ minor: string; currency: string }>;
  paid: boolean;
  sessionId?: string | undefined;
  movedTo?: string | undefined;
  cortesia?: unknown;
  productId?: string | undefined;
  taxCode?: TaxCode | undefined;
}>;

export type AccountDoc = Readonly<{
  kind: AccountKind;
  status: AccountStatus;
  sessionIds: readonly string[];
  closedSessionIds: readonly string[];
  tableId?: string | undefined;
  split?: Readonly<{ parts: number; paid: number }> | undefined;
  lines: readonly AccountLineDoc[];
}>;

/* ─────────────────────────────────────────────────────────── qué se cobra */

/** Lo que se cobra ahora: ni lo pagado, ni lo que se movió a otra cuenta, ni lo regalado. */
export function chargeableLines<L extends AccountLineDoc>(c: Readonly<{ lines: readonly L[] }>): L[] {
  return c.lines.filter((l) => !l.paid && !l.movedTo && !l.cortesia);
}

/**
 * Las líneas por cobrar en la forma del motor de impuestos. Cada una con el trato del IVA que copió
 * al venderse (B9-1); lo que no lo trae (el parque) paga el general.
 */
export function documentLinesOf(c: Readonly<{ lines: readonly AccountLineDoc[] }>): DocumentLine[] {
  return chargeableLines(c).map((l) => ({
    id: l.id,
    description: l.concept,
    unitPrice: money(BigInt(l.amount.minor), l.amount.currency as CurrencyCode),
    quantity: 1n,
    taxCode: l.taxCode ?? "GENERAL",
  }));
}

/** ¿Quedan niños dentro? Una cuenta de familia no se cierra mientras quede alguno. */
const todosFuera = (c: AccountDoc) => c.closedSessionIds.length === c.sessionIds.length;

/**
 * Se cobró todo lo pendiente: las líneas quedan pagadas. Si la familia ya se fue (o es una mesa o
 * el mostrador), la cuenta queda cobrada; si quedan niños dentro, vuelve a «abierta».
 */
export function markPaid<A extends AccountDoc>(c: A): A {
  return {
    ...c,
    lines: c.lines.map((l) => (l.paid || l.movedTo || l.cortesia ? l : { ...l, paid: true })),
    status: c.kind !== "FAMILIA" || todosFuera(c) ? "COBRADA" : "ABIERTA",
  };
}

/**
 * Se cobró una parte (F6-12). Mientras queden partes, la cuenta sigue en la cola; con la última se
 * marca pagada entera: las líneas se pagan una sola vez, aunque el dinero entrara en varios cobros.
 */
export function markPartPaid<A extends AccountDoc>(c: A): A {
  if (!c.split) return markPaid(c);
  const pagadas = c.split.paid + 1;
  if (pagadas >= c.split.parts) return markPaid({ ...c, split: { parts: c.split.parts, paid: c.split.parts } });
  return { ...c, split: { parts: c.split.parts, paid: pagadas }, status: "POR_COBRAR" };
}

/**
 * Se anuló el cobro que pagó estas líneas (DEC-24): vuelven a estar pendientes y la cuenta vuelve a
 * la cola. Lo consumido se sigue debiendo; si no hay que cobrarlo es una cortesía, no una anulación.
 * Una cuenta dividida vuelve a cobrarse de una vez.
 */
export function revertPaid<A extends AccountDoc>(c: A, lineIds: readonly string[]): A {
  const ids = new Set(lineIds);
  const { split: _, ...sinDividir } = c;
  return { ...(sinDividir as A), lines: c.lines.map((l) => (ids.has(l.id) ? { ...l, paid: false } : l)), status: "POR_COBRAR" };
}

/* ───────────────────────────────────────── qué cambio acepta el servidor */

/** Lo que el catálogo dice de un producto en este instante (B9-1), o `null` si no se vende. */
export type ProductAtNow = Readonly<{ name: string; amountMinor: bigint; taxCode: TaxCode }>;

export type AccountChangeProblem =
  | "NUEVA_CON_PAGOS"
  | "TIPO_CAMBIADO"
  | "MESA_CAMBIADA"
  | "ESTANCIA_QUITADA"
  | "LINEA_QUITADA"
  | "LINEA_ALTERADA"
  | "PAGO_DESDE_LA_PANTALLA"
  | "MOVIDA_OTRA_VEZ"
  | "CORTESIA_EN_PAGADA"
  | "DIVISION_ALTERADA"
  | "MOSTRADOR_SIN_PRODUCTO"
  | "PRODUCTO_QUE_NO_SE_VENDE"
  | "PRECIO_DISTINTO";

export type AccountChange = Readonly<{ problem: AccountChangeProblem; lineId?: string }>;

/**
 * Una línea que la pantalla puede quitar: sin pagar y de mostrador (un producto del catálogo). Lo
 * consumido en el parque o servido en la mesa no se quita: se regala (cortesía) o se anula.
 */
const quitable = (l: AccountLineDoc) => !l.paid && !l.movedTo && l.productId !== undefined;

const mismoContenido = (a: AccountLineDoc, b: AccountLineDoc) =>
  a.concept === b.concept &&
  a.kind === b.kind &&
  a.amount.minor === b.amount.minor &&
  a.amount.currency === b.amount.currency &&
  a.sessionId === b.sessionId &&
  a.productId === b.productId &&
  a.taxCode === b.taxCode;

/**
 * ¿Acepta el servidor que la cuenta pase de `before` (`null` si es nueva) a `after`? `productAt`
 * dice qué vende hoy el catálogo; toda línea nueva de un producto tiene que llevar su nombre, su
 * precio y su IVA de este instante (un precio viejo en una pantalla abierta no se cuela). `null` si
 * se acepta; si no, el primer problema, con la línea que lo causa.
 */
export function accountChangeProblem(
  before: AccountDoc | null,
  after: AccountDoc,
  productAt: (productId: string) => ProductAtNow | null,
): AccountChange | null {
  const previas = new Map((before?.lines ?? []).map((l) => [l.id, l]));

  if (!before) {
    if (after.status === "COBRADA" || (after.split?.paid ?? 0) > 0) return { problem: "NUEVA_CON_PAGOS" };
  } else {
    if (after.kind !== before.kind) return { problem: "TIPO_CAMBIADO" };
    if (after.tableId !== before.tableId) return { problem: "MESA_CAMBIADA" };
    const sesiones = new Set(after.sessionIds);
    const cerradas = new Set(after.closedSessionIds);
    if (before.sessionIds.some((s) => !sesiones.has(s)) || before.closedSessionIds.some((s) => !cerradas.has(s))) {
      return { problem: "ESTANCIA_QUITADA" };
    }
    // Dividir o unir solo mientras no se cobró ninguna parte; las partes cobradas las cuenta el cobro.
    if ((after.split?.paid ?? 0) !== (before.split?.paid ?? 0)) return { problem: "DIVISION_ALTERADA" };
    if ((before.split?.paid ?? 0) > 0 && after.split?.parts !== before.split?.parts) return { problem: "DIVISION_ALTERADA" };
  }

  const ahora = new Set(after.lines.map((l) => l.id));
  for (const antes of previas.values()) {
    if (!ahora.has(antes.id) && !quitable(antes)) return { problem: "LINEA_QUITADA", lineId: antes.id };
  }

  for (const l of after.lines) {
    const antes = previas.get(l.id);
    if (antes) {
      if (!mismoContenido(antes, l)) return { problem: "LINEA_ALTERADA", lineId: l.id };
      if (antes.paid !== l.paid) return { problem: "PAGO_DESDE_LA_PANTALLA", lineId: l.id };
      if (antes.movedTo !== undefined && l.movedTo !== antes.movedTo) return { problem: "MOVIDA_OTRA_VEZ", lineId: l.id };
      if (antes.paid && JSON.stringify(antes.cortesia ?? null) !== JSON.stringify(l.cortesia ?? null)) {
        return { problem: "CORTESIA_EN_PAGADA", lineId: l.id };
      }
      if (antes.paid && l.movedTo !== antes.movedTo) return { problem: "MOVIDA_OTRA_VEZ", lineId: l.id };
      continue;
    }
    // Una línea nueva nace sin pagar: lo pagado lo marca el cobro.
    if (l.paid) return { problem: "PAGO_DESDE_LA_PANTALLA", lineId: l.id };
    if (after.kind === "MOSTRADOR" && l.productId === undefined) return { problem: "MOSTRADOR_SIN_PRODUCTO", lineId: l.id };
    if (l.productId !== undefined) {
      const p = productAt(l.productId);
      if (!p) return { problem: "PRODUCTO_QUE_NO_SE_VENDE", lineId: l.id };
      if (
        l.amount.currency !== "USD" ||
        BigInt(l.amount.minor) !== p.amountMinor ||
        l.concept !== p.name ||
        (l.taxCode ?? "GENERAL") !== p.taxCode
      ) {
        return { problem: "PRECIO_DISTINTO", lineId: l.id };
      }
    }
  }
  return null;
}
