/**
 * Las versiones del sistema y sus actualizaciones — T-8b, ADR-028, M-25.
 *
 * Una etiqueta `vX.Y.Z` publica una versión; el actualizador del servidor la ve (con sus novedades, las del
 * CHANGELOG) y la deja disponible. En staging se pone sola; en producción la pide administración desde
 * Ajustes → Sistema: ahora (sin turnos abiertos ni niños en sala) o al cierre. La web solo pide: quien la
 * pone es el actualizador del servidor, con el mismo despliegue que vuelve solo atrás si la versión nueva no
 * queda sana.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";

/** «0.58.0», sin la «v». */
export const NumeroDeVersionSchema = z.string().regex(/^\d{1,4}\.\d{1,5}\.\d{1,6}$/, "Una versión como 0.58.0");

/** Una versión publicada que el servidor puede poner (sus imágenes ya existen). */
export const VersionDisponibleSchema = z.object({
  version: NumeroDeVersionSchema,
  publicadaEn: TimestampSchema,
  /** Las novedades, como las cuenta el CHANGELOG (texto con viñetas). */
  novedades: z.string(),
  /** Una corrección de seguridad: insiste en cada entrada de administración. */
  urgente: z.boolean(),
});
export type VersionDisponibleDto = z.infer<typeof VersionDisponibleSchema>;

/**
 * Cómo se pidió: `AHORA` (sin turnos ni niños), `AL_CIERRE` (en cuanto no quede nada abierto) o
 * `AUTOMATICA` (staging, sin preguntar).
 */
export const ModoDeActualizacionSchema = z.enum(["AHORA", "AL_CIERRE", "AUTOMATICA"]);
export type ModoDeActualizacion = z.infer<typeof ModoDeActualizacionSchema>;

/**
 * Dónde va: `PEDIDA` (espera su momento), `EN_CURSO`, `HECHA`, `VUELTA_ATRAS` (la versión nueva no quedó sana
 * y sigue la anterior), `FALLIDA` (no se pudo empezar: sin imágenes, sin respaldo, migración rota; sigue la
 * anterior) o `CANCELADA`.
 */
export const EstadoDeActualizacionSchema = z.enum(["PEDIDA", "EN_CURSO", "HECHA", "VUELTA_ATRAS", "FALLIDA", "CANCELADA"]);
export type EstadoDeActualizacion = z.infer<typeof EstadoDeActualizacionSchema>;

export const ActualizacionSchema = z.object({
  id: IdSchema,
  version: NumeroDeVersionSchema,
  /** La que estaba en marcha al pedirla. */
  desde: z.string().nullable(),
  modo: ModoDeActualizacionSchema,
  estado: EstadoDeActualizacionSchema,
  pedidaEn: TimestampSchema,
  pedidaPor: z.string().nullable(),
  terminadaEn: TimestampSchema.nullable(),
  /** Lo que dijo el despliegue (por qué volvió atrás, por qué no empezó). */
  detalle: z.string().nullable(),
});
export type ActualizacionDto = z.infer<typeof ActualizacionSchema>;

export const EstadoDelSistemaSchema = z.object({
  /** La versión de este servidor web. */
  enMarcha: z.string(),
  /** `staging` se pone al día solo; en `produccion` decide administración. */
  automatico: z.boolean(),
  /** Las publicadas más nuevas que la que está en marcha, de la más nueva a la más vieja. */
  disponibles: z.array(VersionDisponibleSchema),
  /** La pedida o en curso, si la hay (una a la vez). */
  pendiente: ActualizacionSchema.nullable(),
  /** Las últimas, de la más nueva a la más vieja (con las que volvieron atrás). */
  historial: z.array(ActualizacionSchema),
  /** Lo que impide actualizar ahora mismo. */
  ocupado: z.object({ turnosAbiertos: z.number().int().min(0), ninosEnSala: z.number().int().min(0) }),
});
export type EstadoDelSistemaDto = z.infer<typeof EstadoDelSistemaSchema>;

export const PedirActualizacionCommandSchema = z.strictObject({
  version: NumeroDeVersionSchema,
  cuando: z.enum(["AHORA", "AL_CIERRE"], { error: "Elige ahora o al cierre" }),
});
export type PedirActualizacionCommand = z.infer<typeof PedirActualizacionCommandSchema>;

export const CancelarActualizacionCommandSchema = z.strictObject({ id: z.uuid("Actualización desconocida") });
