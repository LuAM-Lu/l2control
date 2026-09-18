/**
 * La cuenta de la familia — DEC-21, §9.10.9.
 *
 * Una familia paga el parque de una de dos formas, elegida en cada entrada:
 *
 *  · **PREPAGO** — el paquete se cobra al entrar; al salir, solo el excedente.
 *  · **CUENTA_ABIERTA** — nada se cobra al entrar; parque, excedente y
 *    restaurante se acumulan y se pagan una sola vez al irse.
 *
 * La cuenta es lo que enlaza entrada, salida y caja: nace en la entrada, la
 * salida la actualiza y la caja la cierra. Las reglas que la mantienen
 * coherente están en el esquema y no en cada pantalla, porque son las mismas
 * para las tres y para el servidor (ADR-017).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

export const PaymentModeSchema = z.enum(["PREPAGO", "CUENTA_ABIERTA"]);
export type PaymentMode = z.infer<typeof PaymentModeSchema>;

/**
 * · ABIERTA     — la familia está dentro; no hay nada que cobrar AHORA.
 * · POR_COBRAR  — hay algo pendiente y está en la cola de la caja.
 * · COBRADA     — se fue y no debe nada. Una cuenta cobrada no se reabre ni se
 *                 borra: un error se corrige con otro asiento (regla 5).
 */
