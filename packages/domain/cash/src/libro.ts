/**
 * El libro de pagos — §5.5, F3-09, F3-10 (B2-3).
 *
 * Un asiento no se edita ni se borra (I-09). Un error se corrige con una REVERSIÓN: un asiento
 * nuevo, con el mismo medio, la misma moneda, la misma tasa congelada y el importe con el signo
 * contrario, que apunta al original. Así el original queda intacto y el saldo sale solo de sumar.
 *
 * El saldo de un documento es la suma del libro, calculada, nunca guardada: lo que entró
 * (COBRO) menos lo que salió o no es del negocio (VUELTO, PROPINA, RESIDUO), cada asiento llevado a
 * la moneda funcional con SU tasa congelada (ADR-005), no con la de hoy.
 */
import { type CurrencyCode, type FrozenRate, type Money, add, convert, money, sum, zero } from "@l2/domain-money";
import type { LedgerMethodSpec, PaymentDataKind } from "./medios.ts";

/** Qué es el asiento (§5.6): el vuelto, la propina y el residuo son asientos, no restas. */
/** DEVOLUCION (B3-14): parte de un cobro que vuelve al cliente, negativa, por su mismo medio. */
export type LedgerKind = "COBRO" | "VUELTO" | "PROPINA" | "RESIDUO" | "DEVOLUCION";

/**
 * El medio de un asiento: el código de un medio del catálogo del local (`medios.ts`). Ya no es una
 * lista cerrada del código (B3-2, §9.9): lo que el libro necesita saber del medio (su moneda, si
 * da vuelto, qué datos pide) lo recibe con él.
 */
export type LedgerMethod = string;

/** USDT → USD a la par (DEC-1, a confirmar con el contador). No es una tasa del BCV. */
export const USDT_AT_PAR: FrozenRate = Object.freeze({ from: "USDT", to: "USD", numerator: 1n, denominator: 1n });

export type LedgerEntry = Readonly<{
  id: string;
  kind: LedgerKind;
  method: LedgerMethod;
  /** Con signo: positivo el original, negativo su reversión. En la moneda del medio. */
  amount: Money;
  /** IGTF de este asiento, en su moneda y con el mismo signo. Cero fuera de un COBRO. */
  igtf: Money;
  /** Tasa congelada que lleva el asiento a la moneda funcional; `null` si ya está en ella. */
  rate: FrozenRate | null;
  reversesId: string | null;
}>;

/** Por qué un asiento nuevo no es válido. */
export type EntryProblem =
  | "IMPORTE_NO_POSITIVO"
  | "MONEDA_DEL_MEDIO"
  | "FALTA_TASA"
  | "TASA_SOBRANTE"
  | "VUELTO_SOLO_EN_EFECTIVO"
  | "FALTAN_DATOS"
  | "DATOS_DE_OTRO_MEDIO"
  | "DATOS_SOBRANTES";

/**
 * ¿Se puede asentar esto como original, en este medio? Solo importes positivos, en la moneda del
 * medio, y un cobro con los datos que el medio pide para conciliarlo (F4-04): un Pago Móvil sin
 * referencia no se puede cuadrar al cerrar el día. `dataKind` es la clase de los datos que trae el
 * asiento, o `null` si no trae.
 */
export function entryProblem(
  e: Pick<LedgerEntry, "kind" | "amount" | "rate"> & Readonly<{ dataKind: PaymentDataKind | null }>,
  medio: Pick<LedgerMethodSpec, "currency" | "givesChange" | "dataKind">,
): EntryProblem | null {
  if (e.amount.amount <= 0n) return "IMPORTE_NO_POSITIVO";
  if (e.amount.currency !== medio.currency) return "MONEDA_DEL_MEDIO";
  // Los bolívares siempre con la tasa congelada; el dólar nunca; el USDT va a la par.
  if (medio.currency === "VES" && !e.rate) return "FALTA_TASA";
  if (medio.currency !== "VES" && e.rate) return "TASA_SOBRANTE";
  // El vuelto es efectivo que sale de la gaveta (§5.6): no se «devuelve» por Pago Móvil.
  if (e.kind === "VUELTO" && !medio.givesChange) return "VUELTO_SOLO_EN_EFECTIVO";
  // Solo el cobro lleva la referencia: el vuelto, la propina y el residuo no vienen de un banco.
  const pide = e.kind === "COBRO" ? medio.dataKind : null;
  if (pide !== null && e.dataKind === null) return "FALTAN_DATOS";
  if (pide !== null && e.dataKind !== pide) return "DATOS_DE_OTRO_MEDIO";
  if (pide === null && e.dataKind !== null) return "DATOS_SOBRANTES";
  return null;
}

