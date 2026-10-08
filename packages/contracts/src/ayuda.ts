/**
 * La ayuda dentro de la app — T-12 (M-27, P-4).
 *
 * El manual de cada pantalla es de la web (no viaja); lo que guarda el servidor es qué recorrido guiado vio cada
 * persona, para enseñarlo solo la primera vez que abre esa pantalla. Un recorrido que cambia sube de versión y se
 * vuelve a enseñar.
 */
import { z } from "zod";

/** El nombre de un recorrido: el de su pantalla, en minúsculas y con guiones («entrada», «caja-cobrar»). */
export const RecorridoIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, "Recorrido desconocido");

/** Una persona vio (o saltó) un recorrido. */
export const RecorridoVistoCommandSchema = z.strictObject({
  recorrido: RecorridoIdSchema,
  version: z.number().int().min(1).max(999),
  completo: z.boolean(),
});
export type RecorridoVistoCommand = z.infer<typeof RecorridoVistoCommandSchema>;

/** Los recorridos que vio la persona de la sesión, con su versión. */
export const RecorridosVistosSchema = z.object({
  vistos: z.array(z.object({ recorrido: RecorridoIdSchema, version: z.number().int().min(1) })),
});
export type RecorridosVistosDto = z.infer<typeof RecorridosVistosSchema>;
