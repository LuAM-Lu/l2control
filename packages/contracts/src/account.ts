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
});
export type AccountLineDto = z.infer<typeof AccountLineSchema>;

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
    /** El número de mesa tal como se leía ese día: «3». Renumerarla no reescribe esto. */
    tableLabel: z.string().trim().max(20).optional(),
    /** Estancias ya cerradas en la salida. */
    closedSessionIds: z.array(IdSchema),
    lines: z.array(AccountLineSchema),
  })
  .superRefine((c, ctx) => {
    const pendiente = c.lines.some((l) => !l.paid && !l.movedTo);

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
    if (c.status === "POR_COBRAR" && !pendiente) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Una cuenta por cobrar tiene que tener algo pendiente",
      });
    }
  });
export type FamilyAccountDto = z.infer<typeof FamilyAccountSchema>;
