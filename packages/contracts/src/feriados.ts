/**
 * Los feriados bancarios del local — B2-4, D-FER.
 *
 * Un feriado bancario no es día hábil: el BCV no publica tasa y la del día hábil anterior lo cubre
 * (`@l2/domain-rates`). Los carga administración por año desde el calendario de SUDEBAN, que cambia
 * cada año (Carnaval y Semana Santa se mueven, y hay feriados que se trasladan): por eso no se
 * precargan de memoria.
 */
import { z } from "zod";
import { FechaSchema, IdSchema, TimestampSchema } from "./primitives.ts";

export const FeriadoSchema = z.object({
  id: IdSchema,
  dia: FechaSchema,
  nombre: z.string().trim().min(3).max(80),
  registradoPor: z.string().trim().min(2).max(80),
  registradoEl: TimestampSchema,
});
export type FeriadoDto = z.infer<typeof FeriadoSchema>;

/** Los feriados vigentes del local (los retirados no se listan: quedan en la auditoría). */
export const FeriadosSchema = z
  .object({ feriados: z.array(FeriadoSchema) })
  .refine((f) => new Set(f.feriados.map((x) => x.dia)).size === f.feriados.length, {
    message: "Un día no puede estar dos veces",
    path: ["feriados"],
  });
export type FeriadosDto = z.infer<typeof FeriadosSchema>;

/** Registrar un feriado: el día y su nombre. Quién y cuándo los pone el servidor (ADR-017). */
export const RegistrarFeriadoCommandSchema = z.strictObject({
  dia: FechaSchema,
  nombre: z.string().trim().min(3, "Escribe el nombre del feriado").max(80),
});
export type RegistrarFeriadoCommand = z.infer<typeof RegistrarFeriadoCommandSchema>;

/** Retirar un feriado registrado por error. No se borra: queda retirado, con quién y cuándo. */
export const RetirarFeriadoCommandSchema = z.strictObject({ feriadoId: z.uuid() });
export type RetirarFeriadoCommand = z.infer<typeof RetirarFeriadoCommandSchema>;
