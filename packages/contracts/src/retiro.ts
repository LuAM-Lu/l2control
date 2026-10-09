/**
 * Retirar un producto del catálogo, y devolverlo — B9-11 (M-34, S-2).
 *
 * En el local, lo creado por error (también en la carga inicial) no se podía quitar: solo apartarlo, y seguía en todas
 * las listas. Retirarlo lo saca de Productos, la caja, la carta, la tablet y las listas de carga; su historia (ventas,
 * entradas, movimientos) queda en Reportes y el kárdex. Nada se borra: el retiro y su vuelta son asientos. Lo autoriza
 * administración con su PIN. Si tiene existencia, sale en el mismo paso como una salida con su motivo.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";
import { MotivoSalidaSchema } from "./salidas.ts";

const MotivoDeRetiroSchema = z.string().trim().min(3, "Di por qué se retira (al menos 3 letras)").max(200, "Hasta 200 caracteres");

export const RetirarProductoCommandSchema = z.strictObject({
  /** Un doble toque no retira dos veces. */
  idempotencyKey: z.uuid(),
  productId: IdSchema,
  motivo: MotivoDeRetiroSchema,
  /** Si le queda existencia: cómo sale (merma, consumo interno, regalo o devolución al proveedor). Sin existencia, nada. */
  salida: MotivoSalidaSchema.optional(),
});
export type RetirarProductoCommand = z.infer<typeof RetirarProductoCommandSchema>;

export const DevolverProductoCommandSchema = z.strictObject({
  productId: IdSchema,
  motivo: MotivoDeRetiroSchema,
});
export type DevolverProductoCommand = z.infer<typeof DevolverProductoCommandSchema>;

/** Cómo quedó: retirado (con la salida que sacó lo que había) o de vuelta en el catálogo. */
export const RetiroHechoSchema = z.object({
  productId: IdSchema,
  retirado: z.boolean(),
  en: TimestampSchema,
  /** Las unidades que salieron al retirarlo (0 si no tenía, o si no lleva existencia). */
  unidadesSacadas: z.number().int().min(0),
});
export type RetiroHechoDto = z.infer<typeof RetiroHechoSchema>;
