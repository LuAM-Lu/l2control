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
});
export type AccountLineDto = z.infer<typeof AccountLineSchema>;

export const FamilyAccountSchema = z
  .object({
    id: IdSchema,
    /** Nombre del representante: es a quien se cobra y a quien se llama. */
    family: z.string().trim().min(2).max(80),
    mode: PaymentModeSchema,
    status: AccountStatusSchema,
    openedAt: TimestampSchema,
    sessionIds: z.array(IdSchema).min(1, "Una cuenta de parque tiene al menos un niño"),
    /** Estancias ya cerradas en la salida. */
    closedSessionIds: z.array(IdSchema),
    lines: z.array(AccountLineSchema),
  })
  .superRefine((c, ctx) => {
    const pendiente = c.lines.some((l) => !l.paid);

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
    if (c.status === "COBRADA" && c.closedSessionIds.length !== c.sessionIds.length) {
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
