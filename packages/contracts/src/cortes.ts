/**
 * El cierre del turno y de la jornada — F4-05 a F4-08, B3-5, JORNADA §3 a §5, D-JOR.
 *
 *  · **Arqueo a ciegas**: la cajera cuenta billetes y los registra; hasta entonces no ve lo que dice
 *    el libro. El servidor le responde la diferencia y quién firma el corte Z.
 *  · **Corte X**: el informe del turno sacado del libro; se repite cuantas veces haga falta y no
 *    cambia el turno.
 *  · **Corte Z**: sella el turno. Lo firma la cajera si la diferencia no pasa del umbral y
 *    supervisión (🔐) con su justificación si lo pasa. En un relevo, la que sale deja el fondo y
 *    retira lo vendido; la jornada no se cierra con pendientes.
 */
import { z } from "zod";
import { AccountKindSchema, AccountStatusSchema } from "./account.ts";
import { CargaPendienteSchema } from "./papel.ts";
import { EstanciaSchema } from "./park.ts";
import { FechaSchema, IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";
import { TurnoSchema } from "./turno.ts";

const Texto = (max: number) => z.string().max(max);
const Positivo = MoneySchema.refine((m) => /^\d+$/.test(m.minor), "No puede ser negativo");

/* ─────────────────────────────────────────────────────────────── el arqueo */

/** Lo contado de una moneda: billetes y monedas, por denominación (F4-07: se cuentan billetes, no importes). */
export const ConteoMonedaSchema = z.strictObject({
  currency: z.enum(["USD", "VES"]),
  billetes: z
    .array(
      z.strictObject({
        denominacion: MoneySchema.refine((m) => /^\d+$/.test(m.minor) && BigInt(m.minor) > 0n, "Una denominación vale más que cero"),
        cantidad: z.number().int().min(0).max(100_000),
      }),
    )
    .max(30),
});
export type ConteoMonedaDto = z.infer<typeof ConteoMonedaSchema>;

/** Registrar el conteo de la gaveta de un turno. */
export const ArqueoCommandSchema = z
  .strictObject({
    turnoId: z.uuid("Turno desconocido"),
    conteos: z.array(ConteoMonedaSchema).length(2, "Se cuentan los dólares y los bolívares"),
  })
  .refine((c) => new Set(c.conteos.map((x) => x.currency)).size === 2, { message: "Cada moneda se cuenta una vez", path: ["conteos"] })
  .refine((c) => c.conteos.every((x) => x.billetes.every((b) => b.denominacion.currency === x.currency)), {
    message: "Cada billete va en la moneda que se cuenta",
    path: ["conteos"],
  });
export type ArqueoCommand = z.infer<typeof ArqueoCommandSchema>;

export const FirmaZSchema = z.enum(["CAJERA", "SUPERVISION"]);
export type FirmaZ = z.infer<typeof FirmaZSchema>;

/** Un conteo registrado, con lo que dice el libro y la diferencia: lo que la cajera ve después de contar. */
export const ArqueoSchema = z.object({
  id: IdSchema,
  turnoId: IdSchema,
  contadoEn: TimestampSchema,
  contadoPor: Texto(80),
  contado: z.array(MoneySchema),
  esperado: z.array(MoneySchema),
  /** Por moneda: positiva si sobra, negativa si falta. */
  diferencias: z.array(MoneySchema),
  /** La diferencia en dólares con la tasa del turno; `null` si no hay tasa para medir los bolívares. */
  diferenciaEnDolares: MoneySchema.nullable(),
  umbral: MoneySchema,
  firma: FirmaZSchema,
});
export type ArqueoDto = z.infer<typeof ArqueoSchema>;

/* ──────────────────────────────────────────────────────── las excepciones */

/** Una excepción del turno (F4-08, §7.5): con quién, cuándo, por qué y quién la autorizó. */
export const ExcepcionSchema = z.object({
  at: TimestampSchema,
  tipo: z.enum(["ANULACION", "DESCUENTO", "CORTESIA", "REIMPRESION", "RESIDUO", "INCOBRABLE", "DIFERENCIA", "PAPEL"]),
  detalle: Texto(160),
  usuario: Texto(80),
  motivo: Texto(280),
  autorizadoPor: Texto(80).nullable(),
  importe: MoneySchema.nullable(),
});
export type ExcepcionDto = z.infer<typeof ExcepcionSchema>;

/* ────────────────────────────────────────────────────────────── el corte */

/** Lo que entró por un medio en el turno. `cobrado` es la venta; `neto`, lo que dejó (con vueltos y reversiones). */
export const MovimientoPorMedioSchema = z.object({
  methodCode: IdSchema,
  label: Texto(40),
  currency: z.enum(["USD", "VES", "USDT"]),
  enGaveta: z.boolean(),
  cobrado: MoneySchema,
  neto: MoneySchema,
});
export type MovimientoPorMedioDto = z.infer<typeof MovimientoPorMedioSchema>;

/** Lo que debería haber en la gaveta de una moneda, según el libro. */
export const GavetaSchema = z.object({
  currency: z.enum(["USD", "VES"]),
  fondo: MoneySchema,
  entradas: MoneySchema,
  salidas: MoneySchema,
  esperado: MoneySchema,
});
export type GavetaDto = z.infer<typeof GavetaSchema>;

export const TipoDeCierreSchema = z.enum(["RELEVO", "JORNADA"]);
export type TipoDeCierre = z.infer<typeof TipoDeCierreSchema>;

/**
 * Un corte del turno. `VISTA` es lo que enseña la pantalla mientras se trabaja (sin lo que espera la
 * gaveta: el arqueo es a ciegas); `X` y `Z` quedan guardados. El Z lleva el arqueo y el cierre.
 */
export const CorteSchema = z.object({
  id: IdSchema.nullable(),
  tipo: z.enum(["VISTA", "X", "Z"]),
  hechoEn: TimestampSchema,
  hechoPor: Texto(80),
  turno: TurnoSchema,
  porMedio: z.array(MovimientoPorMedioSchema),
  /** `null` en la vista: el arqueo es a ciegas. */
  gaveta: z.array(GavetaSchema).nullable(),
  ventas: z.object({
    cantidad: z.number().int().nonnegative(),
    anuladas: z.number().int().nonnegative(),
    total: MoneySchema,
    igtf: MoneySchema,
    /** Cuántas de esas ventas se cargaron desde papel (B3-7). Los cortes de antes no lo traen. */
    desdePapel: z.number().int().nonnegative().default(0),
  }),
  excepciones: z.array(ExcepcionSchema),
  arqueo: ArqueoSchema.nullable(),
  cierre: z
    .object({
      tipo: TipoDeCierreSchema,
      firma: FirmaZSchema,
      firmadoPor: Texto(80),
      autorizadoPor: Texto(80).nullable(),
      justificacion: Texto(280).nullable(),
      quedaEnGaveta: z.array(MoneySchema),
      retirado: z.array(MoneySchema),
    })
    .nullable(),
});
export type CorteDto = z.infer<typeof CorteSchema>;

/** Hacer el corte X de un turno (el del equipo si no se dice). */
export const CorteXCommandSchema = z.strictObject({ turnoId: z.uuid("Turno desconocido").optional() });
export type CorteXCommand = z.infer<typeof CorteXCommandSchema>;

/**
 * Sellar el turno con el corte Z (F4-06): con el último arqueo, qué cierre es y qué se deja en la
 * gaveta. Por encima del umbral, la justificación es obligatoria (F4-07) y firma supervisión.
 */
export const CorteZCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  turnoId: z.uuid("Turno desconocido"),
  arqueoId: z.uuid("Arqueo desconocido"),
  cierre: TipoDeCierreSchema,
  quedaEnGaveta: z.array(Positivo).max(2),
  justificacion: z.string().trim().max(280).optional(),
});
export type CorteZCommand = z.infer<typeof CorteZCommandSchema>;

