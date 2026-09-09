/**
 * L2 Control — Reglas de estancia del parque
 * Implementa §6.5, ADR-010 y ADR-011 del PLAN_L2_CONTROL_v2.md.
 *
 * Dos decisiones del plan gobiernan todo este módulo:
 *
 *  ADR-010 — EL CRONÓMETRO ES DEL SERVIDOR. Ninguna función de aquí llama a
 *  `Date.now()`. El instante entra siempre como argumento `now`. Así el
 *  reloj mal configurado de una tablet no puede regalar ni cobrar tiempo,
 *  y todo el módulo es determinista y trivial de probar.
 *
 *  ADR-011 — NADA DE NÚMEROS DESNUDOS DONDE EL CERO ES AMBIGUO. "Pase
 *  libre" no es duración cero: es otra variante del tipo. La gracia es un
 *  entero no negativo donde 0 significa explícitamente "sin gracia". El
 *  bloque de penalización debe ser positivo.
 */

import { type Money, money, multiply, add, zero } from "@l2/domain-money";

/* ------------------------------------------------------------------ tiempo */

export type Minutes = number & { readonly __brand: "Minutes" };
export type EpochMs = number & { readonly __brand: "EpochMs" };

export function minutes(value: number): Minutes {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Los minutos deben ser un entero ≥ 0, recibido: ${value}`);
  }
  return value as Minutes;
}

export function epochMs(value: number): EpochMs {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Instante no válido: ${value}`);
  }
  return value as EpochMs;
}

const MS_PER_MINUTE = 60_000;

/**
 * Duración de un paquete de tiempo.
 *
 * `openEnded` es el "pase libre" o el postpago: NO tiene minutos, y por eso
 * no se puede confundir con `{ kind: "fixed", minutes: 0 }`. El tipo hace
 * imposible expresar la ambigüedad que ADR-011 quiere eliminar.
 */
export type Duration =
  | { readonly kind: "fixed"; readonly minutes: Minutes }
  | { readonly kind: "openEnded" };

export function fixed(m: number): Duration {
  const value = minutes(m);
  if (value === 0) {
    throw new RangeError(
      'Una duración fija de 0 minutos no significa nada. Usa `openEnded` para tiempo abierto.',
    );
  }
  return { kind: "fixed", minutes: value };
}

export const openEnded: Duration = { kind: "openEnded" };

/* ------------------------------------------------------------- configuración */

/**
 * Política de cobro del parque. Todo esto es CONFIGURABLE por el
 * administrador (§9.9): son datos, no constantes del código.
 */
export type ParkPolicy = Readonly<{
  /** Minutos vencidos que NO se cobran. 0 = sin gracia, explícitamente. */
  graceMinutes: Minutes;
  /** Unidad mínima de cobro del excedente. Debe ser positiva. */
  penaltyBlockMinutes: Minutes;
  /** Precio de cada bloque de penalización iniciado. */
  penaltyPricePerBlock: Money;
  /** Antelación con la que la tarjeta pasa a ámbar. */
  warnBeforeMinutes: Minutes;
}>;

export function parkPolicy(input: {
  graceMinutes: number;
  penaltyBlockMinutes: number;
  penaltyPricePerBlock: Money;
  warnBeforeMinutes: number;
}): ParkPolicy {
  const block = minutes(input.penaltyBlockMinutes);
  if (block === 0) {
    throw new RangeError(
      "El bloque de penalización debe ser positivo: un bloque de 0 minutos es una división por cero.",
    );
  }
  return Object.freeze({
    graceMinutes: minutes(input.graceMinutes),
    penaltyBlockMinutes: block,
    penaltyPricePerBlock: input.penaltyPricePerBlock,
    warnBeforeMinutes: minutes(input.warnBeforeMinutes),
  });
}

/* ------------------------------------------------------------------ estancia */

export type SessionMode = "PREPAGO" | "POSTPAGO";

/**
 * Estados visibles de una estancia (§6.5). El color de la tarjeta se
 * deriva de aquí, pero NUNCA es la única señal: la interfaz muestra
 * color + icono + texto (§8.2).
 */
export type SessionStatus = "ACTIVA" | "POR_VENCER" | "EN_GRACIA" | "VENCIDA";

