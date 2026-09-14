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

const Persona = z.object({ id: IdSchema, name: z.string().max(80) });

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

/**
 * Un pago de la venta, con lo que se devolvería si se anula (DEC-24).
 *
 * `refundable` lo calcula el dominio al CERRAR el cobro (`refundableByTender`),
 * con la tasa congelada de ese momento: el vuelto, la propina y el residuo no
 * se devuelven. Guardarlo aquí evita recalcular mañana con otra tasa.
 */
export const PagoDeVentaSchema = z.object({
  methodCode: IdSchema,
  label: z.string().max(40),
  /** Efectivo: el único medio que puede devolverse en la gaveta. */
  cash: z.boolean(),
  /** Qué dato identifica el pago (y su devolución); `null` en efectivo. */
  dataKind: z.enum(["PAGO_MOVIL", "ZELLE", "USDT", "PUNTO"]).nullable(),
  paid: MoneySchema,
  refundable: MoneySchema,
});
export type PagoDeVentaDto = z.infer<typeof PagoDeVentaSchema>;

/** Motivos de lista cerrada (§7.3). «Otro» exige explicarlo. */
export const MotivoAnulacionSchema = z.enum(["ERROR_EN_COBRO", "CLIENTE_DESISTIO", "NO_ENTREGADO", "OTRO"], {
  error: "Elige el motivo",
});
export type MotivoAnulacion = z.infer<typeof MotivoAnulacionSchema>;

/**
 * La anulación de un cobro — DEC-24.
 *
 * No borra ni cambia la venta: se le AÑADE, una sola vez, como asiento de
 * reversión (regla 5). Dice quién la pidió, quién la autorizó, por qué y cómo
 * volvió el dinero de cada pago.
 *
 * Reglas de forma, para que una anulación incompleta no se pueda expresar:
 *  · autoriza un supervisor o el administrador;
 *  · devolver por el mismo medio un pago electrónico exige su referencia (la
 *    aprobación de la anulación en el terminal, en el punto);
 *  · devolver en efectivo lo que no entró en efectivo exige explicarlo, igual
 *    que el motivo «Otro».
 */
export const AnulacionSchema = z
  .object({
    at: TimestampSchema,
    requestedBy: Persona.nullable(),
    authorizedBy: Persona.extend({ role: z.enum(["ADMIN", "SUPERVISOR"]) }),
    reason: MotivoAnulacionSchema,
    note: z.string().trim().max(200).optional(),
    refunds: z
      .array(
        z.object({
          /** Índice del pago en `payments`. */
          paymentIndex: z.number().int().nonnegative(),
          via: z.enum(["MISMO_MEDIO", "EFECTIVO"]),
          amount: MoneySchema,
          reference: z.string().trim().max(40).nullable(),
        }),
      )
      .min(1),
  })
  .superRefine((a, ctx) => {
    const nota = (a.note ?? "").length >= 5;
    if (a.reason === "OTRO" && !nota) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Explica el motivo en unas palabras" });
    }
    a.refunds.forEach((r, i) => {
      if (r.via === "MISMO_MEDIO" && r.reference !== null && r.reference.length < 4) {
        ctx.addIssue({ code: "custom", path: ["refunds", i, "reference"], message: "Referencia demasiado corta" });
      }
    });
  });
export type AnulacionDto = z.infer<typeof AnulacionSchema>;

export const VentaCerradaSchema = z.object({
  id: IdSchema,
  orderNumber: z.number().int().positive().optional(),
  accountId: IdSchema,
  closedAt: TimestampSchema,
  cashier: z.object({ id: IdSchema, name: Texto(80) }).nullable(),
  total: MoneySchema,
  /** Nombres de los medios usados, para buscar y filtrar sin abrir el recibo. */
  methods: z.array(Texto(40)).min(1),
  payments: z.array(PagoDeVentaSchema).min(1),
  /** Las líneas de la cuenta que pagó esta venta: vuelven a «por cobrar» si se anula. */
  lineIds: z.array(IdSchema).min(1),
  recibo: ReciboSchema,
  prints: z.array(ImpresionSchema),
  voided: AnulacionSchema.optional(),
})
  .superRefine((v, ctx) => {
    const a = v.voided;
    if (!a) return;
    // Cada pago se devuelve una vez, por lo que se puede devolver y en su moneda.
    const vistos = new Set<number>();
    a.refunds.forEach((r, i) => {
      const p = v.payments[r.paymentIndex];
      const ruta = ["voided", "refunds", i];
      if (!p) {
        ctx.addIssue({ code: "custom", path: ruta, message: "La devolución apunta a un pago que no existe" });
        return;
      }
      if (vistos.has(r.paymentIndex)) {
        ctx.addIssue({ code: "custom", path: ruta, message: "Ese pago ya tiene su devolución" });
      }
      vistos.add(r.paymentIndex);
      if (r.amount.currency !== p.refundable.currency || r.amount.minor !== p.refundable.minor) {
        ctx.addIssue({ code: "custom", path: ruta, message: "Se devuelve exactamente lo que quedó de ese pago, en su moneda" });
      }
      if (!p.cash && r.via === "MISMO_MEDIO" && !r.reference) {
        ctx.addIssue({
          code: "custom",
          path: [...ruta, "reference"],
          message: p.dataKind === "PUNTO" ? "Escribe la aprobación de la anulación en el terminal" : "Escribe la referencia de la devolución",
        });
      }
      if (!p.cash && r.via === "EFECTIVO" && (a.note ?? "").length < 5) {
        ctx.addIssue({ code: "custom", path: ["voided", "note"], message: "Devolver en efectivo lo que no entró en efectivo exige explicarlo" });
      }
    });
    const conDevolucion = v.payments.filter((p) => BigInt(p.refundable.minor) > 0n).length;
    if (vistos.size !== conDevolucion) {
      ctx.addIssue({ code: "custom", path: ["voided", "refunds"], message: "Cada pago con algo que devolver necesita su devolución" });
    }
  });
export type VentaCerradaDto = z.infer<typeof VentaCerradaSchema>;
