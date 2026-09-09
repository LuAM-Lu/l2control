/**
 * @l2/contracts — API pública.
 *
 * §9.3: lo que no se exporta aquí no es importable desde fuera. Un contrato
 * que no está en esta lista todavía no es un contrato, es un borrador.
 */

export {
  IdSchema,
  TimestampSchema,
  CurrencySchema,
  MoneySchema,
  IdempotencyKeySchema,
  ApiErrorSchema,
  type Id,
  type Timestamp,
  type Currency,
  type MoneyDto,
  type IdempotencyKey,
  type ApiError,
} from "./primitives.ts";

export {
  WristbandCodeSchema,
  GuardianSchema,
  KidSchema,
  DurationSchema,
  SessionModeSchema,
  PricePackageSchema,
  ParkPolicySchema,
  SessionStatusSchema,
  ParkSessionSchema,
  ExchangeRateSchema,
  MonitorSnapshotSchema,
  CheckInCommandSchema,
  CheckInResultSchema,
  type WristbandCode,
  type GuardianDto,
  type KidDto,
  type DurationDto,
  type SessionMode,
  type PricePackageDto,
  type ParkPolicyDto,
  type SessionStatus,
  type ParkSessionDto,
  type ExchangeRateDto,
  type MonitorSnapshotDto,
  type CheckInCommand,
  type CheckInResult,
} from "./park.ts";
