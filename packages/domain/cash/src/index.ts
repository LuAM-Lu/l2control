/**
 * L2 Control — Cobro mixto, vuelto y cuadre
 * Implementa §5.5 y §5.6 del plan.
 *
 * LA REGLA QUE GOBIERNA TODO ESTE MÓDULO
 * El vuelto **es un asiento del libro, no una resta**. Si se descuenta del
 * pago, el arqueo deja de cuadrar contra la gaveta y nadie sabe por qué: el
 * efectivo que entró y el que salió tienen que verse por separado.
 *
 * Y la invariante que cierra la transacción, al céntimo:
 *
 *   Σ pagos = total del documento + Σ vuelto + Σ propina + Σ residuo
 *
 * Si no cuadra, el cobro NO se confirma. Nunca se «ajusta» la diferencia en
 * silencio: ese ajuste silencioso es exactamente donde se pierde el dinero.
 */

import {
  type CurrencyCode,
  type FrozenRate,
  type Money,
  add,
  convert,
  money,
  multiply,
  subtract,
  sum,
  zero,
} from "@l2/domain-money";

/* ------------------------------------------------------------- pagos */

export type TenderMethod = Readonly<{
  code: string;
  label: string;
  currency: CurrencyCode;
  /** Si el vuelto puede entregarse en este medio (solo el efectivo). */
  canGiveChange: boolean;
}>;

export type Tender = Readonly<{
  method: TenderMethod;
  /** Monto entregado, en la moneda del medio. */
  amount: Money;
  /**
   * Tasa congelada usada para llevarlo a la moneda funcional (ADR-005).
   * `null` cuando el medio ya está en la moneda funcional.
   */
  rate: FrozenRate | null;
}>;

/**
 * Disposición de la diferencia a favor del cliente (§5.6).
 *
 * Son tres operaciones distintas y contablemente NO son lo mismo. Unión
 * discriminada para que ninguna quede implícita.
 */
export type ChangeDisposition =
  /** Efectivo que sale de la gaveta. */
  | Readonly<{ kind: "CHANGE_OUT"; amount: Money; rate: FrozenRate | null }>
  /** El cliente lo deja de propina: NO es ingreso del negocio. */
  | Readonly<{ kind: "TIP_FROM_CHANGE"; amount: Money }>
  /** Residuo por debajo de la denominación mínima; queda en caja. */
  | Readonly<{ kind: "ROUNDING_RETAINED"; amount: Money }>;

/* ---------------------------------------------------- conversión */

/** Lleva un pago a la moneda funcional con su tasa congelada. */
export function tenderInFunctional(tender: Tender, functional: CurrencyCode): Money {
  if (tender.amount.currency === functional) return tender.amount;
  if (!tender.rate) {
    throw new MissingRateError(tender.method.code, tender.amount.currency, functional);
  }
  return convert(tender.amount, tender.rate);
}

export class MissingRateError extends Error {
  constructor(methodCode: string, from: CurrencyCode, to: CurrencyCode) {
    super(
      `El pago con "${methodCode}" está en ${from} y hay que llevarlo a ${to}, ` +
        `pero no trae tasa congelada. Sin tasa vigente no se cobra (ADR-005).`,
    );
    this.name = "MissingRateError";
  }
}

/* ------------------------------------------------------- liquidación */

export type SettlementBalance = Readonly<{
  /** Lo que hay que cobrar, incluidos impuestos. */
  due: Money;
  /** Suma de lo entregado, en moneda funcional. */
  tendered: Money;
  /** Lo que aún falta por cubrir. Cero si ya está cubierto. */
  outstanding: Money;
  /** Excedente a favor del cliente, antes de decidir qué se hace con él. */
  surplus: Money;
}>;

/** Estado del cobro: cuánto falta o cuánto sobra. */
export function computeBalance(
  due: Money,
  tenders: readonly Tender[],
  functional: CurrencyCode,
): SettlementBalance {
  const tendered = sum(
    tenders.map((t) => tenderInFunctional(t, functional)),
    functional,
  );
  const diff = subtract(tendered, due);
  return Object.freeze({
    due,
    tendered,
    outstanding: diff.amount < 0n ? money(-diff.amount, functional) : zero(functional),
    surplus: diff.amount > 0n ? diff : zero(functional),
  });
}

export class SettlementImbalanceError extends Error {
  readonly difference: Money;
  constructor(difference: Money, currency: CurrencyCode) {
    super(
      `El cobro no cuadra por ${difference.amount} unidades menores de ${currency}. ` +
        `Σ pagos debe ser igual a total + vuelto + propina + residuo (§5.6). ` +
        `No se confirma: ajustar la diferencia en silencio es como se pierde el dinero.`,
    );
    this.name = "SettlementImbalanceError";
    this.difference = difference;
  }
}

