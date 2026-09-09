/**
 * Nivel 3 — funcionalidad (§9.4).
 *
 * Traduce el dominio a datos planos y serializables para el cliente.
 *
 * Por qué existe esta capa: los `Money` del dominio llevan `bigint`, que no
 * cruza la frontera servidor→cliente de React. En lugar de degradar el tipo
 * del dominio a `number` — que es exactamente el error que §5.1 prohíbe —
 * se formatea aquí, en el borde, tal como manda la regla de "unidades
 * mayores solo en los bordes".
 */

import {
  type ParkPolicy,
  type ParkSession,
  type SessionStatus,
  computeOverdueCharge,
  computeSessionView,
  epochMs,
} from "@l2/domain-park";
import { toMajor } from "@l2/domain-money";

export type SessionCardModel = Readonly<{
  id: string;
  childName: string;
  childNickname: string | null;
  wristbandCode: string;
  mode: "PREPAGO" | "POSTPAGO";
  status: SessionStatus;
  /** Instante contra el que cuenta el cronómetro, en epoch ms. */
  targetMs: number;
  direction: "up" | "down";
  /** Minutos contratados; `null` si la duración es abierta. */
  contractedMinutes: number | null;
  /** Check-in, en epoch ms. Lo necesita la barra de progreso. */
  startedAt: number;
  /** Duración contratada en ms; `null` si es abierta. */
  totalMs: number | null;
  overdueAmount: string;
  overdueCurrency: string;
  hasOverdueCharge: boolean;
}>;

export function toCardModel(
  session: ParkSession,
  policy: ParkPolicy,
  now: number,
): SessionCardModel {
  const view = computeSessionView(session, policy, epochMs(now));
  const overdue = computeOverdueCharge(view, policy);

  const isFixed = session.duration.kind === "fixed";
  const contractedMinutes = isFixed ? session.duration.minutes : null;

  // Prepago cuenta hacia atrás contra el vencimiento; postpago hacia
  // adelante desde el check-in.
  const targetMs = isFixed ? session.startedAt + session.duration.minutes * 60_000 : session.startedAt;

  return {
    id: session.id,
    childName: session.childName,
    childNickname: session.childNickname ?? null,
    wristbandCode: session.wristbandCode,
    mode: session.mode,
    status: view.status,
    targetMs,
    direction: isFixed ? "down" : "up",
    contractedMinutes,
    startedAt: session.startedAt,
    totalMs: contractedMinutes === null ? null : contractedMinutes * 60_000,
    overdueAmount: toMajor(overdue),
    overdueCurrency: overdue.currency,
    hasOverdueCharge: overdue.amount > 0n,
  };
}
