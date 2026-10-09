/**
 * Las impresoras y la cola de impresión — F1-12, F6-09b, ADR-015, ADR-026, B5-2.
 *
 * Una impresora en red **es un dispositivo en la red**: si alguien del local puede alcanzarla, puede
 * imprimir en ella. Por eso aquí no hay un campo libre para «la dirección»: hay una IP privada validada,
 * un puerto y la constancia de que está en la VLAN de hardware con IP fija (§7.1, T4). Para qué sirve
 * cada una lo dicen tres marcas: **recibos** (y el ticket de corte), **comandas** de cocina (V-4) y **barra** (B6-10):
 * con una sola impresora, las tres en ella; con más, se reparten sin programar. Una sola encendida por marca.
 *
 * Quién imprime es el **agente** de la laptop de caja (ADR-026): se vincula una vez con un código y se
 * conecta al servidor hacia fuera. Aquí van también sus mensajes, que el worker revalida.
 *
 * La cola (`TrabajoDeImpresionSchema`) va `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO` (ADR-015): lo que
 * pidió la impresión no avanza por haberla intentado. Lo que falló o espera y ya no importa, una persona
 * lo **descarta**: no se imprime, deja de avisar y queda en el historial con su nombre.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";

/** Los dos anchos de rollo que existen en este negocio (DEC-8). */
export const AnchoPapelSchema = z.union([z.literal(58), z.literal(80)], { error: "El rollo es de 58 o de 80 mm" });
export type AnchoPapel = z.infer<typeof AnchoPapelSchema>;

/**
 * IPv4 de la red local. Solo rangos privados: una impresora con IP pública es una impresora expuesta a
 * internet, que es justo lo que ADR-015 prohíbe.
 */
