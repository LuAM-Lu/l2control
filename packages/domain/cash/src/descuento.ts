/**
 * Los descuentos de la caja — V-9, D-DESC, B3-6.
 *
 * Cuatro orígenes, y cada uno dice qué lo ampara:
 *
 *  · **MEDIO**: una regla de administración para quien paga **toda** la cuenta por un medio (p. ej.
 *    Zelle). La caja lo propone y se aplica con la 🔐 de supervisión o administración.
 *  · **VIP**: la familia que administración marcó con una regla VIP. La marca es la autorización.
 *  · **MANUAL**: una regla de administración que la caja aplica con motivo de lista cerrada y 🔐.
 *    Supervisión tiene un tope (20 % de la cuenta, un ajuste del local); administración, no.
 *  · **ADMIN**: administración aplica el que quiera, con su PIN y un motivo escrito.
 *
 * **Uno por cuenta** (D-DESC): la caja propone el mayor y quien autoriza puede elegir otro. Se
 * aplica a la cuenta antes de cobrar y el cobro lo consume: queda en la venta y en las excepciones,
 * y anular el cobro no lo devuelve (la cuenta vuelve a deberse entera). Siempre **antes del IVA**:
 * el motor de impuestos lo prorratea entre las líneas de su alcance (§5.3).
 *
 * Los tipos son estructurales: la forma del contrato (`DescuentoAplicadoSchema`) encaja sin que el
 * dominio lo importe.
 */
import { money, multiplyByRate, zero, add, type CurrencyCode, type Money } from "@l2/domain-money";
import { BASIS, type Discount } from "@l2/domain-tax";
import { chargeableLines, type AccountLineDoc } from "./cuenta.ts";

export type DiscountOrigin = "MEDIO" | "VIP" | "MANUAL" | "ADMIN";
/** Lo que administración deja configurado; ADMIN no es una regla, es una decisión en el momento. */
export type DiscountRuleKind = Exclude<DiscountOrigin, "ADMIN">;

/** Un porcentaje en puntos básicos (1000 = 10 %) o un monto en dólares, en unidades menores. */
export type DiscountValue =
  | Readonly<{ tipo: "PORCENTAJE"; basisPoints: number }>
  | Readonly<{ tipo: "MONTO"; monto: Readonly<{ minor: string; currency: string }> }>;

/** Sobre qué se descuenta: la cuenta entera, el parque, el restaurante o unas categorías. */
export type DiscountScope =
  | Readonly<{ tipo: "CUENTA" }>
  | Readonly<{ tipo: "PARQUE" }>
  | Readonly<{ tipo: "RESTAURANTE" }>
  | Readonly<{ tipo: "CATEGORIAS"; categorias: readonly string[] }>;

/** Una regla de Ajustes → Descuentos. Su vigencia va por días del local, los dos incluidos. */
export type DiscountRule = Readonly<{
  id: string;
  nombre: string;
  tipo: DiscountRuleKind;
  valor: DiscountValue;
  alcance: DiscountScope;
  /** El medio de pago de un descuento por medio; `null` en los demás. */
  medio: string | null;
  /** «2026-10-01». */
  desde: string;
  hasta: string | null;
  retirada: unknown | null;
}>;

/** El descuento que lleva una cuenta, como lo guarda el servidor. */
export type AppliedDiscount = Readonly<{
  origen: DiscountOrigin;
  reglaId: string | null;
  valor: DiscountValue;
  alcance: DiscountScope;
  medio: string | null;
  autorizadoPor: Readonly<{ role: string }> | null;
}>;

/** La categoría de un producto del catálogo, o `null` si no se conoce. */
export type CategoryOf = (productId: string) => string | null;

const FUNCIONAL: CurrencyCode = "USD";
const clave = (s: string) => s.trim().toLowerCase();

/** ¿Rige la regla el día `day` del local? Una retirada no rige nunca. */
export function ruleInForce(r: Pick<DiscountRule, "desde" | "hasta" | "retirada">, day: string): boolean {
  return r.retirada === null && r.desde <= day && (r.hasta === null || day <= r.hasta);
}

/**
 * Las líneas que toca un alcance, de entre las que se cobran ahora: el parque son el paquete y el
 * tiempo de más; el restaurante, lo servido o vendido; unas categorías, los productos de ellas.
 */
