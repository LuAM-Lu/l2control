/**
 * Una venta cerrada — UX-MEJORAS §9 (C8, C12), DEC-24, en el servidor desde B3-4.
 *
 * Cada cobro de una cuenta deja una venta: la FOTO de lo que se cobró en ese instante (las líneas
 * con su concepto e importe, el IVA por alícuota, el IGTF, la tasa, cada pago con lo que se
 * devolvería y lo que sobró). La guarda el servidor en la misma transacción que el cobro, con sus
 * datos, no con textos: si mañana cambia un precio, una tasa o un nombre, la venta sigue diciendo lo
 * que se cobró. El recibo (`ReciboSchema`) es la forma de enseñarla y la arma la pantalla desde aquí.
 *
 * APPEND-ONLY (regla 5): cada impresión es una entrada nueva en `prints` —la primera es el original,
 * las siguientes, copias (§5.4: reimprimir es vector de fraude)— y la anulación se AÑADE una vez.
 *
 * ⚠ §7.6: las referencias de pago, las de devolución y el documento del cliente salen enmascarados.
 */
import { z } from "zod";
import { AccountKindSchema, MotivoCortesiaSchema } from "./account.ts";
import { DescuentoDeVentaSchema } from "./descuentos.ts";
import { TaxCodeSchema } from "./impuestos.ts";
import { MarcaDePapelSchema } from "./papel.ts";
import { FechaSchema, IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";

const Texto = (max: number) => z.string().max(max);

/**
 * El recibo como se enseña y se imprime, con los textos ya formateados. Lo arma la pantalla desde la
 * venta del servidor (`reciboDeVenta`); no se guarda.
 */
export const ReciboSchema = z.object({
  /** Quién lo emite: el nombre del local y, si ya los declaró, su RIF y su dirección (B4-4). */
  local: z.object({ nombre: Texto(80), rif: Texto(16).nullable(), direccion: Texto(160).nullable() }),
  orden: Texto(16),
  cuenta: Texto(120),
  cuando: Texto(40),
  facturaA: Texto(160),
  /** «Parte 2 de 3» cuando la cuenta se paga dividida (F6-12). */
  parte: Texto(24).nullable().optional(),
  lineas: z
    .array(
      z.object({
        cantidad: z.number().int().positive(),
        concepto: Texto(80),
        importe: Texto(24),
        /** Si esa línea se regaló (F6-14): un dato, no algo que se deduzca leyendo el concepto. */
        cortesia: z.boolean().optional(),
      }),
    )
    .min(1),
  subtotal: Texto(24),
  /** «Descuento · Pago con Zelle 10 %» y lo que descontó, antes del IVA (B3-6). */
  descuento: z.object({ etiqueta: Texto(80), monto: Texto(24) }).nullable().optional(),
  impuestos: z.array(z.object({ etiqueta: Texto(24), monto: Texto(24) })),
  total: Texto(24),
  totalBs: Texto(32).nullable(),
  tasa: Texto(24).nullable(),
  /** Cada pago en su moneda y, si no es en dólares, lo que vale en dólares a la tasa del cobro (B3-12). */
  pagos: z.array(z.object({ medio: Texto(40), detalle: Texto(80).nullable(), monto: Texto(32), equivalente: Texto(32).nullable().optional() })),
  /** Lo pagado en total, cuando hace falta decirlo: varios pagos, otra moneda o algo de más (B3-12). */
  pagado: Texto(32).nullable().optional(),
  vuelto: Texto(24).nullable(),
  /** El vuelto en bolívares, si el cobro tuvo tasa (B3-12). */
  vueltoBs: Texto(32).nullable().optional(),
  /** Cómo se dio el vuelto, si no fue todo en efectivo $ (B3-19): cada parte con su medio y, por Pago Móvil, su referencia. */
  vueltoPartes: z.array(z.object({ medio: Texto(40), monto: Texto(32), detalle: Texto(60).nullable() })).optional(),
  destinoVuelto: Texto(24).nullable(),
  cajera: Texto(80).nullable(),
  telefono: Texto(20).nullable(),
});
export type ReciboDto = z.infer<typeof ReciboSchema>;

/** Qué se hace con lo que el cliente entregó de más (§5.6). */
export const DestinoSobraSchema = z.enum(["VUELTO", "PROPINA", "RESIDUO"]);
export type DestinoSobra = z.infer<typeof DestinoSobraSchema>;

/** Una impresión del recibo: cuándo, quién y si fue una copia. */
export const ImpresionSchema = z.object({
  at: TimestampSchema,
  by: Texto(80),
  copia: z.boolean(),
});
export type ImpresionDto = z.infer<typeof ImpresionSchema>;

/**
 * Un pago de la venta, con lo que se devolvería si se anula (DEC-24). `refundable` lo calcula el
 * dominio al cerrar el cobro (`refundableByTender`) con la tasa congelada de ese momento: el vuelto,
 * la propina y el residuo no se devuelven.
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
  /** Los datos del pago enmascarados (§7.6), o `null` si el medio no los pide. */
  referencia: Texto(80).nullable(),
});
export type PagoDeVentaDto = z.infer<typeof PagoDeVentaSchema>;