export const IpLocalSchema = z
  .string()
  .trim()
  .regex(
    /^(10\.(\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/,
    "IP de red local: 192.168.x.x, 10.x.x.x o 172.16-31.x.x",
  )
  .refine((ip) => ip.split(".").every((o) => Number(o) <= 255), "Cada número va de 0 a 255");

/**
 * Cómo se llega a la impresora (B5-4, M-34): por la **red** del local (IP y puerto, ADR-015) o por **USB** en un equipo
 * con su agente, que imprime en la impresora de Windows por su nombre.
 */
export const ConexionImpresoraSchema = z.enum(["RED", "USB"], { error: "Elige cómo está conectada: red o USB" });
export type ConexionImpresora = z.infer<typeof ConexionImpresoraSchema>;

/** La página de códigos con que se escriben las tildes (B5-4); la que entiende cada modelo se prueba con «Probar acentos». */
export const PaginaDeCodigosSchema = z.enum(["PC850", "PC858", "WPC1252", "PC437"], { error: "Elige la página de códigos" });
export type PaginaDeCodigosDto = z.infer<typeof PaginaDeCodigosSchema>;

/** El nombre de una impresora en Windows, como lo dice el agente. */
export const NombreEnWindowsSchema = z.string().trim().min(1, "Elige la impresora de Windows").max(120, "Nombre demasiado largo");

/** Lo que se configura de una impresora. */
export const DatosImpresoraSchema = z
  .object({
    nombre: z.string().trim().min(2, "Ponle un nombre que se reconozca").max(40, "Nombre demasiado largo"),
    /** Red, de fábrica (lo de antes de B5-4). */
    conexion: ConexionImpresoraSchema.default("RED"),
    /** Por red: su IP y su puerto. */
    ip: IpLocalSchema.optional(),
    /** 9100 es el puerto de impresión directa (ADR-015). Se deja cambiar. */
    puerto: z.number().int("Un puerto es un número entero").min(1, "Puerto de 1 a 65535").max(65_535, "Puerto de 1 a 65535").optional(),
    /** Por USB: el agente del equipo al que está enchufada y su nombre en Windows. */
    agenteId: z.uuid("Elige el equipo al que está conectada").optional(),
    nombreEnWindows: NombreEnWindowsSchema.optional(),
    ancho: AnchoPapelSchema,
    /** La página de las tildes (B5-4). */
    pagina: PaginaDeCodigosSchema.default("PC850"),
    /** Todo en negrita y con doble pasada, para la que marca pálido (B5-4). */
    oscura: z.boolean().default(false),
    /** Recibos y tickets de corte. */
    recibos: z.boolean(),
    /** Comandas de cocina (V-4; antes de B6-10, todas). */
    comandas: z.boolean(),
    /** Comandas de barra (B6-10). */
    barra: z.boolean().default(false),
    /**
     * Que esté en la VLAN de hardware con IP fija. No es decorativo: sin las dos cosas, cualquiera en la
     * red del local imprime en ella, y la IP se pierde al reiniciar el router (ADR-015).
     */
    enVlanDeHardware: z.boolean().default(false),
    ipFija: z.boolean().default(false),
  })
  .refine((d) => d.recibos || d.comandas || d.barra, { message: "Elige qué imprime: recibos, comandas de cocina o de barra", path: ["recibos"] })
  .superRefine((d, c) => {
    if (d.conexion === "RED") {
      if (!d.ip) c.addIssue({ code: "custom", message: "Escribe su IP", path: ["ip"] });
      if (d.puerto === undefined) c.addIssue({ code: "custom", message: "Escribe su puerto (9100 casi siempre)", path: ["puerto"] });
    } else {
      if (!d.agenteId) c.addIssue({ code: "custom", message: "Elige el equipo al que está conectada", path: ["agenteId"] });
      if (!d.nombreEnWindows) c.addIssue({ code: "custom", message: "Elige la impresora de Windows", path: ["nombreEnWindows"] });
    }
  });
export type DatosImpresoraDto = z.infer<typeof DatosImpresoraSchema>;

export const EstadoTrabajoSchema = z.enum(["PENDIENTE", "ENVIADO", "CONFIRMADO", "FALLIDO", "DESCARTADO"]);
export type EstadoTrabajo = z.infer<typeof EstadoTrabajoSchema>;

export const TipoTrabajoSchema = z.enum(["RECIBO", "CORTE", "COMANDA", "ANULACION", "PRUEBA"]);
export type TipoTrabajo = z.infer<typeof TipoTrabajoSchema>;

/** Una impresora del local, como la lee una pantalla, con cómo le fue al último trabajo. */
export const ImpresoraSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  conexion: ConexionImpresoraSchema.default("RED"),
  /** Por red; por USB, vacíos. */
  ip: z.string(),
  puerto: z.number().int(),
  /** Por USB: el agente que la imprime y su nombre en Windows. */
  agenteId: IdSchema.nullable().default(null),
  nombreEnWindows: z.string().nullable().default(null),
  ancho: AnchoPapelSchema,
  pagina: PaginaDeCodigosSchema.default("PC850"),
  oscura: z.boolean().default(false),
  recibos: z.boolean(),
  comandas: z.boolean(),
  /** Comandas de barra (B6-10). */
  barra: z.boolean().default(false),
  enVlanDeHardware: z.boolean(),
  ipFija: z.boolean(),
  activa: z.boolean(),
  ultimo: z.object({ estado: EstadoTrabajoSchema, at: TimestampSchema, error: z.string().nullable() }).nullable(),
});
export type ImpresoraDto = z.infer<typeof ImpresoraSchema>;

/**
 * Cómo le fue a un cambio de versión del agente (T-8c): se cambió; la descarga no tenía la huella publicada; el
 * ejecutable nuevo no arrancó (antes de cambiarlo, o después, y volvió el anterior); u otro error al descargar.
 */
export const ResultadoDeActualizacionSchema = z.enum(["ACTUALIZADO", "HUELLA_EQUIVOCADA", "NO_ARRANCA", "NO_ARRANCO", "ERROR"]);
export type ResultadoDeActualizacion = z.infer<typeof ResultadoDeActualizacionSchema>;

