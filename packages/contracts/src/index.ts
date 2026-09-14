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

export {
  SettlementLineSchema,
  CheckoutPreviewSchema,
  SettlementDispositionSchema,
  CheckoutCommandSchema,
  CheckoutResultSchema,
  type SettlementLineDto,
  type CheckoutPreviewDto,
  type SettlementDisposition,
  type CheckoutCommand,
  type CheckoutResult,
} from "./checkout.ts";

export {
  RoleSchema,
  PermissionSchema,
  PermissionExceptionSchema,
  UserSummarySchema,
  UsersDirectorySchema,
  PermissionExceptionCommandSchema,
  type RoleDto,
  type PermissionDto,
  type PermissionExceptionDto,
  type UserSummaryDto,
  type UsersDirectoryDto,
  type PermissionExceptionCommand,
} from "./identity.ts";

export {
  PaymentModeSchema,
  AccountStatusSchema,
  AccountLineSchema,
  FamilyAccountSchema,
  type PaymentMode,
  type AccountStatus,
  type AccountLineDto,
  type FamilyAccountDto,
} from "./account.ts";

export {
  OperationEventSchema,
  OrderItemSchema,
  type OperationEventDto,
  type OperationEventType,
  type OrderItemDto,
} from "./eventos.ts";

export {
  DiningTableSchema,
  FloorPlanSchema,
  MenuItemSchema,
  MenuSchema,
  type DiningTableDto,
  type FloorPlanDto,
  type MenuItemDto,
  type MenuDto,
  ElementoFijoSchema,
  FormaMesaSchema,
  PlanoLocalSchema,
  type ElementoFijoDto,
  type FormaMesa,
  type PlanoLocalDto,
} from "./restaurante.ts";

export {
  DatosDePagoSchema,
  PosTerminalSchema,
  RedUsdtSchema,
  TelefonoVeSchema,
  DocumentoVeSchema,
  type DatosDePagoDto,
  type TipoDeDatosDePago,
  type PosTerminalDto,
  type RedUsdt,
} from "./pagos.ts";

export {
  ClienteFacturaSchema,
  CONSUMIDOR_FINAL,
  type ClienteFacturaDto,
} from "./documento.ts";

export {
  AnulacionSchema,
  ImpresionSchema,
  MotivoAnulacionSchema,
  PagoDeVentaSchema,
  ReciboSchema,
  VentaCerradaSchema,
  type AnulacionDto,
  type ImpresionDto,
  type MotivoAnulacion,
  type PagoDeVentaDto,
  type ReciboDto,
  type VentaCerradaDto,
} from "./ventas.ts";
