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
import { FirmaDeLaPersonaSchema, MEDIO_CONSUMO_DEL_PERSONAL } from "./consumo.ts";
import { CodigoMedioSchema } from "./medios.ts";
import { DatosDePagoSchema } from "./pagos.ts";
import { IdSchema, IdempotencyKeySchema, MoneySchema } from "./primitives.ts";
import { DestinoDevueltoSchema, DestinoSobraSchema, DevolucionSchema, MotivoAnulacionSchema, VentaCerradaSchema } from "./ventas.ts";

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
 * Una parte del vuelto (B3-19, M-37): de qué medio sale y cuánto vale en dólares (los bolívares los calcula el servidor a
 * la tasa del cobro). Por Pago Móvil, la referencia del envío y el banco del cliente.
 */
export const ParteDelVueltoSchema = z
  .strictObject({
    method: z.enum(["EFECTIVO_USD", "EFECTIVO_VES", "PAGO_MOVIL"]),
    enDolares: MoneySchema,
    referencia: z.string().regex(/^\d{4,20}$/, "La referencia del Pago Móvil, de 4 a 20 cifras").optional(),
    banco: z.string().regex(/^\d{4}$/, "El banco del cliente").optional(),
  })
  .refine((p) => p.enDolares.currency === "USD", { message: "La parte va en dólares", path: ["enDolares"] })
  .refine((p) => p.method !== "PAGO_MOVIL" || (p.referencia !== undefined && p.banco !== undefined), {
    message: "Un vuelto por Pago Móvil lleva su referencia y el banco",
    path: ["referencia"],
  });
export type ParteDelVueltoDto = z.infer<typeof ParteDelVueltoSchema>;

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
    /**
     * Imprimir el recibo al cerrar (B3-8, M-27, P-5), en la misma transacción del cobro. Sin decirlo, no se
     * imprime: es lo que hacía la caja antes, y el recibo se saca después desde Ventas.
     */
    imprimirRecibo: z.boolean().optional(),
    /** Cómo se da el vuelto (B3-19), por partes que suman lo que sobra. Sin decirlo, todo en efectivo $, como antes. */
    vuelto: z.array(ParteDelVueltoSchema).min(1).max(3).optional(),
    /**
     * El consumo del personal (B3-17): quién consumió, con su PIN. Su único pago es «Consumo del personal», por el total;
     * sin vuelto. Queda su vale y se imprime para su firma.
     */
    personal: FirmaDeLaPersonaSchema.optional(),
  })
  .refine((c) => (c.personal !== undefined) === c.pagos.some((p) => p.method === MEDIO_CONSUMO_DEL_PERSONAL), {
    message: "El consumo del personal lo firma con su PIN quien consumió",
    path: ["personal"],
  })
  .refine((c) => c.personal === undefined || (c.pagos.length === 1 && c.vuelto === undefined), {
    message: "El consumo del personal es el único pago de su cobro",
    path: ["pagos"],
  })
  .refine((c) => !c.pagos.some((p) => p.amount.currency === "VES") || c.rateId !== undefined, {
    message: "Un cobro en bolívares cita su tasa",
    path: ["rateId"],
  })
  .refine((c) => !c.vuelto?.some((p) => p.method !== "EFECTIVO_USD") || c.rateId !== undefined, {
    message: "Un vuelto en bolívares cita la tasa del cobro",
    path: ["rateId"],
  })
  .refine((c) => c.vuelto === undefined || c.destinoSobra === "VUELTO", {
    message: "Cómo se da el vuelto, solo si lo que sobra es vuelto",
    path: ["vuelto"],
  });
export type CobrarCuentaCommand = z.infer<typeof CobrarCuentaCommandSchema>;

/** Lo que devuelve un cobro o una anulación: la cuenta como quedó, su libro y la venta (B3-4). */
export const CuentaYLibroSchema = z.object({
  cuenta: FamilyAccountSchema,
  libro: LibroDocumentoSchema,
  venta: VentaCerradaSchema,
  /**
   * Se pidió imprimir el recibo y no salió (B3-8): por qué. El cobro quedó cerrado igual (un recibo no
   * detiene un cobro); se imprime después desde Ventas.
   */
  reciboNoImpreso: z.string().optional(),
  /** El vale del consumo del personal no salió (B3-17): por qué. El cobro quedó cerrado; se reimprime desde Caja → Personal. */
  valeNoImpreso: z.string().optional(),
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
    /**
     * Qué pasa con la cuenta (B3-18): «Cobrarla de nuevo» vuelve a la cola para corregir el medio o el monto (como
     * antes); «Anular la venta entera» la cierra con su motivo, y lo que tiene inventario vuelve al estante o a merma.
     */
    camino: z.enum(["COBRAR_DE_NUEVO", "ANULAR_VENTA"]).default("COBRAR_DE_NUEVO"),
    inventario: DestinoDevueltoSchema.default("ESTANTE"),
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
    /** Los platos que se anulan, todos del mismo pedido (B6-6): una anulación, un papel «ANULAR». */
    lineIds: z
      .array(IdSchema)
      .min(1, "Elige qué platos se anulan")
      .max(40)
      .refine((ids) => new Set(ids).size === ids.length, "Un plato se anula una vez"),
    motivo: MotivoAnulacionPedidoSchema,
    detalle: z.string().trim().max(120).optional(),
    /** ¿La cocina ya lo preparó? Decide el inventario (B6-6, M-18): no, vuelve al estante; sí, es merma. */
    preparado: z.boolean({ error: "Di si la cocina ya lo preparó" }),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, { message: "Con «Otro» hay que explicar la anulación", path: ["detalle"] });
export type AnularPedidoCommand = z.infer<typeof AnularPedidoCommandSchema>;

/**
 * Cerrar una mesa sin cobrar (B6-13, M-35): no consumió o fue un error de registro. Se anula todo lo que debe, de todos
 * sus pedidos, con un motivo y el PIN de quien lo hace (supervisión o administración), y la mesa queda libre. Lo que
 * se fue sin pagar no va por aquí: es una deuda (B3-11).
 */
export const CerrarMesaSinCobrarCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    motivo: MotivoAnulacionPedidoSchema,
    detalle: z.string().trim().max(120).optional(),
    /** ¿Ya se había preparado? Decide el inventario (como B6-6): no, vuelve al estante; sí, es merma. */
    preparado: z.boolean({ error: "Di si ya se había preparado" }),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, { message: "Con «Otro» hay que explicarlo", path: ["detalle"] });
