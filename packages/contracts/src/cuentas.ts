/**
 * Las cuentas en el servidor — B3-3, DEC-21, F4-03, F4-04b, F4-04c, §5.6.
 *
 * Tres mandos, y en cada uno el servidor decide lo que es suyo:
 *
 *  · **Guardar** una cuenta: la pantalla manda la cuenta como la dejó (abrir, añadir, salir, mover a
 *    una mesa, dividir, regalar). El servidor la compara con la que tiene y rechaza lo que solo él
 *    hace: marcar pagado, tocar una línea pagada, quitar lo consumido o poner a un producto otro
 *    precio que el del catálogo. El número de orden, la hora de apertura y la de entrada a la cola
 *    los pone él.
 *  · **Cobrar**: la pantalla dice qué líneas cobra, con qué pagos y a qué total llegó. El servidor
 *    recalcula el total con el IVA y el IGTF del instante, exige la tasa vigente, rechaza lo que no
 *    cuadra al céntimo y lo asienta en el libro, en la misma transacción que marca las líneas pagadas.
 *  · **Anular** un cobro: revierte sus asientos en el libro (con la autorización 🔐 comprobada en el
 *    servidor) y devuelve las líneas a la cola.
 */
import { z } from "zod";
import { FamilyAccountSchema, MotivoAnulacionPedidoSchema, MotivoCortesiaSchema } from "./account.ts";
import { ClienteFacturaSchema } from "./documento.ts";
import { LibroDocumentoSchema } from "./libro.ts";
import { CodigoMedioSchema } from "./medios.ts";
import { DatosDePagoSchema } from "./pagos.ts";
import { IdSchema, IdempotencyKeySchema, MoneySchema } from "./primitives.ts";
import { DestinoSobraSchema, DevolucionSchema, MotivoAnulacionSchema, VentaCerradaSchema } from "./ventas.ts";

/** Las cuentas que ve una estación: las abiertas y las cobradas del día. */
export const CuentasDelLocalSchema = z.object({
  cuentas: z.array(FamilyAccountSchema),
});
export type CuentasDelLocalDto = z.infer<typeof CuentasDelLocalSchema>;

/**
 * Guardar una cuenta. Sin `version`, es nueva: su identificador (un UUID que genera la pantalla,
 * para que un reintento no abra dos) no puede existir. Con `version`, tiene que ser la última: si
 * otro equipo guardó antes, el servidor responde CONFLICTO con la que tiene.
 */
export const GuardarCuentaCommandSchema = z.strictObject({
  cuenta: FamilyAccountSchema.refine((c) => z.uuid().safeParse(c.id).success, {
    message: "Una cuenta nueva lleva un identificador UUID",
    path: ["id"],
  }),
});
export type GuardarCuentaCommand = z.infer<typeof GuardarCuentaCommandSchema>;

/** Un pago del cobro, como lo tecleó la caja. Su IGTF y su tasa los pone el servidor. */
export const PagoDelCobroSchema = z.strictObject({
  method: CodigoMedioSchema,
  amount: MoneySchema.refine((m) => /^\d+$/.test(m.minor) && BigInt(m.minor) > 0n, "Un pago es mayor que cero"),
  datos: DatosDePagoSchema.optional(),
});
export type PagoDelCobroDto = z.infer<typeof PagoDelCobroSchema>;

/**
 * Cobrar una cuenta (o una parte, si está dividida).
 *
 * `lineIds` y `total` son lo que la pantalla enseñaba al cobrar: si la cuenta cambió o el servidor
 * llega a otro total (una alícuota nueva, otra tasa), no se cobra algo distinto de lo que vio el
 * cliente: se rechaza y la pantalla vuelve a calcular. `rateId` es la tasa congelada del cobro
 * (ADR-005), obligatoria con pagos en bolívares.
 */
export const CobrarCuentaCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    lineIds: z.array(IdSchema).max(500),
    total: MoneySchema,
    pagos: z.array(PagoDelCobroSchema).max(20),
    rateId: z.uuid().optional(),
    destinoSobra: DestinoSobraSchema,
    /** A quién sale la factura (DEC-23); sin decirlo, consumidor final. */
    cliente: ClienteFacturaSchema.optional(),
  })
  .refine((c) => !c.pagos.some((p) => p.amount.currency === "VES") || c.rateId !== undefined, {
    message: "Un cobro en bolívares cita su tasa",
    path: ["rateId"],
  });
export type CobrarCuentaCommand = z.infer<typeof CobrarCuentaCommandSchema>;

/** Lo que devuelve un cobro o una anulación: la cuenta como quedó, su libro y la venta (B3-4). */
export const CuentaYLibroSchema = z.object({
  cuenta: FamilyAccountSchema,
  libro: LibroDocumentoSchema,
  venta: VentaCerradaSchema,
});
export type CuentaYLibroDto = z.infer<typeof CuentaYLibroSchema>;

/**
 * Anular un cobro (DEC-24): se revierten sus asientos, cada uno con otro de signo contrario, y las
 * líneas que pagó vuelven a la cola. `cobroKey` es la clave con la que se cobró.
 */
export const AnularCobroCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    cobroKey: IdempotencyKeySchema,
    motivo: MotivoAnulacionSchema,
    detalle: z.string().trim().max(280).optional(),
    /** Cómo vuelve el dinero de cada pago con algo que devolver (DEC-24). */
    devoluciones: z.array(DevolucionSchema).max(20),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, {
    message: "«Otro» exige explicarlo",
    path: ["detalle"],
  })
  .refine((c) => new Set(c.devoluciones.map((d) => d.paymentIndex)).size === c.devoluciones.length, {
    message: "Cada pago se devuelve una vez",
    path: ["devoluciones"],
  });
export type AnularCobroCommand = z.infer<typeof AnularCobroCommandSchema>;

/**
 * Regalar una línea de la cuenta, o dejar de regalarla (F6-14, B3-4). Lo autoriza quien puede dar
 * cortesías, con su PIN, y el servidor pone quién y cuándo: la pantalla ya no lo declara.
 */
export const CortesiaCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    lineId: IdSchema,
    quitar: z.boolean(),
    motivo: MotivoCortesiaSchema.optional(),
    detalle: z.string().trim().max(120).optional(),
  })
  .refine((c) => c.quitar || c.motivo !== undefined, { message: "Elige el motivo de la cortesía", path: ["motivo"] })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, { message: "Con «Otro» hay que explicar la cortesía", path: ["detalle"] });
export type CortesiaCommand = z.infer<typeof CortesiaCommandSchema>;

/**
 * Anular un plato de un pedido ya enviado a cocina (F6-14, B6-3). A diferencia de la cortesía, no
 * tiene vuelta: lo anulado por error se vuelve a pedir, no se «desanula».
 */
export const AnularPedidoCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    lineId: IdSchema,
    motivo: MotivoAnulacionPedidoSchema,
    detalle: z.string().trim().max(120).optional(),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, { message: "Con «Otro» hay que explicar la anulación", path: ["detalle"] });
export type AnularPedidoCommand = z.infer<typeof AnularPedidoCommandSchema>;

/**
 * Liberar una mesa sin nada que cobrar (B6-5, M-18): la cuenta se cierra «sin consumo». Sin PIN; la
 * versión es la que vio la tablet, para no cerrar una cuenta a la que otro equipo le acaba de pedir algo.
 */
export const LiberarMesaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  accountId: z.uuid("Cuenta desconocida"),
  version: z.number().int().positive(),
});
export type LiberarMesaCommand = z.infer<typeof LiberarMesaCommandSchema>;
