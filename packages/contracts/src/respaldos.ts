/**
 * Los respaldos — B7-4, M-26, PLAN §10.4.
 *
 * Cada noche el servidor hace un volcado de la base, lo cifra para la clave del local (la privada no está en
 * el servidor) y lo deja para que lo baje una PC del local. La PC confirma cada uno con su huella; el panel
 * dice si el de anoche se hizo y si salió del servidor. Un respaldo que dejó de salir no pasa en silencio.
 *
 * Con control (B7-6, M-29): la PC guarda en la carpeta que se eligió al prepararla (mejor fuera del local: un
 * disco externo o una carpeta en la nube) y lo dice; un respaldo se fija con su nombre y nada lo borra; y una vez
 * por semana el servidor ensaya la restauración del volcado de esa noche en una base de usar y tirar.
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
  /** Si está fijado (B7-6): con su nombre, nadie lo borra, ni el servidor ni la escalera de la PC. */
  fijado: z.object({ nombre: z.string(), por: z.string(), en: TimestampSchema }).nullable().default(null),
  /** Su ensayo de restauración, si se ensayó (B7-6). */
  ensayo: z.lazy(() => EnsayoDeRestauracionSchema).nullable().default(null),
});
export type CopiaDeRespaldoDto = z.infer<typeof CopiaDeRespaldoSchema>;

/**
 * El ensayo de restauración (B7-6): el volcado de una noche, antes de cifrarlo, restaurado en una base de usar y
 * tirar. Íntegro = la base restaurada tiene la misma huella (filas de cada tabla y lo que suma el libro de pagos)
 * que se tomó al respaldar. Si no, `detalle` dice qué falló.
 */
export const EnsayoDeRestauracionSchema = z.object({
  integro: z.boolean(),
  en: TimestampSchema,
  segundos: z.number().int().min(0).nullable(),
  detalle: z.string().nullable(),
});
export type EnsayoDeRestauracionDto = z.infer<typeof EnsayoDeRestauracionSchema>;

/**
 * Cómo están los respaldos, de mejor a peor: `AL_DIA`; `SIN_ENSAYO` (pasó más de una semana sin ensayar una
 * restauración, B7-6); `SIN_BAJAR` (la PC del local no baja los recientes: la única copia está en el servidor);
 * `NO_INTEGRO` (el último ensayo de restauración falló, B7-6); `ATRASADO` (el de anoche no se hizo); `FALLIDO`
 * (el último intento falló); `SIN_RESPALDOS` (este servidor todavía no los hace).
 */
export const NivelDeRespaldosSchema = z.enum(["AL_DIA", "SIN_ENSAYO", "SIN_BAJAR", "NO_INTEGRO", "ATRASADO", "FALLIDO", "SIN_RESPALDOS"]);
export type NivelDeRespaldos = z.infer<typeof NivelDeRespaldosSchema>;

/** La PC del local que baja los respaldos, como la ve el panel. */
export const PcDeRespaldosSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  preparadaEn: TimestampSchema,
  preparadaPor: z.string(),
  /** La última vez que preguntó qué había: si deja de conectarse, se ve. */
  ultimaConexion: TimestampSchema.nullable(),
  /** Dónde guarda, como lo dijo la propia PC al conectarse (B7-6); `null` si todavía no lo dijo. */
  carpeta: z.string().nullable().default(null),
  tipoDeCarpeta: z.lazy(() => TipoDeCarpetaSchema).nullable().default(null),
  /** La versión de su programa: una anterior a `VERSION_DEL_PROGRAMA_DE_RESPALDOS` no sabe de fijados. */
  programa: z.number().int().positive().nullable().default(null),
});
export type PcDeRespaldosDto = z.infer<typeof PcDeRespaldosSchema>;

/**
 * Un respaldo pedido desde el panel (B7-8, M-35): «Respaldar ahora». Lo pide administración y lo hace el servidor en el
 * minuto siguiente; aquí, cómo va o cómo terminó.
 */
export const PedidoDeRespaldoSchema = z.object({
  estado: z.enum(["PEDIDO", "EN_CURSO", "HECHO", "FALLIDO"]),
  pedidoEn: TimestampSchema,
  por: z.string(),
  terminadoEn: TimestampSchema.nullable(),
  /** Por qué falló. */
  detalle: z.string().nullable(),
});
export type PedidoDeRespaldoDto = z.infer<typeof PedidoDeRespaldoSchema>;

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
  /** El último ensayo de restauración (B7-6), de cualquier respaldo; `null` si todavía no hubo ninguno. */
  ensayo: EnsayoDeRestauracionSchema.extend({ archivo: z.string().nullable() }).nullable().default(null),
  /** Los fijados vigentes, aunque sean viejos (B7-6). */
  fijados: z.array(CopiaDeRespaldoSchema).default([]),
  /** El último «Respaldar ahora» (B7-8): el que está pedido o en curso, o el que terminó en el último día. */
  pedido: PedidoDeRespaldoSchema.nullable().default(null),
});
export type EstadoDeRespaldosDto = z.infer<typeof EstadoDeRespaldosSchema>;

/** Lo que la PC del local puede bajar: los que siguen en el servidor. */
export const IndiceDeRespaldosSchema = z.object({
  copias: z.array(
    z.object({
      archivo: ArchivoDeRespaldoSchema,
      bytes: z.number().int().positive(),
      sha256: HuellaSha256Schema,
      hechoEn: TimestampSchema,
      /** El nombre con que se fijó (B7-6): la PC lo guarda además en «fijados», que su escalera nunca toca. */
      fijado: z.string().nullable(),
    }),
  ),
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

/** Fijar un respaldo con su nombre (B7-6): «antes de producción». */
export const FijarRespaldoCommandSchema = z.strictObject({
  id: z.uuid("Respaldo desconocido"),
  nombre: z.string().trim().min(2, "Un nombre que se reconozca, como «antes de producción»").max(40, "Hasta 40 letras"),
});
export type FijarRespaldoCommand = z.infer<typeof FijarRespaldoCommandSchema>;

/** Soltar un respaldo fijado: vuelve a la retención de siempre (lo que ya está en la PC, ahí se queda). */
export const SoltarRespaldoCommandSchema = z.strictObject({ id: z.uuid("Respaldo desconocido") });

/** Dónde guarda la PC (B7-6): en ella misma, en otro disco (uno externo) o en una carpeta que va a la nube. */
export const TipoDeCarpetaSchema = z.enum(["EN_LA_PC", "EXTERNO", "NUBE"]);
export type TipoDeCarpeta = z.infer<typeof TipoDeCarpetaSchema>;

/** La versión del programa de la PC que este servidor sirve (`/descargas/l2-respaldos.ps1`, `$VersionDelPrograma`). */
export const VERSION_DEL_PROGRAMA_DE_RESPALDOS = 2;

/** Lo que la PC dice de sí misma al pedir el índice (cabeceras `X-L2-…`), ya validado. */
export const InformeDeLaPcSchema = z.object({
  programa: z.number().int().positive().max(1000).nullable(),
  carpeta: z.string().min(1).max(260).nullable(),
  tipoDeCarpeta: TipoDeCarpetaSchema.nullable(),
});
export type InformeDeLaPcDto = z.infer<typeof InformeDeLaPcSchema>;

/** La PC del local confirma que bajó un respaldo y que su huella coincide. */
export const AcuseDeRespaldoCommandSchema = z.strictObject({
  archivo: ArchivoDeRespaldoSchema,
  sha256: HuellaSha256Schema,
});
export type AcuseDeRespaldoCommand = z.infer<typeof AcuseDeRespaldoCommandSchema>;
