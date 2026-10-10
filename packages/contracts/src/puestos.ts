/**
 * Los puestos, por uso — T-20 (M-37, U-14).
 *
 * De cada puesto (caja, parque, mesas), su primera actividad del día (la llegada) y la última (quién y en qué equipo).
 * Si está ocupado, sin actividad o si avisa lo decide la pantalla con el reloj (`estadoDelPuesto`), con los minutos y
 * los puestos vigilados de los ajustes de la sucursal.
 */
import { z } from "zod";
import { TimestampSchema } from "./primitives.ts";

export const PuestoDeServicioSchema = z.enum(["CAJA", "PARQUE", "MESAS"]);
export type PuestoDeServicioDto = z.infer<typeof PuestoDeServicioSchema>;

export const PuestosDelDiaSchema = z.object({
  /** Desde cuándo está abierta la caja (el turno abierto más antiguo de la sucursal); `null`, cerrada. */
  cajaAbiertaDesde: TimestampSchema.nullable(),
  puestos: z.array(
    z.object({
      puesto: PuestoDeServicioSchema,
      /** La llegada: la primera actividad del día. */
      primera: z.object({ en: TimestampSchema, quien: z.string() }).nullable(),
      ultima: z.object({ en: TimestampSchema, quien: z.string(), equipo: z.string().nullable() }).nullable(),
    }),
  ),
});
export type PuestosDelDiaDto = z.infer<typeof PuestosDelDiaSchema>;
