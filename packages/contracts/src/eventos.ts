/**
 * Catálogo de eventos de la operación — F1-20, ADR-008, FLUJOS.md §4.
 *
 * Lo que una pantalla necesita saber de otra y todavía no es del servidor viaja como uno de estos
 * eventos por el worker (B5-1). Los pedidos y su comanda son del servidor desde B6-2; vincular
 * pulseras, desde B6-3 (`casosMesas.vincular`, ADR-025: también dejó su asiento y su aviso en vivo).
 * Quedan el abrir, pedir la cuenta, poner por limpiar y liberar una mesa, sin dinero detrás.
 *
 * Unión discriminada por `type`: un evento de tipo desconocido no se puede
 * expresar y el esquema lo rechaza.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";
import { ParkSessionSchema } from "./park.ts";

const base = { id: IdSchema, at: TimestampSchema };
const Texto = (max: number) => z.string().trim().min(1).max(max);
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
  z.object({ ...base, type: z.literal("mesa.pide_cuenta"), tableId: IdSchema }),
  z.object({ ...base, type: z.literal("mesa.por_limpiar"), tableId: IdSchema }),
  z.object({ ...base, type: z.literal("mesa.libre"), tableId: IdSchema }),

  // Los pedidos y su comanda son del servidor desde B6-2 (ADR-022): «en fuego», «listo» y «entregado» ya no
  // existen, y la impresora la vigila la cola de impresión (B5-2). Vincular pulseras es del servidor desde
  // B6-3: mueve dinero entre cuentas, y eso no viaja por un evento de pantalla sin autenticar.
  // Quién está en cada puesto (F9-08) ya no es un evento que declare una pantalla: lo dicen las
  // sesiones abiertas en el servidor (B5-1, `SesionEnCursoSchema`).
]);
export type OperationEventDto = z.infer<typeof OperationEventSchema>;
export type OperationEventType = OperationEventDto["type"];
