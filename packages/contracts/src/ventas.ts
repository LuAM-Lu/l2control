/**
 * Una venta cerrada y su recibo — UX-MEJORAS §9 (C8, C12), DEC-24.
 *
 * El recibo NO fiscal se guarda como FOTO del momento del cobro, con los
 * textos ya formateados: si mañana cambia una tasa, un precio o un nombre del
 * catálogo, la copia sigue diciendo lo que se cobró. Por eso son cadenas y no
 * montos que se recalculan.
 *
 * La venta sí guarda su total como dinero, para sumar el turno.
 *
 * APPEND-ONLY (regla 5): cada impresión es una entrada nueva en `prints`,
 * nunca un contador que se sobrescribe. La primera es el original; las
 * siguientes, copias. Reimprimir es vector de fraude (§5.4): queda quién y
 * cuándo.
 *
 * ⚠ §7.6: `recibo` lleva las referencias de pago y el documento del cliente
 * ya enmascarados.
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

const Texto = (max: number) => z.string().max(max);

export const ReciboSchema = z.object({
  orden: Texto(16),
  cuenta: Texto(120),
  cuando: Texto(40),
  facturaA: Texto(160),
  lineas: z.array(z.object({ cantidad: z.number().int().positive(), concepto: Texto(80), importe: Texto(24) })).min(1),
  subtotal: Texto(24),
  impuestos: z.array(z.object({ etiqueta: Texto(24), monto: Texto(24) })),
  total: Texto(24),
  totalBs: Texto(32).nullable(),
  tasa: Texto(24).nullable(),
  pagos: z.array(z.object({ medio: Texto(40), detalle: Texto(80).nullable(), monto: Texto(32) })).min(1),
  vuelto: Texto(24).nullable(),
  destinoVuelto: Texto(24).nullable(),
  cajera: Texto(80).nullable(),
  telefono: Texto(20).nullable(),
});
export type ReciboDto = z.infer<typeof ReciboSchema>;

export const ImpresionSchema = z.object({
  at: TimestampSchema,
  /** Quién imprimió. `null` si no había sesión identificada. */
  by: z.object({ id: IdSchema, name: Texto(80) }).nullable(),
});
export type ImpresionDto = z.infer<typeof ImpresionSchema>;

export const VentaCerradaSchema = z.object({
  id: IdSchema,
  orderNumber: z.number().int().positive().optional(),
  accountId: IdSchema,
  closedAt: TimestampSchema,
  cashier: z.object({ id: IdSchema, name: Texto(80) }).nullable(),
  total: MoneySchema,
  /** Nombres de los medios usados, para buscar y filtrar sin abrir el recibo. */
  methods: z.array(Texto(40)).min(1),
  recibo: ReciboSchema,
  prints: z.array(ImpresionSchema),
});
export type VentaCerradaDto = z.infer<typeof VentaCerradaSchema>;
