/**
 * Los reportes — Etapa 11, F9 (M-29).
 *
 * Una sección de solo lectura para administración y supervisión (`reportes.verSucursal`). Todo sale de los asientos
 * (el libro de pagos, las ventas, los cortes Z), cuenta por día de negocio del local, y un día con su Z cerrado da
 * siempre lo mismo. Cada informe con su periodo y su vista de impresión A4, que el navegador guarda como PDF.
 *
 * El navegador dice qué periodo; el instante del informe, el local y quién lo pide los pone el servidor (ADR-017).
 */
import { z } from "zod";
import { FechaSchema, IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/** Hasta cuántos días entra en un informe: un trimestre. Más, se parte. */
export const MAX_DIAS_DE_INFORME = 93;

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;

/** Un periodo de días de negocio, del primero al último incluidos. */
export const PeriodoDeInformeSchema = z
  .strictObject({ desde: FechaSchema, hasta: FechaSchema })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] })
  .refine((p) => dias(p.desde, p.hasta) <= MAX_DIAS_DE_INFORME, { message: `Hasta ${MAX_DIAS_DE_INFORME} días: parte el periodo`, path: ["desde"] });
export type PeriodoDeInformeDto = z.infer<typeof PeriodoDeInformeSchema>;

/** Pedir el informe de ventas (B11-1): su periodo y, si se quiere, solo los turnos de una cajera. */
export const ConsultaDeVentasSchema = z
  .strictObject({ desde: FechaSchema, hasta: FechaSchema, cajera: z.uuid("Cajera desconocida").optional() })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] })
  .refine((p) => dias(p.desde, p.hasta) <= MAX_DIAS_DE_INFORME, { message: `Hasta ${MAX_DIAS_DE_INFORME} días: parte el periodo`, path: ["desde"] });
export type ConsultaDeVentasDto = z.infer<typeof ConsultaDeVentasSchema>;

/** De qué es una venta: la cuenta en que se cobró (B11-1). */
export const OrigenDeVentaSchema = z.enum(["PARQUE", "RESTAURANTE", "MOSTRADOR", "CUMPLEANOS"]);
export type OrigenDeVenta = z.infer<typeof OrigenDeVentaSchema>;

/** Quién y cuándo pidió un informe, y de qué local: va en el encabezado de su PDF. */
export const EncabezadoDeInformeSchema = z.object({
  local: z.string(),
  generadoEn: TimestampSchema,
  generadoPor: z.string(),
});

/**
 * El informe de ventas de un periodo (B11-1, F9-01). Lo vendido sale de las ventas; lo cobrado, del libro de pagos,
 * cada medio en su moneda y llevado a dólares con la tasa con que se cobró cada asiento. Por turno, con su cuadre
 * contra el Z: un turno sellado que no da lo mismo que su Z se ve.
 */
export const InformeDeVentasSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  periodo: z.object({ desde: FechaSchema, hasta: FechaSchema }),
  /** Si se pidió solo lo de una cajera. */
  cajera: z.object({ id: IdSchema, nombre: z.string() }).nullable(),
  resumen: z.object({
    /** Las ventas cobradas, sin las anuladas. */
    ventas: z.number().int().nonnegative(),
    /** Lo vendido (sin las anuladas), en dólares. */
    vendido: MoneySchema,
    igtf: MoneySchema,
    anuladas: z.number().int().nonnegative(),
    /** Lo que se anuló, en dólares. */
    anulado: MoneySchema,
    desdePapel: z.number().int().nonnegative(),
    turnos: z.number().int().nonnegative(),
    /** Turnos del periodo que todavía no tienen su Z: sus cifras pueden cambiar. */
    turnosSinZ: z.number().int().nonnegative(),
    /** Lo cobrado por todos los medios, en dólares con la tasa de cada cobro; `null` si algo en bolívares no tiene tasa. */
    cobradoEnDolares: MoneySchema.nullable(),
  }),
  porMedio: z.array(
    z.object({
      medio: z.string(),
      nombre: z.string(),
      moneda: z.enum(["USD", "VES", "USDT"]),
      cobrado: MoneySchema,
      vuelto: MoneySchema,
      neto: MoneySchema,
      /** Lo neto en dólares, con la tasa con que se cobró cada asiento; `null` si alguno no tiene tasa. */
      enDolares: MoneySchema.nullable(),
    }),
  ),
  porOrigen: z.array(z.object({ origen: OrigenDeVentaSchema, ventas: z.number().int().nonnegative(), vendido: MoneySchema })),
  porCajera: z.array(z.object({ cajera: z.string(), ventas: z.number().int().nonnegative(), vendido: MoneySchema, anuladas: z.number().int().nonnegative() })),
  porTurno: z.array(
    z.object({
      id: IdSchema,
      dia: FechaSchema,
      punto: z.string(),
      abrio: z.string(),
      abierto: TimestampSchema,
      cerrado: TimestampSchema.nullable(),
      estado: z.enum(["ABIERTO", "EN_CIERRE", "CERRADO_Z"]),
      ventas: z.number().int().nonnegative(),
      anuladas: z.number().int().nonnegative(),
      vendido: MoneySchema,
      /** Con su Z: si da lo mismo que el Z y, si no, qué no cuadra. Sin Z, `SIN_Z`. */
      cuadre: z.object({ estado: z.enum(["CUADRA", "NO_CUADRA", "SIN_Z"]), diferencias: z.array(z.string()) }),
    }),
  ),
  anuladas: z.array(
    z.object({
      orden: z.number().int().positive(),
      cobradaEn: TimestampSchema,
      anuladaEn: TimestampSchema,
      cajera: z.string(),
      total: MoneySchema,
      motivo: z.string(),
      autorizadoPor: z.string(),
    }),
  ),
  /** Las cajeras que abrieron turno en el periodo, para el filtro. */
  cajeras: z.array(z.object({ id: IdSchema, nombre: z.string() })),
});
export type InformeDeVentasDto = z.infer<typeof InformeDeVentasSchema>;
