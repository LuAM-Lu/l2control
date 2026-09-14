/**
 * Anular un cobro — lo que la pantalla necesita saber, DEC-24.
 *
 * La regla de cuánto se devuelve vive en el dominio (`refundableByTender`, al
 * cerrar el cobro) y la forma de una anulación válida, en el contrato
 * (`AnulacionSchema`). Aquí solo hay lectura para la pantalla: textos, dinero
 * de un pago y el efectivo que hay para devolver.
 */
import type { MotivoAnulacion, MoneyDto, PagoDeVentaDto, VentaCerradaDto } from "@l2/contracts";
import { money, toMajor, type CurrencyCode, type Money } from "@l2/domain-money";
import { formatMoneyVE } from "@l2/ui";

export const MOTIVOS: readonly { id: MotivoAnulacion; texto: string }[] = [
  { id: "ERROR_EN_COBRO", texto: "Error en el cobro (monto o medio)" },
  { id: "CLIENTE_DESISTIO", texto: "El cliente desistió" },
  { id: "NO_ENTREGADO", texto: "No se entregó lo cobrado" },
  { id: "OTRO", texto: "Otro" },
];

export const textoMotivo = (m: MotivoAnulacion) => MOTIVOS.find((x) => x.id === m)?.texto ?? m;

export const aDinero = (m: MoneyDto): Money => money(BigInt(m.minor), m.currency as CurrencyCode);
export const textoDinero = (m: MoneyDto) => formatMoneyVE(toMajor(aDinero(m)), m.currency);

/** Qué referencia pide devolver un pago electrónico por su mismo medio. */
export function etiquetaReferencia(p: PagoDeVentaDto): string {
  switch (p.dataKind) {
    case "PUNTO":
      return "Aprobación de la anulación en el terminal";
    case "ZELLE":
      return "Confirmación del Zelle de devolución";
    case "USDT":
      return "TxID de la devolución";
    default:
      return "Referencia del Pago Móvil de devolución";
  }
}

/** «···4821»: una referencia a la vista (§7.6). */
export const enmascarar = (ref: string) => `···${ref.slice(-4)}`;

/**
 * Efectivo que estas ventas dejaron en la gaveta en una moneda: lo que quedó
 * de los pagos en efectivo, menos lo que ya salió en efectivo por anulaciones.
 *
 * ⚠ Es una cota BAJA a propósito: no cuenta el fondo inicial del turno ni los
 * retiros. Así, si dice que no alcanza, se niega (fail-closed) aunque quizá sí
 * hubiera. TODO(F4-05/backend): la gaveta real sale del libro del turno.
 */
export function efectivoEnGaveta(ventas: readonly VentaCerradaDto[], currency: string): bigint {
  let total = 0n;
  for (const v of ventas) {
    for (const p of v.payments) {
      if (p.cash && p.refundable.currency === currency) total += BigInt(p.refundable.minor);
    }
    for (const r of v.voided?.refunds ?? []) {
      const p = v.payments[r.paymentIndex];
      if (p && (p.cash || r.via === "EFECTIVO") && r.amount.currency === currency) total -= BigInt(r.amount.minor);
    }
  }
  return total;
}