export const AccountStatusSchema = z.enum(["ABIERTA", "POR_COBRAR", "COBRADA"]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

/**
 * Por qué se regala algo. Lista cerrada (§7.5): un campo libre acaba siendo
 * «varios» en el ochenta por ciento de los casos y el reporte de excepciones
 * deja de servir para nada.
 */
export const MotivoCortesiaSchema = z.enum(
  ["INVITACION", "ERROR_DE_COCINA", "CONSUMO_DE_PERSONAL", "OTRO"],
  { error: "Elige el motivo de la cortesía" },
);
export type MotivoCortesia = z.infer<typeof MotivoCortesiaSchema>;

/**
 * Una cortesía dada: por qué, quién la autorizó y cuándo.
 *
 * Autorizar es de `cuenta.cortesia` (§7.3): la cajera la pide y un supervisor
 * o la administración la concede con su PIN. Por eso quien autoriza lleva su
 * rol: una cortesía autorizada por quien no puede no es una cortesía.
 */
export const CortesiaSchema = z
  .strictObject({
    motivo: MotivoCortesiaSchema,
    /** Obligatorio con «Otro»: sin explicación, «Otro» no dice nada. */
    detalle: z.string().trim().min(3, "Explica la cortesía").max(120).optional(),
    autorizadaPor: z.object({
      id: IdSchema,
      name: z.string().trim().min(2).max(80),
      role: z.enum(["ADMIN", "SUPERVISOR"]),
    }),
    en: TimestampSchema,
  })
  .refine((c) => c.motivo !== "OTRO" || c.detalle !== undefined, {
    message: "Con «Otro» hay que explicar la cortesía",
    path: ["detalle"],
  });
export type CortesiaDto = z.infer<typeof CortesiaSchema>;

export const AccountLineSchema = z.object({
  id: IdSchema,
  /** Lo que lee el representante en el recibo: «Paquete 1 hora · Vale». */
  concept: z.string().trim().min(1).max(80),
  kind: z.enum(["PAQUETE", "EXCEDENTE", "RESTAURANTE"]),
  amount: MoneySchema,
  /** Si ya se cobró. En prepago, los paquetes se cobran al entrar. */
  paid: z.boolean(),
  /** Estancia de la que sale la línea, si es del parque. */
  sessionId: IdSchema.optional(),
  /**
   * A qué cuenta se movió esta línea — D2.
   *
   * Al vincular las pulseras a una mesa, lo del parque pasa a la cuenta de la
   * mesa para que la familia pague UNA vez. La línea no se borra (regla 5): se
   * queda aquí diciendo adónde fue, y deja de contar para lo pendiente.
   */
  movedTo: IdSchema.optional(),
  /**
   * Cortesía — F6-14, §7.5.
   *
   * La línea **se queda con su importe**: lo que se entregó se entregó, y el
   * negocio tiene que poder ver cuánto regaló. Lo que cambia es que deja de
   * sumar al total a cobrar y entra en las excepciones del turno.
   *
   * No es un descuento ni un precio distinto: es lo mismo, sin cobrar, con
   * nombre y apellido de quien lo autorizó (regla 5).
   */
  cortesia: CortesiaSchema.optional(),
});
export type AccountLineDto = z.infer<typeof AccountLineSchema>;

/**
 * La cuenta se paga en partes — F6-12.
 *
 * «Pagamos entre tres»: el total del documento se reparte en partes iguales y
 * cada una se cobra por separado, con su propio recibo. Se guarda **cuántas
 * partes** y **cuántas van cobradas**, no importes: el reparto sale del total
 * con la regla del mayor resto (`allocate`), así la suma de las partes es
 * exactamente el total, al céntimo, y no hay un céntimo que se pierda.
 *
 * Dividir no cambia las líneas: lo que se come sigue siendo lo mismo. Por eso
 * las líneas se marcan cobradas solo cuando se paga la última parte.
 */
export const DivisionCuentaSchema = z
  .object({
    parts: z.number().int().min(2, "Dividir es entre dos o más").max(12, "Más de doce partes no se cobra en una caja"),
    paid: z.number().int().min(0),
  })
  .refine((d) => d.paid <= d.parts, "No se pueden cobrar más partes de las que hay");
export type DivisionCuentaDto = z.infer<typeof DivisionCuentaSchema>;

export const FamilyAccountSchema = z
  .object({
    id: IdSchema,
    /** Nombre del representante: es a quien se cobra y a quien se llama. */
    family: z.string().trim().min(2).max(80),
    mode: PaymentModeSchema,
    status: AccountStatusSchema,
    /**
     * Número de orden: el correlativo que ampara la cuenta en toda la sucursal,
     * sea de una familia, de una mesa o del mostrador. Es lo que se dice en voz
     * alta y se busca en un reclamo. NO es el número de factura: ese lo asigna
     * la máquina fiscal al emitir y tiene su propia serie (F3, SENIAT).
     *
     * Lo asigna quien registra la cuenta —mañana el servidor, en la misma
     * transacción que la crea—, nunca la pantalla. Opcional solo hasta ese
     * momento: una cuenta sin número todavía no está registrada.
     */
    orderNumber: z.number().int().positive().optional(),
    /**
     * Desde cuándo espera en la cola de la caja: el instante en que pasó a
     * POR_COBRAR. Ordena la cola por antigüedad y dice cuánto lleva esperando.
     * Lo pone quien registra el cambio de estado, no la pantalla.
     */
    pendingSince: TimestampSchema.optional(),
    openedAt: TimestampSchema,
    /**
     * Los niños que ampara. Vacío en una cuenta anclada a una mesa o al
     * mostrador: ahí no hay estancias, hay consumo.
     */
    sessionIds: z.array(IdSchema),
    /** La mesa de la que es esta cuenta, si nació en el salón (F6-05, D2). */
    tableId: IdSchema.optional(),
    /** Si se está pagando en partes (F6-12). Sin esto, se paga de una vez. */
    split: DivisionCuentaSchema.optional(),
    /** El número de mesa tal como se leía ese día: «3». Renumerarla no reescribe esto. */
    tableLabel: z.string().trim().max(20).optional(),
    /** Estancias ya cerradas en la salida. */
    closedSessionIds: z.array(IdSchema),
    lines: z.array(AccountLineSchema),
  })
  .superRefine((c, ctx) => {
    // Lo que queda por cobrar. Una línea regalada NO cuenta: se entregó y no
    // se cobra (F6-14). Sin esta exclusión, una cuenta con una cortesía no
    // podría cerrarse nunca, porque siempre parecería tener algo pendiente.
    const pendiente = c.lines.some((l) => !l.paid && !l.movedTo && !l.cortesia);
    const regalado = c.lines.some((l) => l.cortesia);

    // Una cuenta tiene que ser de ALGUIEN: de unos niños, de una mesa, o de
    // una venta de mostrador (que no tiene ni lo uno ni lo otro, y lo dice su
    // modo). Sin ancla, nadie sabría a quién cobrarle.
    if (c.sessionIds.length === 0 && !c.tableId && !c.id.startsWith("c-dir-")) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionIds"],
        message: "Una cuenta necesita al menos un niño o una mesa",
      });
    }

    for (const id of c.closedSessionIds) {
      if (!c.sessionIds.includes(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["closedSessionIds"],
          message: `La estancia ${id} no pertenece a esta cuenta`,
        });
      }
    }

    // DEC-2: el catálogo está en dólares. Una línea en otra moneda sumaría
    // peras con manzanas en el total de la cuenta.
    c.lines.forEach((l, i) => {
      if (l.amount.currency !== "USD") {
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "amount"],
          message: "Las líneas de la cuenta van en la moneda funcional (USD)",
        });
      }
    });

    // Mientras queden partes por cobrar, la cuenta sigue en la cola: cerrarla
    // dejaría sin cobrar lo que falta y sin rastro de que faltaba.
    if (c.status === "COBRADA" && c.split && c.split.paid < c.split.parts) {
      ctx.addIssue({
        code: "custom",
        path: ["split"],
        message: `Faltan ${c.split.parts - c.split.paid} partes por cobrar`,
      });
    }
    if (c.status === "COBRADA" && pendiente) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Una cuenta cobrada no puede tener nada pendiente",
      });
    }
    // Una cuenta de familia se cierra cuando la familia entera se ha ido. Una
    // cuenta de MESA no: se cobra cuando piden la cuenta, aunque los niños
    // sigan jugando (D3). Lo que quede de parque después se cobra aparte.
    if (c.status === "COBRADA" && !c.tableId && c.closedSessionIds.length !== c.sessionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Una cuenta se cobra del todo cuando la familia entera se ha ido",
      });
    }
    // Una cuenta donde se regaló todo también pasa por la caja: hay que
    // cerrarla y dejar la cortesía en las excepciones del turno, aunque el
    // total a cobrar sea cero.
    if (c.status === "POR_COBRAR" && !pendiente && !regalado) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Una cuenta por cobrar tiene que tener algo pendiente",
      });
    }
  });
export type FamilyAccountDto = z.infer<typeof FamilyAccountSchema>;