export function scopeLineIds(alcance: DiscountScope, c: Readonly<{ lines: readonly AccountLineDoc[] }>, categoryOf: CategoryOf): string[] {
  const lineas = chargeableLines(c);
  switch (alcance.tipo) {
    case "CUENTA":
      return lineas.map((l) => l.id);
    case "PARQUE":
      return lineas.filter((l) => l.kind === "PAQUETE" || l.kind === "EXCEDENTE").map((l) => l.id);
    case "RESTAURANTE":
      return lineas.filter((l) => l.kind === "RESTAURANTE").map((l) => l.id);
    case "CATEGORIAS": {
      const cats = new Set(alcance.categorias.map(clave));
      return lineas
        .filter((l) => {
          if (l.productId === undefined) return false;
          const cat = categoryOf(l.productId);
          return cat !== null && cats.has(clave(cat));
        })
        .map((l) => l.id);
    }
  }
}

/** Lo que suman, antes del IVA, las líneas que se cobran ahora (las que dan base al tope). */
export function chargeableSubtotal(c: Readonly<{ lines: readonly AccountLineDoc[] }>): Money {
  return chargeableLines(c).reduce<Money>((acc, l) => add(acc, money(BigInt(l.amount.minor), FUNCIONAL)), zero(FUNCIONAL));
}

/**
 * Cuánto descuenta, antes del IVA, como lo calculará el motor de impuestos: el porcentaje sobre lo
 * que suman las líneas de su alcance, y un monto sin pasar de ello. Cero si no toca ninguna.
 */
export function discountAmount(
  d: Pick<AppliedDiscount, "valor" | "alcance">,
  c: Readonly<{ lines: readonly AccountLineDoc[] }>,
  categoryOf: CategoryOf,
): Money {
  const ids = new Set(scopeLineIds(d.alcance, c, categoryOf));
  const base = chargeableLines(c)
    .filter((l) => ids.has(l.id) && BigInt(l.amount.minor) > 0n)
    .reduce<Money>((acc, l) => add(acc, money(BigInt(l.amount.minor), FUNCIONAL)), zero(FUNCIONAL));
  if (base.amount <= 0n) return zero(FUNCIONAL);
  const monto = d.valor.tipo === "PORCENTAJE" ? multiplyByRate(base, BigInt(d.valor.basisPoints), BASIS, "HALF_UP") : money(BigInt(d.valor.monto.minor), FUNCIONAL);
  return monto.amount > base.amount ? base : monto.amount < 0n ? zero(FUNCIONAL) : monto;
}

/**
 * El descuento de la cuenta en la forma del motor de impuestos (`computeDocument`), o ninguno. El
 * de toda la cuenta va sin líneas (se prorratea entre todas); los demás, con las de su alcance.
 */
export function documentDiscountsOf(
  c: Readonly<{ lines: readonly AccountLineDoc[]; descuento?: Pick<AppliedDiscount, "valor" | "alcance"> | undefined }>,
  categoryOf: CategoryOf,
): Discount[] {
  const d = c.descuento;
  if (!d) return [];
  const lineIds = d.alcance.tipo === "CUENTA" ? undefined : scopeLineIds(d.alcance, c, categoryOf);
  if (lineIds !== undefined && lineIds.length === 0) return [];
  const conAlcance = lineIds === undefined ? {} : { lineIds };
  return [
    d.valor.tipo === "PORCENTAJE"
      ? { kind: "PERCENT", basisPoints: d.valor.basisPoints, ...conAlcance }
      : { kind: "AMOUNT", value: money(BigInt(d.valor.monto.minor), FUNCIONAL), ...conAlcance },
  ];
}

/** Un descuento que la caja puede ofrecer, con lo que descuenta en esta cuenta. */
export type DiscountCandidate<R extends DiscountRule = DiscountRule> = Readonly<{ regla: R; importe: Money }>;

/**
 * Los descuentos que aplican a esta cuenta hoy, el mayor primero (D-DESC: la caja propone el mayor).
 * Los de medio y los manuales que rigen, y el VIP solo si es la regla con que se marcó a la familia.
 * Uno que no descuenta nada en esta cuenta (su alcance no toca ninguna línea) no se ofrece.
 */