export type ParkSession = Readonly<{
  id: string;
  childName: string;
  childNickname?: string;
  wristbandCode: string;
  mode: SessionMode;
  duration: Duration;
  startedAt: EpochMs;
}>;

export type SessionView = Readonly<{
  status: SessionStatus;
  /** Tiempo transcurrido desde el check-in. */
  elapsedMs: number;
  /** Tiempo que falta. `null` cuando la duración es abierta. */
  remainingMs: number | null;
  /** Tiempo excedido más allá de la duración contratada. 0 si aún no vence. */
  overdueMs: number;
  /** Excedente que ya superó la gracia y por tanto se cobra. */
  billableOverdueMs: number;
}>;

/**
 * Calcula el estado de una estancia en un instante dado.
 *
 * `now` es un parámetro a propósito (ADR-010): el servidor manda, el
 * cliente solo interpola visualmente entre latidos.
 */
export function computeSessionView(
  session: ParkSession,
  policy: ParkPolicy,
  now: EpochMs,
): SessionView {
  const elapsedMs = Math.max(0, now - session.startedAt);

  if (session.duration.kind === "openEnded") {
    // Postpago o pase libre: cuenta hacia adelante y nunca vence solo.
    return Object.freeze({
      status: "ACTIVA" as const,
      elapsedMs,
      remainingMs: null,
      overdueMs: 0,
      billableOverdueMs: 0,
    });
  }

  const totalMs = session.duration.minutes * MS_PER_MINUTE;
  const graceMs = policy.graceMinutes * MS_PER_MINUTE;
  const warnMs = policy.warnBeforeMinutes * MS_PER_MINUTE;
  const remainingMs = totalMs - elapsedMs;
  const overdueMs = Math.max(0, -remainingMs);
  const billableOverdueMs = Math.max(0, overdueMs - graceMs);

  const status: SessionStatus =
    billableOverdueMs > 0
      ? "VENCIDA"
      : overdueMs > 0
        ? "EN_GRACIA"
        : remainingMs <= warnMs
          ? "POR_VENCER"
          : "ACTIVA";

  return Object.freeze({ status, elapsedMs, remainingMs, overdueMs, billableOverdueMs });
}

/**
 * Cargo por tiempo excedido.
 *
 * Se cobra por BLOQUES INICIADOS: con bloques de 15 minutos, un minuto de
 * exceso cobra un bloque completo. Es la regla que el negocio ya usa en
 * papel, y hacerla explícita evita discusiones en taquilla.
 */
export function computeOverdueCharge(view: SessionView, policy: ParkPolicy): Money {
  const currency = policy.penaltyPricePerBlock.currency;
  if (view.billableOverdueMs <= 0) return zero(currency);

  const blockMs = policy.penaltyBlockMinutes * MS_PER_MINUTE;
  const blocksStarted = BigInt(Math.ceil(view.billableOverdueMs / blockMs));
  return multiply(policy.penaltyPricePerBlock, blocksStarted);
}

/** Total a liquidar: lo pagado por el paquete más el excedente. */
export function computeSettlement(
  packagePrice: Money,
  view: SessionView,
  policy: ParkPolicy,
): Readonly<{ packagePrice: Money; overdue: Money; total: Money }> {
  const overdue = computeOverdueCharge(view, policy);
  return Object.freeze({
    packagePrice,
    overdue,
    total: add(packagePrice, overdue),
  });
}

/* -------------------------------------------------------------------- aforo */

export type CapacityState = Readonly<{
  active: number;
  limit: number;
  isFull: boolean;
  remaining: number;
}>;

/**
 * Aforo configurable (DEC-7: 30 niños en el caso piloto).
 * Es un dato, no una constante: se cambia desde configuración sin desplegar.
 */
export function computeCapacity(activeSessions: number, limit: number): CapacityState {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`El aforo debe ser un entero ≥ 1, recibido: ${limit}`);
  }
  return Object.freeze({
    active: activeSessions,
    limit,
    isFull: activeSessions >= limit,
    remaining: Math.max(0, limit - activeSessions),
  });
}

/* ------------------------------------------------------------------ formato */

/** Formatea una duración como HH:MM:SS o MM:SS. Solo presentación. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export { money };