/** Motivos de lista cerrada (§7.3). «Otro» exige explicarlo. */
export const MotivoAnulacionSchema = z.enum(["ERROR_EN_COBRO", "CLIENTE_DESISTIO", "NO_ENTREGADO", "OTRO"], {
  error: "Elige el motivo",
});
export type MotivoAnulacion = z.infer<typeof MotivoAnulacionSchema>;

/**
 * Cómo vuelve el dinero de un pago al anular (lo que manda la pantalla). Por el mismo medio, un pago
 * electrónico lleva la referencia de su devolución (en el punto, la aprobación de la anulación en el
 * terminal); en efectivo, lo que no entró en efectivo exige explicarlo en la anulación.
 */
export const DevolucionSchema = z.strictObject({
  /** Índice del pago en `payments` de la venta. */
  paymentIndex: z.number().int().nonnegative(),
  via: z.enum(["MISMO_MEDIO", "EFECTIVO"]),
  reference: z.string().trim().min(4, "Referencia demasiado corta").max(40).optional(),
});
export type DevolucionDto = z.infer<typeof DevolucionSchema>;

/**
 * La anulación de una venta, como la guardó el servidor — DEC-24. Quién la pidió, quién la autorizó,
 * por qué y cómo volvió el dinero de cada pago (la referencia de devolución, enmascarada).
 */
export const AnulacionSchema = z.object({
  at: TimestampSchema,
  requestedBy: Texto(80),
  authorizedBy: z.object({ name: Texto(80), role: z.enum(["ADMIN", "SUPERVISOR"]) }),
  reason: MotivoAnulacionSchema,
  note: Texto(280).nullable(),
  refunds: z.array(
    z.object({
      paymentIndex: z.number().int().nonnegative(),
      via: z.enum(["MISMO_MEDIO", "EFECTIVO"]),
      amount: MoneySchema,
      reference: Texto(20).nullable(),
    }),
  ),
});
export type AnulacionDto = z.infer<typeof AnulacionSchema>;

/** A dónde va lo que un cliente devuelve (B3-14): al estante (vuelve a venderse) o a merma. */
export const DestinoDevueltoSchema = z.enum(["ESTANTE", "MERMA"], { error: "Elige si vuelve al estante o va a merma" });
export type DestinoDevuelto = z.infer<typeof DestinoDevueltoSchema>;

/**
 * Una devolución de parte de una venta, como la guardó el servidor — B3-14 (M-34). Qué líneas y a dónde fue cada una,
 * lo que volvió con su descuento, IVA e IGTF, cómo volvió por cada pago (la referencia, enmascarada), quién y por qué.
 */
export const DevolucionDeVentaSchema = z.object({
  id: IdSchema,
  at: TimestampSchema,
  por: Texto(80),
  autorizo: Texto(80).nullable(),
  motivo: Texto(200),
  lineas: z.array(z.object({ lineId: IdSchema, concept: Texto(80), amount: MoneySchema, destino: DestinoDevueltoSchema })).min(1),
  descuento: MoneySchema,
  iva: MoneySchema,
  igtf: MoneySchema,
  total: MoneySchema,
  reintegros: z.array(z.object({ paymentIndex: z.number().int().nonnegative(), amount: MoneySchema, reference: Texto(20).nullable() })),
});
export type DevolucionDeVentaDto = z.infer<typeof DevolucionDeVentaSchema>;