export type CerrarMesaSinCobrarCommand = z.infer<typeof CerrarMesaSinCobrarCommandSchema>;

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

/**
 * Cobrar juntas (B3-16, M-37): lo pendiente de `otras` pasa a `destinoId`, que se cobra una vez con un solo recibo; las
 * otras quedan «juntadas» en ella. Cada cuenta va con la versión que vio la caja: si otro equipo la cambió, se niega.
 */
export const JuntarCuentasCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    destino: z.strictObject({ accountId: z.uuid("Cuenta desconocida"), version: z.number().int().positive() }),
    otras: z
      .array(z.strictObject({ accountId: z.uuid("Cuenta desconocida"), version: z.number().int().positive() }))
      .min(1, "Elige al menos otra cuenta")
      .max(11, "Hasta doce cuentas juntas"),
  })
  .refine((c) => new Set([c.destino.accountId, ...c.otras.map((o) => o.accountId)]).size === c.otras.length + 1, {
    message: "Una cuenta se junta una vez",
    path: ["otras"],
  });
export type JuntarCuentasCommand = z.infer<typeof JuntarCuentasCommandSchema>;

/** Lo que devuelve juntar: la cuenta que queda, ya con todo, y las otras como quedaron. */
export const JuntarCuentasResultSchema = z.object({
  destino: FamilyAccountSchema,
  otras: z.array(FamilyAccountSchema),
});
export type JuntarCuentasResultDto = z.infer<typeof JuntarCuentasResultSchema>;

/* ──────────────────────────────────────── dividir por ítems (B3-20, M-37) */

/** «Partir» un ítem compartido en partes iguales (B3-20): la línea deja de cobrarse y nacen sus partes en la cuenta. */
export const PartirLineaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  accountId: z.uuid("Cuenta desconocida"),
  version: z.number().int().positive(),
  lineId: IdSchema,
  partes: z.number().int().min(2, "Se parte entre dos o más").max(12, "Hasta doce partes"),
});
export type PartirLineaCommand = z.infer<typeof PartirLineaCommandSchema>;

/**
 * Dividir por ítems (B3-20): lo de cada persona, de la 2 en adelante, pasa a su propia cuenta para cobrarse con el cobro
 * de siempre; lo que no se nombra se queda en la cuenta, que es la de la persona 1.
 */
export const DividirPorItemsCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    personas: z
      .array(z.strictObject({ lineIds: z.array(IdSchema).min(1, "Cada persona lleva algo").max(200) }))
      .min(1, "Al menos otra persona")
      .max(11, "Hasta doce personas"),
  })
  .refine((c) => {
    const ids = c.personas.flatMap((p) => p.lineIds);
    return new Set(ids).size === ids.length;
  }, { message: "Cada ítem va a una sola persona", path: ["personas"] });
export type DividirPorItemsCommand = z.infer<typeof DividirPorItemsCommandSchema>;

/** «Unir de nuevo» (B3-20): lo que las personas no cobraron vuelve a la cuenta. */
export const UnirDivisionCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  accountId: z.uuid("Cuenta desconocida"),
});
export type UnirDivisionCommand = z.infer<typeof UnirDivisionCommandSchema>;

/** La cuenta como quedó y la de cada persona (las que siguen por cobrar, al unir: ninguna). */
export const DivisionPorItemsSchema = z.object({
  cuenta: FamilyAccountSchema,
  personas: z.array(FamilyAccountSchema),
});
export type DivisionPorItemsDto = z.infer<typeof DivisionPorItemsSchema>;

/**
 * ¿Alcanza la gaveta para este vuelto? (B3-19): lo que saldría de cada moneda. La respuesta dice solo qué monedas no
 * alcanzan según lo esperado del turno, nunca cuánto hay: el arqueo es a ciegas.
 */
export const AlcanzaLaGavetaSchema = z.strictObject({
  salidas: z.array(MoneySchema).min(1).max(3),
});
export const GavetaAlcanzaSchema = z.object({ faltan: z.array(z.enum(["USD", "VES"])) });
export type GavetaAlcanzaDto = z.infer<typeof GavetaAlcanzaSchema>;
