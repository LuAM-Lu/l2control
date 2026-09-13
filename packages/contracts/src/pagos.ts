/**
 * Datos que exige cada medio de pago — F4-04, §7.6.
 *
 * Un Pago Móvil sin referencia, un USDT sin TxID o un punto de venta sin su
 * número de aprobación no se pueden conciliar: al cerrar el día nadie sabe
 * qué pago es cuál. Por eso el dato obligatorio de cada medio se exige ANTES
 * de que el pago entre en el cobro (fail-closed), y no «se completa luego».
 *
 * ⚠ DATOS SENSIBLES (§7.6): referencias, TxID y titulares se cifran en reposo
 * y NUNCA aparecen en un log. En pantalla se muestran enmascarados.
 *
 * Unión discriminada por `kind`: pedir un TxID a un Pago Móvil no se puede
 * expresar.
 */
import { z } from "zod";
import { IdSchema } from "./primitives.ts";

const soloDigitos = (min: number, max: number, que: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${min},${max}}$`), `${que}: solo dígitos, de ${min} a ${max}`);

/** Teléfono venezolano: 0412, 0414, 0416, 0422, 0424, 0426 o fijo 02xx, con o sin guion. */
export const TelefonoVeSchema = z
  .string()
  .trim()
  .regex(/^0(4(12|14|16|22|24|26)|2\d{2})-?\d{7}$/, "Teléfono no válido: 0414-1234567");

/** Cédula o RIF: V-12345678, E-…, J-…, P-…, G-… */
export const DocumentoVeSchema = z
  .string()
  .trim()
  .regex(/^[VEJPG]-?\d{5,9}(-?\d)?$/i, "Documento no válido: V-12345678 o J-40123456-7");

export const RedUsdtSchema = z.enum(["TRC20", "BEP20", "ERC20", "BINANCE_PAY"], { error: "Elige la red" });
export type RedUsdt = z.infer<typeof RedUsdtSchema>;

export const DatosDePagoSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PAGO_MOVIL"),
    /** Número de referencia que da el banco del cliente. */
    reference: soloDigitos(4, 20, "Referencia"),
    /** Código del banco de origen (4 dígitos: 0134 Banesco, 0105 Mercantil…). */
    bankCode: z.string().regex(/^\d{4}$/, "Elige el banco de origen"),
    payerPhone: TelefonoVeSchema.optional(),
    payerDocument: DocumentoVeSchema.optional(),
  }),
  z.object({
    kind: z.literal("ZELLE"),
    /** Correo o nombre del titular de la cuenta que envía. */
    holder: z.string().trim().min(3, "Escribe el correo o el nombre del titular").max(120),
    confirmation: z.string().trim().max(40).optional(),
  }),
  z.object({
    kind: z.literal("USDT"),
    /** Hash o ID de la transacción. */
    txId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{8,128}$/, "El TxID son letras y números, de 8 a 128"),
    network: RedUsdtSchema,
    holder: z.string().trim().min(2).max(80).optional(),
  }),
  z.object({
    kind: z.literal("PUNTO"),
    /** Terminal por el que se pasó la tarjeta: con dos o más, se elige. */
    terminalId: z.string().min(1, "Elige el terminal por el que se pasó la tarjeta").max(64),
    /** Número de aprobación o de referencia que imprime el terminal. */
    reference: soloDigitos(4, 12, "Referencia"),
    lot: soloDigitos(1, 6, "Lote").optional(),
  }),
]);
export type DatosDePagoDto = z.infer<typeof DatosDePagoSchema>;
export type TipoDeDatosDePago = DatosDePagoDto["kind"];

/**
 * Terminal de punto de venta bancario. No es el «punto de cobro» de DEC-13
 * (taquilla o mostrador): un mismo mostrador puede tener dos terminales de
 * bancos distintos.
 * TODO(F4-02): se configuran en Configuración; hoy son datos de ejemplo.
 */
export const PosTerminalSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(2).max(40),
  bank: z.string().trim().min(2).max(40),
});
export type PosTerminalDto = z.infer<typeof PosTerminalSchema>;