/* ─────────────────────────────────────────────── la jornada y sus pendientes */

/**
 * Lo que impide cerrar la jornada (JORNADA §5, C2): cuentas por cobrar, niños en sala (B4-3), estancias
 * huérfanas sin cerrar (D9), turnos de otros equipos abiertos y lo cargado desde papel sin revisar (B3-7).
 */
export const PendientesDelCierreSchema = z.object({
  cuentas: z.array(
    z.object({
      id: IdSchema,
      orderNumber: z.number().int().positive(),
      kind: AccountKindSchema,
      family: Texto(80),
      status: AccountStatusSchema,
      pendiente: MoneySchema,
      version: z.number().int().positive(),
    }),
  ),
  ninos: z.array(EstanciaSchema),
  huerfanas: z.array(EstanciaSchema),
  turnos: z.array(TurnoSchema),
  /** Las cargas desde papel sin revisar (abiertas o cerradas): ni el turno se sella ni la jornada se cierra. */
  papel: z.array(CargaPendienteSchema).default([]),
});
export type PendientesDelCierreDto = z.infer<typeof PendientesDelCierreSchema>;

export const MotivoIncobrableSchema = z.enum(["SE_FUE_SIN_PAGAR", "NO_PUEDE_PAGAR", "OTRO"], { error: "Elige el motivo" });
export type MotivoIncobrable = z.infer<typeof MotivoIncobrableSchema>;