export type SettlementResult = Readonly<{
  balance: SettlementBalance;
  changeOut: Money;
  tip: Money;
  retained: Money;
}>;

/**
 * Cierra el cobro comprobando la invariante de §5.6.
 *
 * Lanza si no cuadra al céntimo. Es deliberadamente severo: una interfaz que
 * «arregla» la diferencia produce arqueos que no se pueden auditar.
 */
export function closeSettlement(input: {
  due: Money;
  tenders: readonly Tender[];
  dispositions: readonly ChangeDisposition[];
  functional: CurrencyCode;
  /** Umbral máximo que puede quedarse en caja como residuo (§5.6). */
  maxRetained: Money;
}): SettlementResult {
  const { due, tenders, dispositions, functional, maxRetained } = input;
  const balance = computeBalance(due, tenders, functional);

  if (balance.outstanding.amount > 0n) {
    throw new SettlementImbalanceError(balance.outstanding, functional);
  }

  const enFuncional = (d: ChangeDisposition): Money => {
    if (d.kind !== "CHANGE_OUT") return d.amount;
    if (d.amount.currency === functional) return d.amount;
    if (!d.rate) throw new MissingRateError("VUELTO", d.amount.currency, functional);
    // El vuelto cruzado usa LA MISMA tasa congelada de la transacción
    // (§5.6): entregarlo a otra tasa es la filtración más fácil de hacer y
    // la más difícil de detectar.
    return convert(d.amount, d.rate);
  };

  const porTipo = (kind: ChangeDisposition["kind"]) =>
    sum(
      dispositions.filter((d) => d.kind === kind).map(enFuncional),
      functional,
    );

  const changeOut = porTipo("CHANGE_OUT");
  const tip = porTipo("TIP_FROM_CHANGE");
  const retained = porTipo("ROUNDING_RETAINED");

  if (retained.amount > maxRetained.amount) {
    throw new RetainedAboveThresholdError(retained, maxRetained);
  }

  // La invariante, al céntimo.
  const aplicado = add(add(add(due, changeOut), tip), retained);
  const diferencia = subtract(balance.tendered, aplicado);
  if (diferencia.amount !== 0n) {
    throw new SettlementImbalanceError(diferencia, functional);
  }

  return Object.freeze({ balance, changeOut, tip, retained });
}

export class RetainedAboveThresholdError extends Error {
  constructor(retained: Money, max: Money) {
    super(
      `Se intentó retener ${retained.amount} unidades menores y el umbral es ${max.amount}. ` +
        `Por encima del umbral hay que dar vuelto o marcarlo como propina con ` +
        `consentimiento del cliente (§5.6).`,
    );
    this.name = "RetainedAboveThresholdError";
  }
}

/* -------------------------------------------------------------- turno */

/** Ciclo de vida del turno de caja (§6.5). */
export type ShiftStatus = "ABIERTO" | "EN_CIERRE" | "CERRADO_Z";

export class ShiftClosedError extends Error {
  constructor(action: string) {
    super(
      `No se puede "${action}": el turno ya tiene corte Z. ` +
        `Después del Z ninguna operación monetaria toca ese turno (F4-06).`,
    );
    this.name = "ShiftClosedError";
  }
}

/**
 * Guarda del turno sellado.
 *
 * El corte Z es irreversible por diseño: sella los correlativos y cierra el
 * día. Que esto sea una función y no un `if` suelto es deliberado — así no
 * hay forma de olvidarlo en una ruta nueva.
 */
export function assertShiftAcceptsMoney(status: ShiftStatus, action: string): void {
  if (status === "CERRADO_Z") throw new ShiftClosedError(action);
}

/**
 * Movimiento de dinero dentro de un turno.
 *
 * `PAYMENT` entra, `CHANGE_OUT` y `PAYOUT` salen. La propina no es ingreso
 * del negocio pero sí está físicamente en la gaveta si se dejó en efectivo,
 * por eso también es un movimiento.
 */
export type ShiftMovementKind =
  | "OPENING_FLOAT"
  | "PAYMENT"
  | "CHANGE_OUT"
  | "TIP_IN_DRAWER"
  | "RETAINED"
  | "PAYOUT";

export type ShiftMovement = Readonly<{
  kind: ShiftMovementKind;
  methodCode: string;
  amount: Money;
  /**
   * Si el dinero está físicamente en la gaveta.
   *
   * Es la distinción que hace que un arqueo sirva: el Pago Móvil, el punto de
   * venta y el Zelle NO están en la gaveta, y contarlos contra el efectivo
   * produce una diferencia inventada. Se concilian contra su propio estado de
   * cuenta, no contra lo que hay en el cajón.
   */
  inDrawer: boolean;
}>;

export type MethodTotal = Readonly<{
  methodCode: string;
  currency: CurrencyCode;
  inDrawer: boolean;
  total: Money;
}>;

