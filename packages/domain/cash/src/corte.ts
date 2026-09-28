/**
 * El corte del turno — F4-05 a F4-08, B3-5, JORNADA §4 y §5, D-JOR (2026-09-28).
 *
 * El turno se cuenta contra su libro: lo que entró y salió por cada medio sale de los asientos que
 * cayeron en él (`ledgerMovements`), y lo que debería haber en la gaveta, de `tallyShift`. Aquí viven
 * las reglas del cierre:
 *
 *  · la diferencia del arqueo en una sola cifra, en dólares, con la tasa del turno (D-JOR): cada
 *    moneda por su valor absoluto, para que un sobrante en una no tape un faltante en la otra;
 *  · quién firma el corte Z: la cajera si la diferencia no pasa del umbral, supervisión si lo pasa o
 *    si no se puede saber (una diferencia en bolívares sin tasa del turno: fail-closed);
 *  · lo que queda en la gaveta al cerrar (en un relevo, el fondo) y lo que se retira.
 */
import { type FrozenRate, type Money, add, convert, money, subtract, zero } from "@l2/domain-money";
import type { LedgerKind } from "./libro.ts";

/*
 * Los tipos del turno que se usan aquí, por su forma: `index.ts` reexporta este archivo y un import de
 * vuelta sería un ciclo (`pnpm arch` lo prohíbe). Encajan con `ShiftMovement` y `ReconciliationLine`.
 */
type MovimientoDelTurno = Readonly<{ kind: "PAYMENT" | "CHANGE_OUT" | "TIP_IN_DRAWER" | "RETAINED"; methodCode: string; amount: Money; inDrawer: boolean }>;
type LineaDeCuadre = Readonly<{ difference: Money }>;

/**
 * Cuánto puede diferir el arqueo para que lo cierre la propia cajera: $ 1,00 (JORNADA §1). Pasa a
 * los ajustes de la sucursal con B4-4.
 */
export const COUNT_THRESHOLD: Money = Object.freeze(money(100n, "USD"));

/** Un asiento del libro visto desde el turno: su tipo, su medio, su importe con signo y si es de la gaveta. */
export type ShiftLedgerEntry = Readonly<{
  kind: LedgerKind;
  methodCode: string;
  /** Con signo: una reversión es negativa. En la moneda del medio. */
  amount: Money;
  /** Si el medio vive en la gaveta (el efectivo): solo eso se cuenta en el arqueo. */
  inDrawer: boolean;
}>;

/**
 * Solo mueven dinero el cobro (lo entregado entero) y el vuelto. La propina y el residuo no son
 * dinero que entra: dicen de quién es una parte de lo que ya entró con el cobro, y sumarlos otra vez
 * inventaría efectivo en la gaveta (§5.6).
 */
const MOVIMIENTO: Readonly<Record<LedgerKind, MovimientoDelTurno["kind"] | null>> = {
  COBRO: "PAYMENT",
  VUELTO: "CHANGE_OUT",
  PROPINA: null,
  RESIDUO: null,
};

/**
 * Los movimientos de un turno desde su libro. Una reversión entra con su signo: anular un cobro en
 * efectivo resta de la gaveta lo que sumó, y anular su vuelto devuelve lo que salió.
 */
export function ledgerMovements(entries: readonly ShiftLedgerEntry[]): MovimientoDelTurno[] {
  return entries.flatMap((e) => {
    const kind = MOVIMIENTO[e.kind];
    return kind ? [{ kind, methodCode: e.methodCode, amount: e.amount, inDrawer: e.inDrawer }] : [];
  });
}

const absoluto = (m: Money) => money(m.amount < 0n ? -m.amount : m.amount, m.currency);

/**
 * La diferencia del arqueo en dólares (D-JOR): la de cada moneda en valor absoluto, los bolívares
 * llevados a dólares con la tasa del turno (`vesToUsd`, la de `frozenRateOf`). `null` si hay
 * diferencia en bolívares y no hay tasa con que medirla: entonces no se sabe si pasa del umbral.
 */
export function countDifferenceInUsd(lines: readonly LineaDeCuadre[], vesToUsd: FrozenRate | null): Money | null {
  let total = zero("USD");
  for (const l of lines) {
    const d = absoluto(l.difference);
    if (d.amount === 0n) continue;
    if (d.currency === "USD") total = add(total, d);
    else if (d.currency === "VES" && vesToUsd) total = add(total, convert(d, vesToUsd));
    else return null;
  }
  return total;
}

/** Quién firma el corte Z (JORNADA §1): la cajera dentro del umbral; si no, supervisión con 🔐. */
export type ZSigner = "CAJERA" | "SUPERVISION";

export function zSigner(differenceUsd: Money | null, threshold: Money = COUNT_THRESHOLD): ZSigner {
  return differenceUsd !== null && differenceUsd.amount <= threshold.amount ? "CAJERA" : "SUPERVISION";
}

/** Por qué no vale lo que se deja en la gaveta. */
export type LeftInDrawerProblem = "MONEDA_SIN_CONTAR" | "NEGATIVO" | "MAS_DE_LO_CONTADO";

/**
 * ¿Vale dejar `left` en la gaveta habiendo contado `counted`? Cada moneda se deja una vez, sin
 * negativos y sin más de lo que se contó: no se deja lo que no hay.
 */
export function leftInDrawerProblem(counted: readonly Money[], left: readonly Money[]): LeftInDrawerProblem | null {
  for (const l of left) {
    const c = counted.find((x) => x.currency === l.currency);
    if (!c) return "MONEDA_SIN_CONTAR";
    if (l.amount < 0n) return "NEGATIVO";
    if (l.amount > c.amount) return "MAS_DE_LO_CONTADO";
  }
  return null;
}

/** Lo que se retira de la gaveta al cerrar: lo contado menos lo que se deja, por moneda. */
export function withdrawn(counted: readonly Money[], left: readonly Money[]): Money[] {
  return counted.map((c) => {
    const l = left.find((x) => x.currency === c.currency);
    return l ? subtract(c, l) : c;
  });
}
