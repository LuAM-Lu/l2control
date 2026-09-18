/**
 * Nivel 3 — funcionalidad (§9.4).
 *
 * Convierte la instantánea del contrato en datos planos y serializables que
 * el cliente puede pintar.
 *
 * Por qué existe esta capa: los `Money` del dominio llevan `bigint`, que no
 * cruza la frontera servidor→cliente de React. En lugar de degradar el tipo
 * del dominio a `number` —el error que §5.1 prohíbe— se formatea aquí, en el
 * borde, igual que las unidades mayores solo aparecen al mostrar.
 */
import type { MonitorSnapshotDto } from "@l2/contracts";
import { toMajor } from "@l2/domain-money";
import { computeOverdueCharge, computeSessionView, type SessionStatus } from "@l2/domain-park";
import { toEpochMs, toParkPolicy, toParkSession } from "./mappers.ts";

/**
 * Cómo se llama una estancia en pantalla: el apodo, el nombre o —si nadie se
 * lo puso todavía (DEC-28)— su pulsera, que es lo que el niño lleva puesto.
 *
 * Vive aquí y no en cada tarjeta para que las cinco pantallas que lo muestran
 * digan lo mismo.
 */
export function nombreVisible(s: {
  childNickname?: string | null | undefined;
  childName?: string | null | undefined;
  wristbandCode: string;
}): string {
  return s.childNickname ?? s.childName ?? s.wristbandCode;
}

/**
 * Lo mismo, para una estancia tal como viaja en los eventos: el mesero y la
 * sala la tienen en esa forma, y sin esto cada sitio se inventaba su propio
 * `?? ""`, que es como cinco pantallas acaban llamando distinto al mismo niño.
 */
export function nombreDeEstancia(s: {
  kid: { name?: string | undefined; nickname?: string | undefined };
  wristbandCode: string;
}): string {
  return nombreVisible({
    childNickname: s.kid.nickname,
    childName: s.kid.name,
    wristbandCode: s.wristbandCode,
  });
}

export type SessionCardModel = Readonly<{
  id: string;
  /** `null` mientras nadie le haya puesto nombre (DEC-28). */
  childName: string | null;
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

export type MonitorModel = Readonly<{
  serverNow: number;
  capacityLimit: number;
  shiftLabel: string;
  rateValue: string | null;
  rateSource: string | null;
  rateCapturedAt: string | null;
  rateConfirmed: boolean;
  cards: readonly SessionCardModel[];
}>;

/** Hora local en formato corto, para la barra permanente. */
function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function toMonitorModel(snapshot: MonitorSnapshotDto): MonitorModel {
  const now = toEpochMs(snapshot.serverNow);
  const policy = toParkPolicy(snapshot.policy);

  const cards = snapshot.sessions.map((dto) => {
    const session = toParkSession(dto);
    const view = computeSessionView(session, policy, now);
    const overdue = computeOverdueCharge(view, policy);

    const isFixed = session.duration.kind === "fixed";
    const contractedMinutes = isFixed ? session.duration.minutes : null;
    const totalMs = contractedMinutes === null ? null : contractedMinutes * 60_000;

    // Prepago cuenta hacia atrás contra el vencimiento; postpago hacia
    // adelante desde el check-in.
    const targetMs = totalMs === null ? session.startedAt : session.startedAt + totalMs;

    return {
      id: session.id,
      childName: session.childName ?? null,
      childNickname: session.childNickname ?? null,
      wristbandCode: session.wristbandCode,
      mode: session.mode,
      status: view.status,
      targetMs,
      direction: isFixed ? ("down" as const) : ("up" as const),
      contractedMinutes,
      startedAt: session.startedAt,
      totalMs,
      overdueAmount: toMajor(overdue),
      overdueCurrency: overdue.currency,
      hasOverdueCharge: overdue.amount > 0n,
    };
  });

  return {
    serverNow: now,
    capacityLimit: snapshot.policy.capacityLimit,
    shiftLabel: snapshot.shiftLabel,
    // Sin tasa confirmada no se puede cobrar (ADR-005, fail-closed). La
    // interfaz tiene que poder decirlo, así que el modelo lo transporta.
    rateValue: snapshot.rate?.value ?? null,
    rateSource: snapshot.rate?.source ?? null,
    rateCapturedAt: snapshot.rate ? horaCorta(snapshot.rate.capturedAt) : null,
    rateConfirmed: snapshot.rate?.confirmed ?? false,
    cards,
  };
}
