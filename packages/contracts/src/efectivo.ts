/**
 * Mover efectivo — B3-21 (M-38, W-8).
 *
 * El efectivo que entra o sale de la gaveta sin ser venta: la entrada (sencillo para la caja), la salida (compras para
 * el local, pago a proveedor, adelanto al personal) y el retiro a resguardo, en dólares o en bolívares, con su nota.
 * Por encima del tope de Ajustes ($ 20 de fábrica) y todo retiro, con el PIN de supervisión; el adelanto lo firma la
 * persona con su PIN y va a su quincena. Cada uno imprime su comprobante. Solo agregar: el turno, el corte (aparte de
 * las ventas), «La gaveta» y Movimientos lo cuentan; el cierre sigue a ciegas.
 */
import { z } from "zod";
import { MoneySchema, TimestampSchema } from "./primitives.ts";
import { FirmaDeLaPersonaSchema } from "./identity.ts";

export const TipoDeEfectivoSchema = z.enum(["ENTRADA", "SALIDA", "RETIRO"]);
export type TipoDeEfectivoDto = z.infer<typeof TipoDeEfectivoSchema>;
export const MotivoDeEfectivoSchema = z.enum(["SENCILLO", "COMPRAS", "PROVEEDOR", "ADELANTO", "RESGUARDO"]);
export type MotivoDeEfectivoDto = z.infer<typeof MotivoDeEfectivoSchema>;

const MOTIVOS: Readonly<Record<TipoDeEfectivoDto, readonly MotivoDeEfectivoDto[]>> = {
  ENTRADA: ["SENCILLO"],
  SALIDA: ["COMPRAS", "PROVEEDOR", "ADELANTO"],
  RETIRO: ["RESGUARDO"],
};

/** Mover efectivo: el tipo y su motivo, el monto (de la gaveta: $ o Bs), la nota; el adelanto, con la firma de la persona. */
export const MoverEfectivoCommandSchema = z
  .strictObject({
    idempotencyKey: z.uuid(),
    tipo: TipoDeEfectivoSchema,
    motivo: MotivoDeEfectivoSchema,
    monto: MoneySchema,
    nota: z.string().trim().min(2, "Escribe para qué es").max(160, "Hasta 160 letras"),
    /** El adelanto: la persona del equipo y su PIN. */
    persona: FirmaDeLaPersonaSchema.optional(),
    /** El retiro: quién lo recibe (firma el comprobante). */
    recibe: z.string().trim().min(2, "Escribe quién lo recibe").max(120).optional(),
  })
  .refine((c) => MOTIVOS[c.tipo].includes(c.motivo), { message: "Ese motivo no es de ese tipo de movimiento", path: ["motivo"] })
  .refine((c) => c.monto.currency === "USD" || c.monto.currency === "VES", { message: "En la gaveta hay dólares y bolívares", path: ["monto"] })
  .refine((c) => BigInt(c.monto.minor) > 0n, { message: "Escribe cuánto", path: ["monto"] })
  .refine((c) => (c.motivo === "ADELANTO") === (c.persona !== undefined), { message: "El adelanto lo firma la persona con su PIN", path: ["persona"] })
  .refine((c) => (c.tipo === "RETIRO") === (c.recibe !== undefined), { message: "Escribe quién recibe el retiro", path: ["recibe"] });
export type MoverEfectivoCommand = z.infer<typeof MoverEfectivoCommandSchema>;

/** Un movimiento de efectivo, como lo ven el turno, el corte y la quincena. */
export const MovimientoDeEfectivoSchema = z.object({
  id: z.uuid(),
  numero: z.number().int().positive(),
  tipo: TipoDeEfectivoSchema,
  motivo: MotivoDeEfectivoSchema,
  monto: MoneySchema,
  /** Lo que vale en dólares (los bolívares, a la tasa del momento). */
  enDolares: MoneySchema,
  nota: z.string(),
  /** El adelanto: a quién. */
  persona: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
  /** El retiro: quién lo recibió. */
  recibe: z.string().nullable(),
  en: TimestampSchema,
  dia: z.string(),
  por: z.string(),
  autorizo: z.string().nullable(),
  turnoId: z.uuid(),
});
export type MovimientoDeEfectivoDto = z.infer<typeof MovimientoDeEfectivoSchema>;

/** Lo que deja mover efectivo: el movimiento y, si el comprobante no salió (sin impresora de recibos), por qué. */
export const MovimientoHechoSchema = z.object({
  movimiento: MovimientoDeEfectivoSchema,
  comprobanteNoImpreso: z.string().nullable(),
});
export type MovimientoHechoDto = z.infer<typeof MovimientoHechoSchema>;

/** Lo que se movió en un turno: cada movimiento y, por moneda, lo que entró y lo que salió (aparte de las ventas). */
export const MovimientosDelTurnoSchema = z.object({
  movimientos: z.array(MovimientoDeEfectivoSchema),
  entradas: z.array(MoneySchema),
  salidas: z.array(MoneySchema),
});
export type MovimientosDelTurnoDto = z.infer<typeof MovimientosDelTurnoSchema>;

/** Reimprimir el comprobante de un movimiento. */
export const ReimprimirMovimientoCommandSchema = z.strictObject({ movimientoId: z.uuid("Movimiento desconocido") });
