/**
 * El consumo del personal — B3-17 (M-37).
 *
 * Lo que consume una persona del equipo se cobra con el medio «Consumo del personal»: la cajera elige a la persona (las
 * del local, no la cuenta de soporte) y esta firma con su propio PIN. A precio normal, en dólares; sale del inventario y
 * no entra dinero. Queda su vale, que se imprime para su firma y se queda en la caja. Sin tope ni «descontado»: el
 * descuento del sueldo se hace fuera del sistema.
 *
 * Los vales se ven por quincena: supervisión y administración, los de todos; cada persona, los suyos con su PIN.
 */
import { z } from "zod";
import { FechaSchema, MoneySchema, TimestampSchema } from "./primitives.ts";
import { EncabezadoDeInformeSchema, MAX_DIAS_DE_INFORME } from "./reportes.ts";
import { MovimientoDeEfectivoSchema } from "./efectivo.ts";
import { FirmaDeLaPersonaSchema } from "./identity.ts";

/** El código del medio: el mismo que `CONSUMO_DEL_PERSONAL` de `@l2/domain-cash`. */
export const MEDIO_CONSUMO_DEL_PERSONAL = "CONSUMO_PERSONAL";

/** Una persona del local que puede consumir (sin la cuenta de soporte). */
export const PersonaDelLocalSchema = z.object({ id: z.uuid(), nombre: z.string(), rol: z.string() });
export type PersonaDelLocalDto = z.infer<typeof PersonaDelLocalSchema>;

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;

/** Pedir los vales de un periodo: todos (supervisión y administración) o los de una persona, con su PIN. */
export const ConsultaDeValesSchema = z
  .strictObject({ desde: FechaSchema, hasta: FechaSchema, persona: FirmaDeLaPersonaSchema.optional() })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] })
  .refine((p) => dias(p.desde, p.hasta) <= MAX_DIAS_DE_INFORME, { message: `Hasta ${MAX_DIAS_DE_INFORME} días: parte el periodo`, path: ["desde"] });
export type ConsultaDeValesDto = z.infer<typeof ConsultaDeValesSchema>;

/** Un vale: lo que consumió una persona en un cobro, con su total, y si se anuló o se devolvió algo. */
export const ValeSchema = z.object({
  id: z.uuid(),
  saleId: z.uuid(),
  orderNumber: z.number().int().nonnegative(),
  dia: FechaSchema,
  en: TimestampSchema,
  persona: z.object({ id: z.uuid(), nombre: z.string() }),
  /** Quién lo cobró. */
  cajera: z.string(),
  lineas: z.array(z.object({ concepto: z.string(), monto: MoneySchema, cortesia: z.boolean() })),
  total: MoneySchema,
  /** La venta se anuló (B3-18): el vale no cuenta. */
  anulado: z.boolean(),
  /** Lo devuelto de esta venta (B3-14): se resta de lo que debe. */
  devuelto: MoneySchema,
  /** Lo que cuenta: el total menos lo devuelto; cero si se anuló. */
  neto: MoneySchema,
  /** El vale anulado desde Deudas → Personal (B3-26): cuándo, quién lo autorizó y si algo salió como merma. */
  anulacion: z.object({ en: TimestampSchema, por: z.string(), merma: z.boolean() }).nullable().default(null),
});
export type ValeDto = z.infer<typeof ValeSchema>;

/**
 * «Descontado en la quincena» (B3-26): el periodo, cuándo y quién lo marcó, y lo que se descontó con esa marca. Lo que se
 * registró en la quincena después de la marca (`despues`) sigue pendiente, y se descuenta con otra.
 */
export const DescuentoDeQuincenaSchema = z.object({
  desde: FechaSchema,
  hasta: FechaSchema,
  en: TimestampSchema,
  por: z.string(),
  consumido: MoneySchema,
  adelantado: MoneySchema,
  despues: MoneySchema.default({ minor: "0", currency: "USD" }),
});
export type DescuentoDeQuincenaDto = z.infer<typeof DescuentoDeQuincenaSchema>;

/** Marcar «Descontado en la quincena» a una persona y un periodo (B3-26): administración, con su PIN. */
export const DescontarQuincenaCommandSchema = z
  .strictObject({ idempotencyKey: z.uuid(), persona: z.uuid("Persona desconocida"), desde: FechaSchema, hasta: FechaSchema })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] });
export type DescontarQuincenaCommand = z.infer<typeof DescontarQuincenaCommandSchema>;

/**
 * Anular un vale (B3-26), de cualquier día: no movió dinero. Lo de cada línea vuelve al estante, o sale como merma la de
 * los índices de `aMerma`. Administración, con su PIN.
 */
export const AnularValeCommandSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  valeId: z.uuid("Vale desconocido"),
  aMerma: z.array(z.number().int().min(0)).max(100).default([]),
  nota: z.string().trim().max(120).optional(),
});
export type AnularValeCommand = z.infer<typeof AnularValeCommandSchema>;

/** Los vales de un periodo y lo de cada persona. */
export const ValesDelPersonalSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  periodo: z.object({ desde: FechaSchema, hasta: FechaSchema }),
  /** Todos los de la sucursal, o los de una sola persona (la que puso su PIN). */
  alcance: z.enum(["TODOS", "PERSONA"]),
  porPersona: z.array(
    z.object({
      persona: z.object({ id: z.uuid(), nombre: z.string() }),
      vales: z.number().int(),
      neto: MoneySchema,
      /** Los adelantos de efectivo de la quincena (B3-21), en dólares. */
      adelantado: MoneySchema.default({ minor: "0", currency: "USD" }),
      /** Ya se descontó de su quincena (B3-26): deja de estar pendiente. */
      descontado: DescuentoDeQuincenaSchema.nullable().default(null),
    }),
  ),
  vales: z.array(ValeSchema),
  total: MoneySchema,
  /** Los adelantos de efectivo del periodo (B3-21): cada uno, de quién y por cuánto. */
  adelantos: z.array(MovimientoDeEfectivoSchema).default([]),
});
export type ValesDelPersonalDto = z.infer<typeof ValesDelPersonalSchema>;

/** Reimprimir un vale. */
export const ReimprimirValeCommandSchema = z.strictObject({ valeId: z.uuid("Vale desconocido") });
export type ReimprimirValeCommand = z.infer<typeof ReimprimirValeCommandSchema>;
