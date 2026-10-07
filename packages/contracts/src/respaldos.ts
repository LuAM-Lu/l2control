/**
 * Los respaldos — B7-4, M-26, PLAN §10.4.
 *
 * Cada noche el servidor hace un volcado de la base, lo cifra para la clave del local (la privada no está en
 * el servidor) y lo deja para que lo baje una PC del local. La PC confirma cada uno con su huella; el panel
 * dice si el de anoche se hizo y si salió del servidor. Un respaldo que dejó de salir no pasa en silencio.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";

/** `l2control-20261007T071500Z.l2r`: el instante en UTC. */
export const ArchivoDeRespaldoSchema = z.string().regex(/^l2control-\d{8}T\d{6}Z\.l2r$/, "Un respaldo como l2control-20261007T071500Z.l2r");

/** SHA-256 en hexadecimal, en minúsculas. */
export const HuellaSha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "Una huella SHA-256 en hexadecimal");

export const CopiaDeRespaldoSchema = z.object({
  id: IdSchema,
  hechoEn: TimestampSchema,
  /** `HECHO`, o `FALLIDO` con su motivo en `detalle`. */
  estado: z.enum(["HECHO", "FALLIDO"]),
  archivo: ArchivoDeRespaldoSchema.nullable(),
  bytes: z.number().int().positive().nullable(),
  sha256: HuellaSha256Schema.nullable(),
  /** La versión del sistema que estaba en marcha. */
  version: z.string().nullable(),
  detalle: z.string().nullable(),
  /** Cuándo lo bajó la PC del local y confirmó su huella. */
  bajadoEn: TimestampSchema.nullable(),
  /** Cuándo lo quitó la retención del servidor (la PC guarda los suyos). */
  retiradoEn: TimestampSchema.nullable(),
});
export type CopiaDeRespaldoDto = z.infer<typeof CopiaDeRespaldoSchema>;

/**
 * Cómo están los respaldos, de mejor a peor: `AL_DIA`; `SIN_BAJAR` (la PC del local no baja los recientes:
 * la única copia está en el servidor); `ATRASADO` (el de anoche no se hizo); `FALLIDO` (el último intento
 * falló); `SIN_RESPALDOS` (este servidor todavía no los hace).
 */
export const NivelDeRespaldosSchema = z.enum(["AL_DIA", "SIN_BAJAR", "ATRASADO", "FALLIDO", "SIN_RESPALDOS"]);
export type NivelDeRespaldos = z.infer<typeof NivelDeRespaldosSchema>;

/** La PC del local que baja los respaldos, como la ve el panel. */
export const PcDeRespaldosSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  preparadaEn: TimestampSchema,
  preparadaPor: z.string(),
  /** La última vez que preguntó qué había: si deja de conectarse, se ve. */
  ultimaConexion: TimestampSchema.nullable(),
});
export type PcDeRespaldosDto = z.infer<typeof PcDeRespaldosSchema>;

export const EstadoDeRespaldosSchema = z.object({
  nivel: NivelDeRespaldosSchema,
  /** La PC del local en uso; `null` si no hay ninguna preparada. */
  pc: PcDeRespaldosSchema.nullable(),
  /** Lo que pasa, dicho para administración. */
  aviso: z.string(),
  /** El último respaldo hecho. */
  ultimo: CopiaDeRespaldoSchema.nullable(),
  /** El más reciente que la PC del local bajó y comprobó. */
  ultimoBajado: CopiaDeRespaldoSchema.nullable(),
  /** Los últimos intentos, del más nuevo al más viejo. */
  copias: z.array(CopiaDeRespaldoSchema),
});
export type EstadoDeRespaldosDto = z.infer<typeof EstadoDeRespaldosSchema>;

/** Lo que la PC del local puede bajar: los que siguen en el servidor. */
export const IndiceDeRespaldosSchema = z.object({
  copias: z.array(z.object({ archivo: ArchivoDeRespaldoSchema, bytes: z.number().int().positive(), sha256: HuellaSha256Schema, hechoEn: TimestampSchema })),
});
export type IndiceDeRespaldosDto = z.infer<typeof IndiceDeRespaldosSchema>;

/** Preparar la PC del local: su nombre. Si había otra, deja de valer. */
export const PrepararPcDeRespaldosCommandSchema = z.strictObject({
  nombre: z.string().trim().min(2, "Un nombre que se reconozca, como «PC de administración»").max(60, "Hasta 60 letras"),
});
export type PrepararPcDeRespaldosCommand = z.infer<typeof PrepararPcDeRespaldosCommandSchema>;

/** Lo que se enseña una sola vez al prepararla: la credencial que se escribe en esa PC. */
export const PcPreparadaSchema = z.object({ pc: PcDeRespaldosSchema, credencial: z.string().regex(/^[0-9a-f]{64}$/) });
export type PcPreparadaDto = z.infer<typeof PcPreparadaSchema>;

export const RetirarPcDeRespaldosCommandSchema = z.strictObject({ id: z.uuid("PC desconocida") });

/** La PC del local confirma que bajó un respaldo y que su huella coincide. */
export const AcuseDeRespaldoCommandSchema = z.strictObject({
  archivo: ArchivoDeRespaldoSchema,
  sha256: HuellaSha256Schema,
});
export type AcuseDeRespaldoCommand = z.infer<typeof AcuseDeRespaldoCommandSchema>;