/** Marcar incobrable una cuenta (D-JOR): con motivo y la 🔐 de supervisión. Nada se borra. */
export const IncobrableCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    motivo: MotivoIncobrableSchema,
    detalle: z.string().trim().max(200).optional(),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, { message: "Con «Otro» hay que explicarlo", path: ["detalle"] });
export type IncobrableCommand = z.infer<typeof IncobrableCommandSchema>;

/* ───────────────────────────────────────────── al abrir y el día entero */

/** Lo que falta para trabajar al abrir el turno (JORNADA §3, A3). Bloquea solo lo suyo. */
export const ComprobacionAperturaSchema = z.object({
  faltan: z.array(
    z.object({
      que: z.enum(["TASA", "IMPUESTOS", "MEDIOS", "TARIFARIO", "IMPRESORA"]),
      mensaje: Texto(160),
      /** Qué no se puede hacer sin esto. */
      bloquea: Texto(80),
      enlace: Texto(80).nullable(),
    }),
  ),
});
export type ComprobacionAperturaDto = z.infer<typeof ComprobacionAperturaSchema>;

/** El resumen del día para Inicio (JORNADA §5, C6), sacado del libro. */
export const ResumenDelDiaSchema = z.object({
  dia: FechaSchema,
  porMedio: z.array(MovimientoPorMedioSchema),
  ventas: z.object({
    cantidad: z.number().int().nonnegative(),
    anuladas: z.number().int().nonnegative(),
    total: MoneySchema,
    igtf: MoneySchema,
    /** Cuántas de esas ventas se cargaron desde papel (B3-7). */
    desdePapel: z.number().int().nonnegative().default(0),
  }),
  turnos: z.array(
    z.object({
      turno: TurnoSchema,
      diferenciaEnDolares: MoneySchema.nullable(),
      firma: FirmaZSchema.nullable(),
    }),
  ),
  excepciones: z.array(ExcepcionSchema),
  /** Las cargas desde papel que esperan revisión en la sucursal (B3-7): de cualquier día, porque bloquean el cierre. */
  papelPorRevisar: z.number().int().nonnegative().default(0),
});
export type ResumenDelDiaDto = z.infer<typeof ResumenDelDiaSchema>;
