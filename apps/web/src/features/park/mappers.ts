/**
 * Traducción entre el contrato (lo que viaja) y el dominio (lo que calcula).
 *
 * Vive en la capa de funcionalidad y no en ninguno de los dos paquetes, por
 * una razón de fronteras: `@l2/contracts` es la hoja del grafo y no puede
 * conocer el dominio, y el dominio no debe atarse a una forma de transporte
 * que cambiará. Cada lado del cable mapea en la dirección que le toca.
 *
 * Aquí ocurren las dos conversiones de borde del sistema:
 *   ISO 8601  → EpochMs   (el contrato es legible; el dominio calcula)
 *   texto     → bigint    (el JSON no lleva bigint; el dinero no admite float)
 */
import type {
  DurationDto,
  MoneyDto,
  ParkPolicyDto,
  ParkSessionDto,
} from "@l2/contracts";
import { money, type Money } from "@l2/domain-money";
import {
  epochMs,
  fixed,
  openEnded,
  parkPolicy,
  type Duration,
  type EpochMs,
  type ParkPolicy,
  type ParkSession,
} from "@l2/domain-park";

/** ISO 8601 → instante. Falla ruidosamente: una fecha rota no se ignora. */
export function toEpochMs(iso: string): EpochMs {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new TypeError(`Instante no válido en el contrato: "${iso}"`);
  }
  return epochMs(ms);
}

/** Texto de unidades menores → `Money`. Sin pasar nunca por `number`. */
export function toMoney(dto: MoneyDto): Money {
  return money(BigInt(dto.minor), dto.currency);
}

export function toDuration(dto: DurationDto): Duration {
  return dto.kind === "openEnded" ? openEnded : fixed(dto.minutes);
}

export function toParkPolicy(dto: ParkPolicyDto): ParkPolicy {
  return parkPolicy({
    graceMinutes: dto.graceMinutes,
    penaltyBlockMinutes: dto.penaltyBlockMinutes,
    penaltyPricePerBlock: toMoney(dto.penaltyPricePerBlock),
    warnBeforeMinutes: dto.warnBeforeMinutes,
  });
}

export function toParkSession(dto: ParkSessionDto): ParkSession {
  return {
    id: dto.id,
    // DEC-28: una estancia puede no tener nombre. Se omite la propiedad en vez
    // de ponerla en `undefined` (`exactOptionalPropertyTypes`).
    ...(dto.kid.name ? { childName: dto.kid.name } : {}),
    // `exactOptionalPropertyTypes`: la propiedad se omite si no hay apodo,
    // en lugar de estar presente con valor `undefined`.
    ...(dto.kid.nickname ? { childNickname: dto.kid.nickname } : {}),
    wristbandCode: dto.wristbandCode,
    mode: dto.mode,
    duration: toDuration(dto.duration),
    startedAt: toEpochMs(dto.startedAt),
  };
}