/** Un agente de impresión vinculado (o esperando su código). */
export const AgenteSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  /** `null` mientras espera que se use su código. */
  vinculadoEn: TimestampSchema.nullable(),
  /** Hasta cuándo vale el código, si todavía no se usó. */
  codigoHasta: TimestampSchema.nullable(),
  ultimaVez: TimestampSchema.nullable(),
  conectado: z.boolean(),
  /** La versión que dijo al conectarse (T-8c); `null` si es de antes o todavía no se conectó. */
  version: z.string().nullable().default(null),
  /** «Actualizar ahora» pedido y aún sin resolver (T-8c). */
  actualizacionPedida: TimestampSchema.nullable().default(null),
  /** Cómo le fue a su último cambio de versión (T-8c). */
  ultimaActualizacion: z
    .object({ resultado: ResultadoDeActualizacionSchema, version: z.string(), detalle: z.string().nullable(), en: TimestampSchema })
    .nullable()
    .default(null),
  /**
   * Las impresoras que ve en Windows, como las contó al conectarse (B5-4); `null` si nunca las contó: es de una versión
   * que no imprime por USB.
   */
  impresorasDeWindows: z.array(z.string()).nullable().default(null),
});
export type AgenteDto = z.infer<typeof AgenteSchema>;

/** Las impresoras del local y sus agentes. A lo sumo una activa para recibos y una para comandas. */
export const ImpresorasDelLocalSchema = z
  .object({ impresoras: z.array(ImpresoraSchema), agentes: z.array(AgenteSchema) })
  .refine((c) => c.impresoras.filter((i) => i.activa && i.recibos).length <= 1, {
    message: "Una sola impresora activa para los recibos",
    path: ["impresoras"],
  })
  .refine((c) => c.impresoras.filter((i) => i.activa && i.comandas).length <= 1, {
    message: "Una sola impresora activa para las comandas",
    path: ["impresoras"],
  });
export type ImpresorasDelLocalDto = z.infer<typeof ImpresorasDelLocalSchema>;

/**
 * Los cambios. Una impresora se retira —es un aparato, no un asiento—; una activa va en la VLAN de
 * hardware y con IP fija (fail-closed, ADR-015), y no comparte papel con otra activa del mismo oficio.
 */
export const ImpresoraCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CREAR"), datos: DatosImpresoraSchema }),
  z.strictObject({ kind: z.literal("EDITAR"), impresoraId: z.uuid("Impresora desconocida"), datos: DatosImpresoraSchema }),
  z.strictObject({ kind: z.literal("ACTIVAR"), impresoraId: z.uuid("Impresora desconocida"), activa: z.boolean() }),
  z.strictObject({ kind: z.literal("RETIRAR"), impresoraId: z.uuid("Impresora desconocida") }),
  /** Genera el código de un solo uso con que se vincula el agente de un equipo (ADR-026). */
  z.strictObject({ kind: z.literal("VINCULAR_AGENTE"), nombre: z.string().trim().min(2, "Ponle un nombre al equipo").max(40) }),
  z.strictObject({ kind: z.literal("RETIRAR_AGENTE"), agenteId: z.uuid("Agente desconocido") }),
  /** «Actualizar ahora» (T-8c): el agente revisa ya la versión disponible y, con la cola vacía, se cambia. */
  z.strictObject({ kind: z.literal("ACTUALIZAR_AGENTE"), agenteId: z.uuid("Agente desconocido") }),
]);
export type ImpresoraCommand = z.infer<typeof ImpresoraCommandSchema>;

/** Lo que devuelve un cambio: las impresoras como quedaron y, al vincular, el código (solo esa vez). */
export const ImpresorasAplicadasSchema = z.object({
  local: ImpresorasDelLocalSchema,
  codigo: z.string().nullable(),
});
export type ImpresorasAplicadasDto = z.infer<typeof ImpresorasAplicadasSchema>;

