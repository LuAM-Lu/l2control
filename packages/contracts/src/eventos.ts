/**
 * Catálogo de eventos de la operación — F1-20, ADR-008, FLUJOS.md §4.
 *
 * Todo lo que una pantalla necesita saber de lo que pasa en otra viaja como
 * uno de estos eventos: el mesero confirma un pedido y la cocina lo ve; la
 * cocina lo marca listo y el mesero recibe el aviso. Hoy los emite el
 * simulador (F1-19); mañana, el servidor por Socket.io. Las pantallas no
 * distinguen el origen: por eso el contrato es uno solo.
 *
 * Unión discriminada por `type`: un evento de tipo desconocido no se puede
 * expresar y el esquema lo rechaza. El catálogo crece con cada paso de
 * DEC-22; los eventos de cuentas llegan con la caja de mesa.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";
import { ParkSessionSchema } from "./park.ts";

const base = { id: IdSchema, at: TimestampSchema };
const Texto = (max: number) => z.string().trim().min(1).max(max);
/**
 * Quién hizo el cambio (F6-08: «toda transición registra quién y cuándo»).
 * El cuándo es `at`. Opcional porque los guiones del simulador reproducen una
 * cocina sin personas; lo que emite una pantalla lo lleva siempre.
 */
const Quien = z.string().trim().min(2).max(80).optional();

export const OrderItemSchema = z.object({
  name: Texto(60),
  quantity: z.number().int().positive().max(50),
  note: z.string().trim().max(80).optional(),
});
export type OrderItemDto = z.infer<typeof OrderItemSchema>;

export const OperationEventSchema = z.discriminatedUnion("type", [
  /* ── parque ── */
  z.object({
    ...base,
    type: z.literal("estancia.abierta"),
    session: ParkSessionSchema,
    /** Representante: a quién se entrega el niño y quién paga. */
    family: z.string().trim().min(2).max(80),
  }),
  z.object({ ...base, type: z.literal("estancia.cerrada"), sessionId: IdSchema }),
  /**
   * A una estancia que entró solo con su pulsera le ponen nombre (DEC-28).
   *
   * Llega después de `estancia.abierta` y sin motivo: completar un dato no es
   * una decisión que haya que justificar. Lo emite la sala, y todas las
   * pantallas que nombran a ese niño pasan a llamarlo igual.
   */
  z.object({
    ...base,
    type: z.literal("estancia.nombrada"),
    sessionId: IdSchema,
    name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
    nickname: z.string().trim().max(30).optional(),
  }),

  /* ── mesas ── */
  z.object({
    ...base,
    type: z.literal("mesa.abierta"),
    tableId: IdSchema,
    label: Texto(20),
    guests: z.number().int().min(1).max(20),
  }),
  z.object({
    ...base,
    type: z.literal("mesa.vinculada"),
    tableId: IdSchema,
    sessionIds: z.array(IdSchema).min(1, "Vincular sin estancias no vincula nada"),
  }),
  z.object({ ...base, type: z.literal("mesa.pide_cuenta"), tableId: IdSchema }),
  z.object({ ...base, type: z.literal("mesa.por_limpiar"), tableId: IdSchema }),
  z.object({ ...base, type: z.literal("mesa.libre"), tableId: IdSchema }),

  /* ── pedidos (máquina de estados de §6.5) ── */
  z.object({
    ...base,
    type: z.literal("pedido.enviado"),
    orderId: IdSchema,
    tableId: IdSchema,
    items: z.array(OrderItemSchema).min(1, "Un pedido sin platos no se envía"),
  }),
  z.object({ ...base, type: z.literal("pedido.aceptado"), orderId: IdSchema, by: Quien }),
  z.object({ ...base, type: z.literal("pedido.listo"), orderId: IdSchema, by: Quien }),
  z.object({ ...base, type: z.literal("pedido.entregado"), orderId: IdSchema, by: Quien }),
  z.object({
    ...base,
    type: z.literal("pedido.anulado"),
    orderId: IdSchema,
    /** Anular lo que ya está en cocina exige motivo y autorización (§7.3). */
    reason: z.string().trim().min(3).max(120),
    authorizedBy: z.string().trim().min(2).max(80),
  }),
  /** La cocina confirma que vio la anulación de algo que ya estaba preparando (FLUJOS C5). */
  z.object({
    ...base,
    type: z.literal("pedido.anulacion_vista"),
    orderId: IdSchema,
    by: z.string().trim().min(2).max(80),
  }),

  /* ── impresión (ADR-015) ── */
  z.object({
    ...base,
    type: z.literal("impresora.fallo"),
    printer: Texto(40),
    detail: Texto(120),
  }),
  z.object({ ...base, type: z.literal("impresora.recuperada"), printer: Texto(40) }),

  /* ── personas conectadas (F9-08) ── */
  z.object({
    ...base,
    type: z.literal("sesion.iniciada"),
    userName: z.string().trim().min(2).max(80),
    role: Texto(40),
    device: Texto(40),
  }),
  z.object({ ...base, type: z.literal("sesion.cerrada"), device: Texto(40) }),
]);
export type OperationEventDto = z.infer<typeof OperationEventSchema>;
export type OperationEventType = OperationEventDto["type"];