/** A quién sale la factura, con el documento enmascarado (§7.6). */
export const ClienteDeLaVentaSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CONSUMIDOR_FINAL") }),
  z.object({ kind: z.literal("IDENTIFICADO"), name: Texto(120), document: Texto(20) }),
]);
export type ClienteDeLaVentaDto = z.infer<typeof ClienteDeLaVentaSchema>;

export const VentaCerradaSchema = z
  .object({
    id: IdSchema,
    orderNumber: z.number().int().positive(),
    accountId: IdSchema,
    /** La clave con que el servidor asentó el cobro: anular es anular esa operación del libro. */
    cobroKey: IdempotencyKeySchema,
    closedAt: TimestampSchema,
    businessDate: FechaSchema,
    cashier: Texto(80),
    /** De quién era la cuenta: la familia, la mesa o el mostrador. */
    cuenta: z.object({ kind: AccountKindSchema, family: Texto(80), tableLabel: Texto(20).nullable(), dePie: z.literal(true).optional() }),
    /** La parte cobrada si la cuenta se pagó dividida (F6-12). */
    parte: z.object({ n: z.number().int().positive(), de: z.number().int().min(2) }).nullable(),
    cliente: ClienteDeLaVentaSchema,
    /** Lo que se cobró y lo que se regaló en el cobro, línea a línea, con su importe. */
    lineas: z
      .array(
        z.object({
          lineId: IdSchema,
          concept: Texto(80),
          amount: MoneySchema,
          cortesia: MotivoCortesiaSchema.nullable(),
          /** El trato del IVA con que se vendió (B3-14); las ventas de antes no lo traen: IVA general. */
          taxCode: TaxCodeSchema.optional(),
        }),
      )
      .min(1),
    subtotal: MoneySchema,
    /** El descuento del cobro (B3-6): el subtotal es antes de él, y el IVA, después. Las de antes no lo traen. */
    descuento: DescuentoDeVentaSchema.nullable().optional(),
    impuestos: z.array(z.object({ basisPoints: z.number().int().nonnegative(), tax: MoneySchema })),
    /** El IVA venía dentro de los precios (ajuste de la sucursal): el total no lo suma otra vez. Las de antes, no. */
    ivaIncluido: z.boolean().default(false),
    igtf: z.object({ basisPoints: z.number().int().nonnegative(), amount: MoneySchema }),
    total: MoneySchema,
    /** La tasa congelada del cobro, si se pagó algo en bolívares. */
    tasa: z.object({ id: IdSchema, value: Texto(24) }).nullable(),
    payments: z.array(PagoDeVentaSchema),
    sobra: z
      .object({
        amount: MoneySchema,
        destino: DestinoSobraSchema,
        /**
         * Cómo se dio el vuelto (B3-19): cada parte con su medio, lo entregado en su moneda y lo que vale en dólares; por
         * Pago Móvil, su referencia enmascarada. Las ventas de antes no lo traen: se dio todo en efectivo $.
         */
        vuelto: z
          .array(
            z.object({
              methodCode: z.string(),
              label: z.string(),
              amount: MoneySchema,
              enDolares: MoneySchema,
              referencia: z.string().nullable(),
            }),
          )
          .optional(),
      })
      .nullable(),
    prints: z.array(ImpresionSchema),
    voided: AnulacionSchema.nullable(),
    /** Lo que el cliente devolvió después (B3-14), en orden. Lo que queda de cada pago ya lo descuenta. */
    devoluciones: z.array(DevolucionDeVentaSchema).default([]),
    /**
     * Si el cobro se cargó desde papel (B3-7, ADR-027): de qué carga es y cuándo se cargó. `closedAt` es
     * entonces la hora real que se anotó en el formulario. Las ventas de antes, y las que no vienen del
     * papel, no lo traen.
     */
    desdePapel: MarcaDePapelSchema.nullable().optional(),
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
      if (vistos.has(r.paymentIndex)) ctx.addIssue({ code: "custom", path: ruta, message: "Ese pago ya tiene su devolución" });
      vistos.add(r.paymentIndex);
      if (r.amount.currency !== p.refundable.currency || r.amount.minor !== p.refundable.minor) {
        ctx.addIssue({ code: "custom", path: ruta, message: "Se devuelve exactamente lo que quedó de ese pago, en su moneda" });
      }
    });
  });