/** Por qué no se puede revertir un asiento. */
export type ReversalProblem = "ES_UNA_REVERSION" | "YA_REVERTIDO";

export function reversalProblem(target: LedgerEntry, entries: readonly LedgerEntry[]): ReversalProblem | null {
  // Revertir una reversión sería un tercer asiento que vuelve a cobrar: eso es un cobro nuevo.
  if (target.reversesId !== null) return "ES_UNA_REVERSION";
  if (entries.some((e) => e.reversesId === target.id)) return "YA_REVERTIDO";
  return null;
}

/** La reversión de un asiento: lo mismo, con el signo contrario, apuntando al original. */
export function reversalOf(target: LedgerEntry): Omit<LedgerEntry, "id"> {
  return Object.freeze({
    kind: target.kind,
    method: target.method,
    amount: money(-target.amount.amount, target.amount.currency),
    igtf: money(-target.igtf.amount, target.igtf.currency),
    rate: target.rate,
    reversesId: target.id,
  });
}

export type LedgerBalance = Readonly<{
  /** Lo cobrado, neto de reversiones, en moneda funcional. */
  collected: Money;
  /** Lo devuelto a un cliente (B3-14), negativo, en moneda funcional. */
  refunded: Money;
  changeOut: Money;
  tip: Money;
  retained: Money;
  /** Lo aplicado al documento: cobrado − vuelto − propina − residuo. */
  applied: Money;
  /** El IGTF retenido, en moneda funcional. */
  igtf: Money;
  /** Lo cobrado por moneda, sin convertir: lo que cuenta el arqueo. */
  byCurrency: Readonly<Partial<Record<CurrencyCode, Money>>>;
}>;

/** Un importe del asiento, en la moneda funcional, con la tasa congelada del propio asiento. */
function enFuncional(m: Money, rate: FrozenRate | null, functional: CurrencyCode): Money {
  if (m.currency === functional) return m;
  if (m.currency === "USDT" && functional === "USD") return convert(m, USDT_AT_PAR);
  if (!rate) throw new Error(`Un asiento en ${m.currency} sin tasa congelada no se puede sumar (ADR-005).`);
  return convert(m, rate);
}

/** El saldo de un documento: la suma de su libro (§5.5). */
export function ledgerBalance(entries: readonly LedgerEntry[], functional: CurrencyCode): LedgerBalance {
  const deTipo = (kind: LedgerKind, que: "amount" | "igtf" = "amount") =>
    sum(
      entries.filter((e) => e.kind === kind).map((e) => enFuncional(e[que], e.rate, functional)),
      functional,
    );
  const collected = deTipo("COBRO");
  // Lo devuelto a un cliente (B3-14): negativo, resta de lo aplicado.
  const refunded = deTipo("DEVOLUCION");
  const changeOut = deTipo("VUELTO");
  const tip = deTipo("PROPINA");
  const retained = deTipo("RESIDUO");
  const byCurrency: Partial<Record<CurrencyCode, Money>> = {};
  for (const e of entries.filter((x) => x.kind === "COBRO" || x.kind === "DEVOLUCION")) {
    const c = e.amount.currency;
    byCurrency[c] = add(byCurrency[c] ?? zero(c), e.amount);
  }
  return Object.freeze({
    collected,
    changeOut,
    tip,
    retained,
    refunded,
    applied: sum([collected, refunded, money(-changeOut.amount, functional), money(-tip.amount, functional), money(-retained.amount, functional)], functional),
    igtf: deTipo("COBRO", "igtf"),
    byCurrency: Object.freeze(byCurrency),
  });
}
