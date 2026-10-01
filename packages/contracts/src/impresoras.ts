/**
 * Las impresoras y la cola de impresión — F1-12, F6-09b, ADR-015, ADR-026, B5-2.
 *
 * Una impresora en red **es un dispositivo en la red**: si alguien del local puede alcanzarla, puede
 * imprimir en ella. Por eso aquí no hay un campo libre para «la dirección»: hay una IP privada validada,
 * un puerto y la constancia de que está en la VLAN de hardware con IP fija (§7.1, T4). Para qué sirve
 * cada una lo dicen dos marcas: **recibos** (y el ticket de corte) y **comandas** (V-4): hoy una sola, la
 * de caja, hace las dos; mañana la de la cocina hará las comandas, sin programar.
 *
 * Quién imprime es el **agente** de la laptop de caja (ADR-026): se vincula una vez con un código y se
 * conecta al servidor hacia fuera. Aquí van también sus mensajes, que el worker revalida.
 *
 * La cola (`TrabajoDeImpresionSchema`) va `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO` (ADR-015): lo que
 * pidió la impresión no avanza por haberla intentado.
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

/** Lo que se configura de una impresora. */
export const DatosImpresoraSchema = z
  .object({
    nombre: z.string().trim().min(2, "Ponle un nombre que se reconozca").max(40, "Nombre demasiado largo"),
    ip: IpLocalSchema,
    /** 9100 es el puerto de impresión directa (ADR-015). Se deja cambiar. */
    puerto: z.number().int("Un puerto es un número entero").min(1, "Puerto de 1 a 65535").max(65_535, "Puerto de 1 a 65535"),
    ancho: AnchoPapelSchema,
    /** Recibos y tickets de corte. */
    recibos: z.boolean(),
    /** Comandas del restaurante (V-4). */
    comandas: z.boolean(),
    /**
     * Que esté en la VLAN de hardware con IP fija. No es decorativo: sin las dos cosas, cualquiera en la
     * red del local imprime en ella, y la IP se pierde al reiniciar el router (ADR-015).
     */
    enVlanDeHardware: z.boolean(),
    ipFija: z.boolean(),
  })
  .refine((d) => d.recibos || d.comandas, { message: "Elige para qué sirve: recibos, comandas o las dos", path: ["recibos"] });
export type DatosImpresoraDto = z.infer<typeof DatosImpresoraSchema>;

export const EstadoTrabajoSchema = z.enum(["PENDIENTE", "ENVIADO", "CONFIRMADO", "FALLIDO"]);
export type EstadoTrabajo = z.infer<typeof EstadoTrabajoSchema>;

export const TipoTrabajoSchema = z.enum(["RECIBO", "CORTE", "COMANDA", "PRUEBA"]);
export type TipoTrabajo = z.infer<typeof TipoTrabajoSchema>;

/** Una impresora del local, como la lee una pantalla, con cómo le fue al último trabajo. */
export const ImpresoraSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  ip: z.string(),
  puerto: z.number().int(),
  ancho: AnchoPapelSchema,
  recibos: z.boolean(),
  comandas: z.boolean(),
  enVlanDeHardware: z.boolean(),
  ipFija: z.boolean(),
  activa: z.boolean(),
  ultimo: z.object({ estado: EstadoTrabajoSchema, at: TimestampSchema, error: z.string().nullable() }).nullable(),
});
export type ImpresoraDto = z.infer<typeof ImpresoraSchema>;

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
  /** El ticket como texto (la composición exacta que sale en el papel). */
  vistaPrevia: z.string(),
  ventaId: IdSchema.nullable(),
  corteId: IdSchema.nullable(),
});
export type TrabajoDeImpresionDto = z.infer<typeof TrabajoDeImpresionSchema>;

export const TrabajosDeImpresionSchema = z.object({ trabajos: z.array(TrabajoDeImpresionSchema) });
export type TrabajosDeImpresionDto = z.infer<typeof TrabajosDeImpresionSchema>;

export const ImprimirCorteCommandSchema = z.strictObject({ corteId: z.uuid("Corte desconocido") });
export const ImprimirPruebaCommandSchema = z.strictObject({ impresoraId: z.uuid("Impresora desconocida") });
export const ReintentarTrabajoCommandSchema = z.strictObject({ trabajoId: z.uuid("Trabajo desconocido") });

/* ───────────────────────────────────────────── lo que habla el agente */

/** El agente cambia su código de un solo uso por su credencial. */
export const VincularAgenteSchema = z.strictObject({
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z2-9]{4}-?[A-Z2-9]{4}$/, "Código de 8 caracteres"),
});
export const AgenteVinculadoSchema = z.object({ agenteId: IdSchema, nombre: z.string(), credencial: z.string().min(40) });
export type AgenteVinculadoDto = z.infer<typeof AgenteVinculadoSchema>;

/** Un trabajo como lo recibe el agente: a qué IP y puerto mandar qué bytes (base64). */
export const TrabajoParaElAgenteSchema = z.object({
  id: IdSchema,
  ip: IpLocalSchema,
  puerto: z.number().int().min(1).max(65_535),
  bytes: z.string().min(4),
});
export type TrabajoParaElAgenteDto = z.infer<typeof TrabajoParaElAgenteSchema>;

/** Cómo le fue: bien, o mal con su motivo («Sin papel», «No responde en 192.168.1.50:9100»). */
export const ResultadoDelAgenteSchema = z.strictObject({
  trabajoId: z.uuid(),
  ok: z.boolean(),
  error: z.string().trim().max(200).optional(),
});
export type ResultadoDelAgenteDto = z.infer<typeof ResultadoDelAgenteSchema>;