export type VentaCerradaDto = z.infer<typeof VentaCerradaSchema>;

/** Las ventas del turno abierto del equipo, de la más reciente a la más antigua. */
export const VentasDelTurnoSchema = z.object({ ventas: z.array(VentaCerradaSchema) });
export type VentasDelTurnoDto = z.infer<typeof VentasDelTurnoSchema>;

/**
 * Un cliente devuelve parte de lo que compró (B3-14, M-34): las líneas (cada una, una unidad) y a dónde va cada una, cómo
 * vuelve el dinero por cada pago (en su moneda; un pago electrónico, con la referencia de su devolución) y el motivo.
 * Supervisión lo hace; la caja, con su autorización. El tiempo del parque y los servicios no se devuelven por aquí.
 */
export const DevolverVentaCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    saleId: z.uuid("Venta desconocida"),
    lineas: z
      .array(
        z.strictObject({
          lineId: IdSchema,
          destino: DestinoDevueltoSchema,
          /**
           * El tiempo del parque que un niño pagó y no usó (B3-18, M-37 U-11): de su paquete vuelve lo pagado menos lo que
           * vale su tiempo real (lo calcula el servidor). Sin marcarlo, el paquete vuelve entero (un problema del local).
           */
          noUsado: z.boolean().optional(),
        }),
      )
      .min(1, "Elige lo que se devuelve")
      .max(200),
    reintegros: z
      .array(
        z.strictObject({
          paymentIndex: z.number().int().nonnegative(),
          amount: MoneySchema,
          reference: z.string().trim().min(4, "Referencia demasiado corta").max(40).optional(),
        }),
      )
      .min(1, "Di cómo vuelve el dinero")
      .max(20),
    motivo: z.string().trim().min(3, "Di por qué devuelve (al menos 3 letras)").max(200, "Hasta 200 caracteres"),
  })
  .refine((c) => new Set(c.lineas.map((l) => l.lineId)).size === c.lineas.length, { message: "Cada línea va una vez", path: ["lineas"] })
  .refine((c) => new Set(c.reintegros.map((r) => r.paymentIndex)).size === c.reintegros.length, { message: "Cada pago va una vez", path: ["reintegros"] });
export type DevolverVentaCommand = z.infer<typeof DevolverVentaCommandSchema>;

/** Lo que deja una devolución: la venta como quedó y, si su comprobante no salió, por qué. */
export const DevolucionHechaSchema = z.object({ venta: VentaCerradaSchema, comprobanteNoImpreso: z.string().nullable() });
export type DevolucionHechaDto = z.infer<typeof DevolucionHechaSchema>;

/** Buscar una venta por su número de orden (B3-14): la más reciente con ese número en la sucursal. */
export const BuscarVentaSchema = z.strictObject({ orden: z.number().int().positive("Escribe el número de la orden") });

/** Imprimir el recibo de una venta: el servidor anota quién y cuándo, y si ya era una copia. */
export const ImprimirVentaCommandSchema = z.strictObject({ saleId: z.uuid("Venta desconocida") });
export type ImprimirVentaCommand = z.infer<typeof ImprimirVentaCommandSchema>;

/**
 * El tiempo del parque de una venta, para devolverlo (B3-18, M-37 U-11): cada paquete con su niño, si sigue en la sala
 * (entonces todavía no se devuelve) y lo que no usó (lo pagado menos lo que vale su tiempo con la regla de B4-17);
 * `null` si tuvo más tiempo (se devuelve entero) o sigue en la sala.
 */
export const ParqueDeLaVentaSchema = z.object({
  lineas: z.array(
    z.object({
      lineId: IdSchema,
      enSala: z.boolean(),
      noUsado: MoneySchema.nullable(),
    }),
  ),
});
export type ParqueDeLaVentaDto = z.infer<typeof ParqueDeLaVentaSchema>;
