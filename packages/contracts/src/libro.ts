/**
 * El libro de pagos en el cable — §5.5, F3-09, F3-10 (B2-3).
 *
 * Lo que manda quien cobra: QUÉ se asienta (tipo, medio, importe y la tasa que cita). Lo que no
 * manda: quién, cuándo, el valor de la tasa ni el IGTF; eso lo pone el servidor (ADR-017). La
 * clave de idempotencia es de la operación entera: un doble clic o un reintento tras un corte de
 * red devuelven los mismos asientos, nunca unos nuevos (I-11).
 */
import { z } from "zod";
import { FechaSchema, IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";
import { MotivoAnulacionSchema } from "./ventas.ts";

export const TipoAsientoSchema = z.enum(["COBRO", "VUELTO", "PROPINA", "RESIDUO"]);
export type TipoAsiento = z.infer<typeof TipoAsientoSchema>;

/** Los medios del libro (§5.5). Cada uno tiene su moneda: no se elige al asentar. */
export const MetodoLibroSchema = z.enum(["EFECTIVO_USD", "EFECTIVO_VES", "PAGO_MOVIL", "PDV_DEBITO", "PDV_CREDITO", "USDT", "ZELLE"]);
export type MetodoLibro = z.infer<typeof MetodoLibroSchema>;

const MONEDA_DEL_METODO: Readonly<Record<MetodoLibro, "USD" | "VES" | "USDT">> = {
  EFECTIVO_USD: "USD",
  EFECTIVO_VES: "VES",
  PAGO_MOVIL: "VES",
  PDV_DEBITO: "VES",
  PDV_CREDITO: "VES",
  USDT: "USDT",
  ZELLE: "USD",
};

/** Un asiento por asentar. El importe es positivo; el signo contrario es solo de una reversión. */
export const AsientoNuevoSchema = z
  .strictObject({
    kind: TipoAsientoSchema,
    method: MetodoLibroSchema,
    amount: MoneySchema,
    /** La tasa congelada que se cita: obligatoria en bolívares. Su valor lo copia el servidor. */
    rateId: z.uuid().optional(),
  })
  .refine((a) => /^\d+$/.test(a.amount.minor) && BigInt(a.amount.minor) > 0n, {
    message: "El importe de un asiento es positivo",
    path: ["amount", "minor"],
  })
  .refine((a) => a.amount.currency === MONEDA_DEL_METODO[a.method], {
    message: "El importe va en la moneda del medio",
    path: ["amount", "currency"],
  })
  .refine((a) => (a.amount.currency === "VES") === (a.rateId !== undefined), {
    // Bolívares sin tasa congelada no se pueden sumar (ADR-005); dólares o USDT con tasa, tampoco
    // tienen sentido: el USDT va a la par (DEC-1).
    message: "Un asiento en bolívares cita su tasa; uno en dólares o USDT, ninguna",
    path: ["rateId"],
  });
export type AsientoNuevoDto = z.infer<typeof AsientoNuevoSchema>;

/** Asentar los asientos de un cobro, todos o ninguno. */
export const AsentarPagosCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  /** El documento al que se aplican (la cuenta o venta; su tabla llega con B3-3). */
  documentId: z.uuid(),
  asientos: z.array(AsientoNuevoSchema).min(1, "Hace falta al menos un asiento").max(20),
});
export type AsentarPagosCommand = z.infer<typeof AsentarPagosCommandSchema>;

/** Revertir un asiento: se añade otro con el signo contrario (F3-10). Nunca se edita el original. */
export const RevertirPagoCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    paymentId: z.uuid(),
    motivo: MotivoAnulacionSchema,
    detalle: z.string().trim().max(280).optional(),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, {
    message: "«Otro» exige explicarlo",
    path: ["detalle"],
  });
export type RevertirPagoCommand = z.infer<typeof RevertirPagoCommandSchema>;

export const AsientoSchema = z.object({
  id: IdSchema,
  documentId: IdSchema,
  kind: TipoAsientoSchema,
  method: MetodoLibroSchema,
  /** Con signo: negativo en una reversión. */
  amount: MoneySchema,
  igtf: MoneySchema,
  /** La tasa congelada del asiento: la que regía al cobrar, no la de hoy (ADR-005). */
  rate: z.object({ id: IdSchema, value: z.string() }).nullable(),
  reversesId: IdSchema.nullable(),
  /** Si ya se revirtió, con qué asiento. */
  reversedById: IdSchema.nullable(),
  motivo: MotivoAnulacionSchema.nullable(),
  detalle: z.string().nullable(),
  recordedAt: TimestampSchema,
  /**
   * El día de negocio del turno en que se asentó (ADR-009, F3-11): un cobro a la 1:30 am cuenta en
   * el día del turno que lo generó. Los reportes agrupan por él, nunca por la fecha de `recordedAt`.
   */
  businessDate: FechaSchema,
  recordedBy: z.string().trim().min(2).max(80),
  authorizedBy: z.string().trim().min(2).max(80).nullable(),
});
export type AsientoDto = z.infer<typeof AsientoSchema>;

/** El libro de un documento y su saldo, calculado (nunca guardado), en la moneda funcional. */
export const LibroDocumentoSchema = z.object({
  documentId: IdSchema,
  asientos: z.array(AsientoSchema),
  cobrado: MoneySchema,
  vuelto: MoneySchema,
  propina: MoneySchema,
  residuo: MoneySchema,
  aplicado: MoneySchema,
  igtf: MoneySchema,
});
export type LibroDocumentoDto = z.infer<typeof LibroDocumentoSchema>;