export function discountCandidates<R extends DiscountRule>(input: {
  rules: readonly R[];
  day: string;
  /** La regla VIP de la familia de la cuenta, o `null`. */
  vipRuleId: string | null;
  account: Readonly<{ lines: readonly AccountLineDoc[] }>;
  categoryOf: CategoryOf;
}): DiscountCandidate<R>[] {
  return input.rules
    .filter((r) => ruleInForce(r, input.day) && (r.tipo !== "VIP" || r.id === input.vipRuleId))
    .map((regla) => ({ regla, importe: discountAmount(regla, input.account, input.categoryOf) }))
    .filter((x) => x.importe.amount > 0n)
    .sort((a, b) => (a.importe.amount === b.importe.amount ? a.regla.nombre.localeCompare(b.regla.nombre) : a.importe.amount > b.importe.amount ? -1 : 1));
}

/* ─────────────────────────────────────────────── aplicar y cobrar con él */

export type ApplyDiscountProblem = "NO_POR_COBRAR" | "CUENTA_DIVIDIDA" | "NADA_QUE_DESCONTAR";

/**
 * ¿Se le puede poner un descuento a esta cuenta? Solo a lo que está en la cola de la caja, sin
 * dividir (el reparto en partes sale del total, y un descuento a mitad de las partes no cuadraría),
 * y si descuenta algo.
 */
export function applyDiscountProblem(
  c: Readonly<{ status: string; split?: unknown; lines: readonly AccountLineDoc[] }>,
  d: Pick<AppliedDiscount, "valor" | "alcance">,
  categoryOf: CategoryOf,
): ApplyDiscountProblem | null {
  if (c.status !== "POR_COBRAR") return "NO_POR_COBRAR";
  if (c.split !== undefined) return "CUENTA_DIVIDIDA";
  if (discountAmount(d, c, categoryOf).amount <= 0n) return "NADA_QUE_DESCONTAR";
  return null;
}

/**
 * ¿Pasa del tope de supervisión? `topeBps` en puntos básicos de lo que se cobra (2000 = 20 %).
 * Exacto, sin decimales: importe / subtotal > tope ⇔ importe × 10 000 > subtotal × tope.
 */
export function exceedsSupervisionCap(importe: Money, subtotal: Money, topeBps: number): boolean {
  return importe.amount * BASIS > subtotal.amount * BigInt(topeBps);
}

/** ¿Lo que se descuenta pide que lo autorice administración? El manual por encima del tope y el de administración. */
export function needsAdministration(origen: DiscountOrigin, importe: Money, subtotal: Money, topeBps: number): boolean {
  return origen === "ADMIN" || (origen === "MANUAL" && exceedsSupervisionCap(importe, subtotal, topeBps));
}

export type DiscountAtChargeProblem = "MEDIO_DISTINTO" | "REGLA_NO_VIGENTE" | "PASA_DEL_TOPE";

/**
 * ¿Se puede cobrar con este descuento? El de medio exige que **toda** la cuenta vaya por ese medio;
 * el de una regla, que la regla siga rigiendo; y el manual que autorizó supervisión, que siga sin
 * pasar del tope (pudieron quitarse líneas desde que se aplicó). `null` si se puede.
 */
export function discountAtChargeProblem(input: {
  descuento: AppliedDiscount;
  methodCodes: readonly string[];
  ruleInForce: boolean;
  importe: Money;
  subtotal: Money;
  topeBps: number;
}): DiscountAtChargeProblem | null {
  const d = input.descuento;
  if (d.reglaId !== null && !input.ruleInForce) return "REGLA_NO_VIGENTE";
  if (d.origen === "MEDIO" && (input.methodCodes.length === 0 || input.methodCodes.some((m) => m !== d.medio))) return "MEDIO_DISTINTO";
  if (d.origen === "MANUAL" && d.autorizadoPor?.role !== "ADMIN" && exceedsSupervisionCap(input.importe, input.subtotal, input.topeBps)) {
    return "PASA_DEL_TOPE";
  }
  return null;
}

/** La cuenta con ese descuento, o sin ninguno (`null`). Uno por cuenta: el nuevo sustituye al que hubiera. */
export function withDiscount<A extends Readonly<{ descuento?: unknown }>>(c: A, descuento: A["descuento"] | null): A {
  if (descuento !== null && descuento !== undefined) return { ...c, descuento };
  const { descuento: _, ...sin } = c;
  return sin as A;
}
