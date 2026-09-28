/**
 * Contratos de salida y liquidación del parque — F5-14.
 *
 * La liquidación tiene dos destinos posibles y el plan es explícito en que
 * **ambos producen el mismo total**: cobrar en taquilla, o cargar la deuda a
 * la cuenta de una mesa del restaurante (la «cuenta unificada», que es el
 * diferencial del producto).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema, IdempotencyKeySchema } from "./primitives.ts";
import { KidSchema, WristbandCodeSchema } from "./park.ts";
import { FamilyAccountSchema } from "./account.ts";

/**
 * Desglose de una estancia al salir.
 *
 * Va desglosado y no como un único total **a propósito**: en taquilla, con el
 * representante delante, «son 6,50» sin explicación es una discusión; «5,00
 * del paquete más 1,50 de 7 minutos de más» no lo es. El desglose es una
 * herramienta de atención al cliente, no un detalle técnico.
 */
export const SettlementLineSchema = z.object({
  sessionId: IdSchema,
  wristbandCode: WristbandCodeSchema,
  kid: KidSchema,
  startedAt: TimestampSchema,
  /** Instante del cierre, fijado por el servidor (ADR-010). */
  endedAt: TimestampSchema,
  consumedMinutes: z.number().int().min(0),
  /** Minutos por encima de lo contratado, ya descontada la gracia. */
  billableOverdueMinutes: z.number().int().min(0),
  /** Bloques de penalización iniciados que se cobran. */
  penaltyBlocks: z.number().int().min(0),
  /** Lo contratado: el paquete y sus recargas. */
  packagePrice: MoneySchema,
  overdue: MoneySchema,
  total: MoneySchema,
});
export type SettlementLineDto = z.infer<typeof SettlementLineSchema>;

/** Lo que se muestra antes de cobrar. Solo lectura: no cierra nada. */
export const CheckoutPreviewSchema = z.object({
  serverNow: TimestampSchema,
  lines: z.array(SettlementLineSchema),
  total: MoneySchema,
});
export type CheckoutPreviewDto = z.infer<typeof CheckoutPreviewSchema>;

/**
 * Destino de la deuda: se paga en la CAJA o se carga a una mesa. Era
 * `TAQUILLA`; con DEC-25 solo la caja cobra, y el nombre decía lo contrario.
 *
 * Unión discriminada y no un booleano `cargarAMesa`: con un booleano, el
 * identificador de la mesa queda como un campo suelto que puede venir vacío
 * justo cuando hace falta. Aquí, «cargar a mesa» sin mesa no se puede
 * expresar (ADR-011, misma idea que la duración).
 */
export const SettlementDispositionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CAJA") }),
  z.object({ kind: z.literal("MESA"), tableId: IdSchema }),
]);
export type SettlementDisposition = z.infer<typeof SettlementDispositionSchema>;

/**
 * Cierre de estancias.
 *
 * `idempotencyKey` no es opcional: cerrar dos veces la misma salida cobraría
 * dos veces (I-11). Es la misma protección que en la entrada.
 */
/**
 * A quién se entregó el niño (D9, decidido el 2026-09-28): su representante registrado u otra
 * persona, con su nombre. No bloquea la salida, pero queda constancia.
 */
export const RecogidaSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("REPRESENTANTE") }),
  z.strictObject({
    kind: z.literal("OTRA_PERSONA"),
    nombre: z.string().trim().min(2, "Escribe quién lo recoge").max(80),
  }),
]);
export type RecogidaDto = z.infer<typeof RecogidaSchema>;

export const CheckoutCommandSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  /** Los niños de UNA familia (una cuenta): otra familia es otra salida, con su propia clave. */
  sessionIds: z
    .array(IdSchema)
    .min(1, "Hay que cerrar al menos una estancia")
    .max(10, "Demasiados niños en una misma salida")
    .refine((ids) => new Set(ids).size === ids.length, "Un niño sale una vez"),
  disposition: SettlementDispositionSchema,
  /** Quién recoge a los niños de esta familia (D9). */
  recogida: RecogidaSchema,
});
export type CheckoutCommand = z.infer<typeof CheckoutCommandSchema>;

/**
 * Lo que devuelve la salida (B4-3): el desglose de cada niño con la hora del servidor y la cuenta de
 * la familia como quedó (con el excedente y, si toca cobrar, en la cola de la caja).
 */
export const CheckoutResultSchema = z.object({
  lines: z.array(SettlementLineSchema),
  account: FamilyAccountSchema,
});
export type CheckoutResult = z.infer<typeof CheckoutResultSchema>;
