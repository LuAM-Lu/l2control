/**
 * Mover efectivo — B3-21 (M-38, W-8). Lo puro: qué motivos lleva cada tipo de movimiento, cuándo pide el PIN de
 * supervisión y cómo mueve la gaveta.
 *
 * El efectivo que entra o sale sin ser venta (el sencillo para la caja, el hielo, un proveedor, un adelanto, lo que va a
 * la caja fuerte) terminaba como diferencia del arqueo. Ahora es un movimiento del turno: suma o resta en la gaveta, no
 * cuenta como venta y queda en el corte aparte. El cierre sigue a ciegas.
 */
import { compare, type Money } from "@l2/domain-money";

/** Entra (sencillo), sale (compras, proveedor, adelanto) o se retira a resguardo. */
export type TipoDeMovimiento = "ENTRADA" | "SALIDA" | "RETIRO";
export type MotivoDeMovimiento = "SENCILLO" | "COMPRAS" | "PROVEEDOR" | "ADELANTO" | "RESGUARDO";

/** Los motivos de cada tipo: un retiro es a resguardo; una entrada, sencillo para la caja. */
export const MOTIVOS_DEL_TIPO: Readonly<Record<TipoDeMovimiento, readonly MotivoDeMovimiento[]>> = Object.freeze({
  ENTRADA: ["SENCILLO"],
  SALIDA: ["COMPRAS", "PROVEEDOR", "ADELANTO"],
  RETIRO: ["RESGUARDO"],
});

export const motivoDelTipo = (tipo: TipoDeMovimiento, motivo: MotivoDeMovimiento): boolean => MOTIVOS_DEL_TIPO[tipo].includes(motivo);

/** Cómo se dice cada uno: en la pantalla, en el corte y en el comprobante. */
export const NOMBRE_DEL_TIPO: Readonly<Record<TipoDeMovimiento, string>> = Object.freeze({ ENTRADA: "Entrada", SALIDA: "Salida", RETIRO: "Retiro" });
export const NOMBRE_DEL_MOTIVO: Readonly<Record<MotivoDeMovimiento, string>> = Object.freeze({
  SENCILLO: "Sencillo para la caja",
  COMPRAS: "Compras para el local",
  PROVEEDOR: "Pago a proveedor",
  ADELANTO: "Adelanto al personal",
  RESGUARDO: "A resguardo",
});

/**
 * ¿Pide el PIN de supervisión? Todo retiro, y lo que pase del tope (medido en dólares: lo de bolívares, a la tasa del
 * momento). Lo decide el servidor; la pantalla lo pregunta para pedir el PIN antes.
 */
export function pideAutorizacion(tipo: TipoDeMovimiento, enDolares: Money, tope: Money): boolean {
  if (tipo === "RETIRO") return true;
  return compare(enDolares, tope) > 0;
}

/** El movimiento como lo cuenta `tallyShift` (su `ShiftMovement`): escrito aquí para no importar el índice (sin ciclos). */
export type MovimientoDeGaveta = Readonly<{ kind: "CASH_IN" | "PAYOUT"; methodCode: string; amount: Money; inDrawer: true }>;

/** El movimiento en la gaveta: una entrada suma, una salida o un retiro restan; está en el cajón, no es venta. */
export function movimientosDeEfectivo(movs: readonly Readonly<{ tipo: TipoDeMovimiento; monto: Money }>[]): MovimientoDeGaveta[] {
  return movs.map((m) => ({
    kind: m.tipo === "ENTRADA" ? "CASH_IN" : "PAYOUT",
    methodCode: m.monto.currency === "VES" ? "EFECTIVO_VES" : "EFECTIVO_USD",
    amount: m.monto,
    inDrawer: true,
  }));
}
