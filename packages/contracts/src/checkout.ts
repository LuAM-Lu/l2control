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
 * Destino de la deuda.
 *
 * Unión discriminada y no un booleano `cargarAMesa`: con un booleano, el
 * identificador de la mesa queda como un campo suelto que puede venir vacío
 * justo cuando hace falta. Aquí, «cargar a mesa» sin mesa no se puede
 * expresar (ADR-011, misma idea que la duración).
 */
export const SettlementDispositionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TAQUILLA") }),
  z.object({ kind: z.literal("MESA"), tableId: IdSchema }),
]);
export type SettlementDisposition = z.infer<typeof SettlementDispositionSchema>;

/**
 * Cierre de estancias.
 *
 * `idempotencyKey` no es opcional: cerrar dos veces la misma salida cobraría
 * dos veces (I-11). Es la misma protección que en la entrada.
 */
export const CheckoutCommandSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  sessionIds: z.array(IdSchema).min(1, "Hay que cerrar al menos una estancia"),
  disposition: SettlementDispositionSchema,
});
export type CheckoutCommand = z.infer<typeof CheckoutCommandSchema>;

export const CheckoutResultSchema = z.object({
  closedSessionIds: z.array(IdSchema),
  charged: MoneySchema.nullable(),
  /** Presente solo si la deuda se cargó a una mesa. */
  chargedToTableId: IdSchema.nullable(),
});
export type CheckoutResult = z.infer<typeof CheckoutResultSchema>;
