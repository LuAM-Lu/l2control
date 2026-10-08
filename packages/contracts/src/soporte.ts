/**
 * Reportar un problema — T-11 (M-27, P-4, D-SOP).
 *
 * Quien opera cuenta qué pasó desde cualquier pantalla (o desde un error); el sistema adjunta la pantalla, la versión y
 * los últimos errores, y una captura si se deja. El equipo, la persona y su rol los pone el servidor de la sesión, nunca
 * la página. El reporte queda en el servidor del local con sus estados, que quien lo envió sigue en «Mis reportes» y
 * administración atiende en Ajustes → Soporte. Nada viaja a terceros: el aviso por correo al desarrollo lleva el número,
 * la versión y la pantalla, sin el texto ni la captura.
 *
 * Nunca datos de cobro ni PIN (PLAN §7.6): la captura se toma sin lo marcado como privado y los errores son los que la
 * propia aplicación enseñó.
 */
import { z } from "zod";
import { RoleSchema } from "./identity.ts";
import { NumeroDeVersionSchema } from "./sistema.ts";

/**
 * Tamaño máximo de una captura, en bytes. Una pantalla de 1366×768 en JPEG ronda los 150 KB; con este tope, la captura en
 * base64 y el texto caben en el megabyte que admite una acción del servidor. La base admite hasta 1,5 MB.
 */
export const CAPTURA_MAX_BYTES = 700_000;
/** Cuántos de los últimos errores se adjuntan. */
export const ERRORES_ADJUNTOS = 10;

export const EstadoReporteSchema = z.enum(["NUEVO", "VISTO", "EN_CURSO", "RESUELTO"]);
export type EstadoReporte = z.infer<typeof EstadoReporteSchema>;

/** La captura de la pantalla, en base64, sin el prefijo `data:`. */
export const CapturaSchema = z.strictObject({
  tipo: z.enum(["image/jpeg", "image/png"]),
  base64: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "La captura no es una imagen válida")
    // base64 ocupa 4/3 de los bytes.
    .max(Math.ceil((CAPTURA_MAX_BYTES * 4) / 3) + 4, "La captura es demasiado grande"),
});
export type CapturaDto = z.infer<typeof CapturaSchema>;

/** Lo que manda la pantalla al reportar. */
export const ReportarCommandSchema = z.strictObject({
  texto: z.string().trim().min(3, "Cuenta en unas palabras qué pasó").max(2000, "Hasta 2000 caracteres"),
  /** La pantalla: solo la ruta, sin la consulta (que puede llevar datos). */
  ruta: z.string().regex(/^\/[A-Za-z0-9/_-]{0,199}$/, "Pantalla no válida"),
  version: NumeroDeVersionSchema,
  /** El error conocido que se estaba viendo, si se reporta desde su ayuda (`clave` del manual). */
  codigoError: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/).optional(),
  /** Los últimos errores que enseñó la pantalla, del más reciente al más antiguo. */
  errores: z.array(z.string().trim().min(1).max(300)).max(ERRORES_ADJUNTOS).default([]),
  captura: CapturaSchema.optional(),
});
export type ReportarCommand = z.infer<typeof ReportarCommandSchema>;

/** Cambiar el estado de un reporte (administración). «Resuelto» dice en qué versión. */
export const EstadoDeReporteCommandSchema = z.discriminatedUnion("estado", [
  z.strictObject({ reporteId: z.uuid(), estado: z.literal("VISTO") }),
  z.strictObject({ reporteId: z.uuid(), estado: z.literal("EN_CURSO"), nota: z.string().trim().max(500).optional() }),
  z.strictObject({ reporteId: z.uuid(), estado: z.literal("RESUELTO"), version: NumeroDeVersionSchema, nota: z.string().trim().max(500).optional() }),
]);
export type EstadoDeReporteCommand = z.infer<typeof EstadoDeReporteCommandSchema>;

/** Un paso de la historia de un reporte. */
export const PasoDeReporteSchema = z.object({
  estado: EstadoReporteSchema,
  en: z.iso.datetime(),
  por: z.string(),
  version: NumeroDeVersionSchema.nullable(),
  nota: z.string().nullable(),
});

/** Un reporte, como lo ven quien lo envió y administración. */
export const ReporteSchema = z.object({
  id: z.uuid(),
  numero: z.number().int().positive(),
  creadoEn: z.iso.datetime(),
  quien: z.object({ nombre: z.string(), rol: RoleSchema }),
  equipo: z.string().nullable(),
  ruta: z.string(),
  version: NumeroDeVersionSchema,
  texto: z.string(),
  codigoError: z.string().nullable(),
  errores: z.array(z.string()),
  conCaptura: z.boolean(),
  estado: EstadoReporteSchema,
  /** En qué versión quedó resuelto. */
  resueltoEn: NumeroDeVersionSchema.nullable(),
  historia: z.array(PasoDeReporteSchema),
  /** Cuántos reportes más traen el mismo error (sin contar este). */
  iguales: z.number().int().min(0),
  /** Cómo va el aviso por correo al desarrollo. */
  aviso: z.enum(["PENDIENTE", "ENVIADO", "FALLO"]),
});
export type ReporteDto = z.infer<typeof ReporteSchema>;

export const ReportesSchema = z.object({ reportes: z.array(ReporteSchema) });
export type ReportesDto = z.infer<typeof ReportesSchema>;

/** Lo que responde reportar: el reporte y, si el mismo error ya se había reportado, cómo va. */
export const ReporteEnviadoSchema = z.object({
  reporte: ReporteSchema,
  conocido: z
    .object({
      /** Cuántos reportes anteriores traen el mismo error. */
      antes: z.number().int().positive(),
      /** El estado del más avanzado de ellos. */
      estado: EstadoReporteSchema,
      resueltoEn: NumeroDeVersionSchema.nullable(),
    })
    .nullable(),
});
export type ReporteEnviadoDto = z.infer<typeof ReporteEnviadoSchema>;
