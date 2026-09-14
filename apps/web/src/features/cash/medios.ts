/**
 * Un medio de pago tal como lo usa la caja — F4-03, F4-04.
 */
import type { PaymentMethodSpec } from "@l2/domain-tax";
import type { TenderMethod } from "@l2/domain-cash";
import type { TipoDeDatosDePago } from "@l2/contracts";

/**
 * Medios de pago.
 *
 * `triggersIgtf` y `canGiveChange` son DATOS: quién tributa lo dice la norma,
 * y solo el efectivo devuelve vuelto. Modelarlos como datos permite
 * corregirlos sin desplegar (§9.9).
 */
export type MedioPago = PaymentMethodSpec &
  TenderMethod &
  Readonly<{
    /** Qué datos exige el medio antes de aceptar el pago (F4-04). Sin campo, ninguno. */
    datos?: TipoDeDatosDePago;
  }>;