/* ────────────────────────────────────────────────────────────── la cola */

/** Un trabajo de impresión, como lo lee una pantalla: qué, dónde, cómo va y, si falló, por qué. */
export const TrabajoDeImpresionSchema = z.object({
  id: IdSchema,
  tipo: TipoTrabajoSchema,
  /** «Recibo #0032», «Corte Z · Caja 1», «Prueba». */
  titulo: z.string().max(80),
  copia: z.boolean(),
  impresora: z.object({ id: IdSchema, nombre: z.string() }),
  estado: EstadoTrabajoSchema,
  intentos: z.number().int().min(0),
  error: z.string().nullable(),
  creadoEn: TimestampSchema,
  creadoPor: z.string(),
  terminadoEn: TimestampSchema.nullable(),
  /** Quién lo descartó, si se descartó. */
  descartadoPor: z.string().nullable(),
  /** El ticket como texto (la composición exacta que sale en el papel). */
  vistaPrevia: z.string(),
  ventaId: IdSchema.nullable(),
  corteId: IdSchema.nullable(),
});
export type TrabajoDeImpresionDto = z.infer<typeof TrabajoDeImpresionSchema>;

export const TrabajosDeImpresionSchema = z.object({ trabajos: z.array(TrabajoDeImpresionSchema) });
export type TrabajosDeImpresionDto = z.infer<typeof TrabajosDeImpresionSchema>;

export const ImprimirCorteCommandSchema = z.strictObject({ corteId: z.uuid("Corte desconocido") });
/** La prueba de una impresora; `acentos`, la de las páginas de códigos para elegir la suya (B5-4). */
export const ImprimirPruebaCommandSchema = z.strictObject({ impresoraId: z.uuid("Impresora desconocida"), acentos: z.boolean().optional() });
export const ReintentarTrabajoCommandSchema = z.strictObject({ trabajoId: z.uuid("Trabajo desconocido") });

/**
 * Descartar: uno (o los que se elijan), o de una vez todo lo que no salió —de una impresora o de todas,
 * de un tipo o de todos: lo mismo que enseña el filtro «No salieron»—. Solo lo que falló o espera; lo
 * que se está imprimiendo ahora mismo, no.
 */
export const DescartarTrabajosCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("TRABAJOS"),
    trabajoIds: z.array(z.uuid("Trabajo desconocido")).min(1, "Elige qué descartar").max(100, "Hasta 100 de una vez"),
  }),
  z.strictObject({ kind: z.literal("FALLIDOS"), impresoraId: z.uuid("Impresora desconocida").optional(), tipo: TipoTrabajoSchema.optional() }),
]);
export type DescartarTrabajosCommand = z.infer<typeof DescartarTrabajosCommandSchema>;
export const TrabajosDescartadosSchema = z.object({ descartados: z.number().int().min(0) });
export type TrabajosDescartadosDto = z.infer<typeof TrabajosDescartadosSchema>;

/* ─────────────────────────────────────────────────────── el historial */

/** Qué parte del historial: todo, lo que no salió, lo que está en cola, lo impreso o lo descartado. */
export const FiltroHistorialSchema = z.enum(["TODOS", "FALLIDOS", "EN_COLA", "IMPRESOS", "DESCARTADOS"]);
export type FiltroHistorial = z.infer<typeof FiltroHistorialSchema>;
export const POR_PAGINA_HISTORIAL = [10, 20, 50] as const;

/** Una página del historial, con sus filtros. Sin páginas infinitas: a lo sumo 50 por vez. */
export const HistorialQuerySchema = z.strictObject({
  pagina: z.number().int().min(1).max(10_000).default(1),
  porPagina: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(20),
  filtro: FiltroHistorialSchema.default("TODOS"),
  impresoraId: z.uuid("Impresora desconocida").optional(),
  tipo: TipoTrabajoSchema.optional(),
});
export type HistorialQuery = z.input<typeof HistorialQuerySchema>;

