/**
 * El cobro en curso, guardado como borrador de la cuenta — B3-13, M-34 (S-6).
 *
 * En el local, lo que la cajera llevaba escrito de un cobro (un Pago Móvil con su referencia, el efectivo…) se perdía
 * al cambiar de cuenta, de pestaña o al recargar; con un pago electrónico ya hecho, eso es cobrar dos veces. El
 * borrador vive en el servidor, cifrado como los datos de los pagos (B3-2): aguanta cambiar de cuenta, recargar, un
 * corte de luz y abrir la cuenta en otro equipo de caja. **No es un pago:** no entra en el libro, ni en el corte, ni en
 * Reportes; cobrar lo borra.
 */
import { z } from "zod";
import { ClienteFacturaSchema } from "./documento.ts";
import { DatosDePagoSchema } from "./pagos.ts";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/** Lo que se lleva de un cobro: los pagos con sus datos, la tasa con que se congeló, el vuelto, la factura y el recibo. */
export const BorradorDeCobroSchema = z.object({
  pagos: z
    .array(
      z.object({
        /** El código del medio de pago (B3-2). */
        medio: IdSchema,
        amount: MoneySchema,
        datos: DatosDePagoSchema.optional(),
      }),
    )
    .max(20, "Demasiados pagos en un cobro"),
  /** La tasa del cobro (ADR-005): con el primer pago se congela, y quien lo retome sigue con ella. */
  tasa: z.object({ id: IdSchema, valor: z.string().trim().min(1).max(24) }).nullable(),
  destinoVuelto: z.enum(["VUELTO", "PROPINA", "CAJA"]),
  cliente: ClienteFacturaSchema,
  imprimirRecibo: z.boolean(),
});
export type BorradorDeCobroDto = z.infer<typeof BorradorDeCobroSchema>;

/**
 * Guardar el borrador de una cuenta. `version`: la del borrador que se tenía a la vista (`null` si no había); si otro
 * equipo lo cambió entretanto, choca. Sin pagos, el borrador se borra.
 */
export const GuardarBorradorCommandSchema = z.strictObject({
  accountId: IdSchema,
  version: z.number().int().positive().nullable(),
  borrador: BorradorDeCobroSchema,
});
export type GuardarBorradorCommand = z.infer<typeof GuardarBorradorCommandSchema>;

/** Descartar el borrador de una cuenta (el de otra persona, con su asiento). */
export const DescartarBorradorCommandSchema = z.strictObject({ accountId: IdSchema });

/** Un borrador como lo lee la caja: de quién es, desde qué equipo, cuándo y su versión. */
export const BorradorGuardadoSchema = z.object({
  accountId: IdSchema,
  version: z.number().int().positive(),
  por: z.string(),
  porId: IdSchema.nullable(),
  deviceId: IdSchema.nullable(),
  en: TimestampSchema,
  borrador: BorradorDeCobroSchema,
});
export type BorradorGuardadoDto = z.infer<typeof BorradorGuardadoSchema>;