export type DrawerExpectation = Readonly<{
  currency: CurrencyCode;
  openingFloat: Money;
  cashIn: Money;
  cashOut: Money;
  /** Lo que el libro dice que debería haber en la gaveta ahora. */
  expected: Money;
}>;

export type ShiftTally = Readonly<{
  byMethod: readonly MethodTotal[];
  drawer: readonly DrawerExpectation[];
}>;

const SIGN: Record<ShiftMovementKind, 1n | -1n> = {
  OPENING_FLOAT: 1n,
  PAYMENT: 1n,
  TIP_IN_DRAWER: 1n,
  RETAINED: 1n,
  CHANGE_OUT: -1n,
  PAYOUT: -1n,
};

/**
 * Totaliza un turno: por medio de pago y, aparte, lo que debería haber en la
 * gaveta.
 *
 * Son dos vistas distintas a propósito. La primera responde «¿cuánto entró
 * por cada vía?»; la segunda, «¿cuánto efectivo debería contar el cajero?».
 * Mezclarlas es el error que hace que los arqueos nunca cuadren.
 */
export function tallyShift(movements: readonly ShiftMovement[]): ShiftTally {
  const porMedio = new Map<string, MethodTotal>();
  const porMoneda = new Map<CurrencyCode, { float: Money; in: Money; out: Money }>();

  for (const mv of movements) {
    const signed = money(mv.amount.amount * SIGN[mv.kind], mv.amount.currency);

    const clave = `${mv.methodCode}|${mv.amount.currency}`;
    const previo = porMedio.get(clave);
    porMedio.set(clave, {
      methodCode: mv.methodCode,
      currency: mv.amount.currency,
      inDrawer: mv.inDrawer,
      total: previo ? add(previo.total, signed) : signed,
    });

    if (!mv.inDrawer) continue;

    const acc =
      porMoneda.get(mv.amount.currency) ??
      {
        float: zero(mv.amount.currency),
        in: zero(mv.amount.currency),
        out: zero(mv.amount.currency),
      };

    if (mv.kind === "OPENING_FLOAT") acc.float = add(acc.float, mv.amount);
    else if (SIGN[mv.kind] === 1n) acc.in = add(acc.in, mv.amount);
    else acc.out = add(acc.out, mv.amount);

    porMoneda.set(mv.amount.currency, acc);
  }

  const drawer: DrawerExpectation[] = [...porMoneda.entries()].map(([currency, a]) => ({
    currency,
    openingFloat: a.float,
    cashIn: a.in,
    cashOut: a.out,
    expected: subtract(add(a.float, a.in), a.out),
  }));

  return Object.freeze({
    byMethod: Object.freeze([...porMedio.values()]),
    drawer: Object.freeze(drawer),
  });
}

/* ------------------------------------------------------------- arqueo */

export type DenominationCount = Readonly<{
  /** Valor de la denominación: un billete de 20, una moneda de 0,25. */
  denomination: Money;
  count: number;
}>;

/**
 * Suma un conteo por denominaciones.
 *
 * El cajero cuenta billetes, no importes: pedirle el total ya sumado invita a
 * cuadrarlo «a ojo» contra lo que el sistema espera, que es justo lo que un
 * arqueo debe impedir (F4-07).
 */
export function countDenominations(
  entries: readonly DenominationCount[],
  currency: CurrencyCode,
): Money {
  return entries.reduce<Money>((acc, e) => {
    if (!Number.isInteger(e.count) || e.count < 0) {
      throw new RangeError(`El conteo debe ser un entero ≥ 0, recibido: ${e.count}`);
    }
    return add(acc, multiply(e.denomination, BigInt(e.count)));
  }, zero(currency));
}


export type CashCount = Readonly<{
  currency: CurrencyCode;
  /** Lo que el cajero contó físicamente. */
  counted: Money;
  /** Lo que el libro dice que debería haber. */
  expected: Money;
}>;

export type ReconciliationLine = Readonly<{
  currency: CurrencyCode;
  counted: Money;
  expected: Money;
  /** Positivo: sobra. Negativo: falta. */
  difference: Money;
}>;

/**
 * Cuadre por moneda (F4-07).
 *
 * No decide si la diferencia es aceptable: eso es una política configurable y
 * una conversación con el administrador. Aquí solo se calcula, y se calcula
 * **por moneda separada** — sumar dólares y bolívares en un solo número
 * escondería exactamente lo que hay que ver.
 */
export function reconcile(counts: readonly CashCount[]): readonly ReconciliationLine[] {
  return Object.freeze(
    counts.map((c) =>
      Object.freeze({
        currency: c.currency,
        counted: c.counted,
        expected: c.expected,
        difference: subtract(c.counted, c.expected),
      }),
    ),
  );
}