/** Lo que cuenta cada filtro, con la impresora y el tipo elegidos. */
export const ConteosHistorialSchema = z.object({
  TODOS: z.number().int().min(0),
  FALLIDOS: z.number().int().min(0),
  EN_COLA: z.number().int().min(0),
  IMPRESOS: z.number().int().min(0),
  DESCARTADOS: z.number().int().min(0),
});

export const HistorialDeImpresionSchema = z.object({
  trabajos: z.array(TrabajoDeImpresionSchema),
  /** Cuántos hay con estos filtros (para las páginas). */
  total: z.number().int().min(0),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
  conteos: ConteosHistorialSchema,
  /** Lo que pide atención en toda la sucursal, sin filtros: el resumen de arriba. */
  pendientes: z.object({ fallidos: z.number().int().min(0), enCola: z.number().int().min(0) }),
});
export type HistorialDeImpresionDto = z.infer<typeof HistorialDeImpresionSchema>;

/* ───────────────────────────────────────────── lo que habla el agente */

/** El agente cambia su código de un solo uso por su credencial. */
export const VincularAgenteSchema = z.strictObject({
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}-?[A-Z2-9]{4}$/, "Código de 8 caracteres"),
});
export const AgenteVinculadoSchema = z.object({ agenteId: IdSchema, nombre: z.string(), credencial: z.string().min(40) });
export type AgenteVinculadoDto = z.infer<typeof AgenteVinculadoSchema>;

/**
 * Un trabajo como lo recibe el agente: qué bytes (base64) mandar a qué IP y puerto o, por USB (B5-4), a qué impresora de
 * Windows. Un agente de antes solo entiende el de red, y por eso nunca recibe uno por USB (no contó sus impresoras).
 */
export const TrabajoParaElAgenteSchema = z
  .object({
    id: IdSchema,
    ip: IpLocalSchema.optional(),
    puerto: z.number().int().min(1).max(65_535).optional(),
    impresoraDeWindows: NombreEnWindowsSchema.optional(),
    bytes: z.string().min(4),
  })
  .refine((t) => (t.ip !== undefined && t.puerto !== undefined) !== (t.impresoraDeWindows !== undefined), {
    message: "Un trabajo va por red o por USB",
  });
export type TrabajoParaElAgenteDto = z.infer<typeof TrabajoParaElAgenteSchema>;

/** Las impresoras que el agente ve en Windows (B5-4): las cuenta al conectarse y cada tanto. */
export const ImpresorasDeWindowsSchema = z.strictObject({
  impresoras: z.array(NombreEnWindowsSchema).max(50),
});
export type ImpresorasDeWindowsDto = z.infer<typeof ImpresorasDeWindowsSchema>;

/** Cómo le fue: bien, o mal con su motivo («Sin papel», «No responde en 192.168.1.50:9100»). */
export const ResultadoDelAgenteSchema = z.strictObject({
  trabajoId: z.uuid(),
  ok: z.boolean(),
  error: z.string().trim().max(200).optional(),
});
export type ResultadoDelAgenteDto = z.infer<typeof ResultadoDelAgenteSchema>;

/**
 * La versión del agente que publica el servidor (T-8c): la que viaja con esta versión del sistema, con su huella
 * SHA-256, y si administración pidió «Actualizar ahora» para este agente.
 */
export const VersionDelAgenteSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  pedida: z.boolean(),
});
export type VersionDelAgenteDto = z.infer<typeof VersionDelAgenteSchema>;

/** Lo que el agente cuenta de un cambio de versión (T-8c). */
export const NotaDeActualizacionSchema = z.strictObject({
  version: z.string().trim().min(1).max(20),
  de: z.string().trim().min(1).max(20),
  resultado: ResultadoDeActualizacionSchema,
  detalle: z.string().trim().max(200).nullable().optional(),
  en: TimestampSchema.optional(),
});
export type NotaDeActualizacionDto = z.infer<typeof NotaDeActualizacionSchema>;
