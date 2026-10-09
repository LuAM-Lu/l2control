/**
 * Las cuentas del cobro, como las dice un recibo — B3-12, M-34 (S-7, S-18).
 *
 * El local vio recibos que «no eran reales»: con un pago mixto, lo pagado en bolívares salía solo en bolívares y no se
 * podía sumar contra el total en dólares; el vuelto, solo en dólares. Aquí se hace la cuenta una vez y la usan el papel
 * (la plantilla del servidor) y la pantalla (el recibo de la caja): cada pago con su equivalente en la moneda funcional a
 * la tasa congelada del cobro (ADR-005), lo pagado en total, y el vuelto también en bolívares. Puro: no formatea ni
 * decide qué se imprime.
 */
import { add, convert, invertRate, isZero, money, subtract, type FrozenRate, type Money } from "@l2/domain-money";

export type DestinoDeSobra = "VUELTO" | "PROPINA" | "RESIDUO";

export type CobroParaRecibo = Readonly<{
  /** El total cobrado, en la moneda funcional. */
  total: Money;
  pagos: readonly Readonly<{ medio: string; pagado: Money; referencia: string | null }>[];
  /** Lo entregado de más y a dónde fue; en la moneda funcional. */
  sobra: Readonly<{ monto: Money; destino: DestinoDeSobra }> | null;
  /** La tasa congelada del cobro, de la moneda funcional a bolívares; `null` si no la hubo. */
  aBolivares: FrozenRate | null;
}>;

export type CuentasDelCobro = Readonly<{
  pagos: readonly Readonly<{ medio: string; referencia: string | null; pagado: Money; enFuncional: Money | null }>[];
  /** Lo pagado en total, en la moneda funcional. */
  pagado: Money;
  /** Si el recibo dice «Pagado»: con más de un pago, alguno en otra moneda o algo de más. Con uno exacto, sobra. */
  diceElPagado: boolean;
  sobra: Readonly<{ monto: Money; destino: DestinoDeSobra; enBolivares: Money | null }> | null;
  totalEnBolivares: Money | null;
  /** Lo pagado menos lo de más, contra el total: cero si cuadra (a la tasa, puede quedar un céntimo de redondeo). */
  diferencia: Money;
}>;

export function cuentasDelCobro(c: CobroParaRecibo): CuentasDelCobro {
  const funcional = c.total.currency;
  const aFuncional = c.aBolivares ? invertRate(c.aBolivares) : null;
  const pagos = c.pagos.map((p) => {
    const otra = p.pagado.currency !== funcional;
    if (otra && !aFuncional) throw new TypeError(`Un pago en ${p.pagado.currency} sin la tasa del cobro no se puede sumar.`);
    return { medio: p.medio, referencia: p.referencia, pagado: p.pagado, enFuncional: otra ? convert(p.pagado, aFuncional!) : null };
  });
  const pagado = pagos.reduce((acc, p) => add(acc, p.enFuncional ?? p.pagado), money(0n, funcional));
  const sobra = c.sobra
    ? { monto: c.sobra.monto, destino: c.sobra.destino, enBolivares: c.aBolivares && !isZero(c.sobra.monto) ? convert(c.sobra.monto, c.aBolivares) : null }
    : null;
  return {
    pagos,
    pagado,
    diceElPagado: pagos.length > 1 || pagos.some((p) => p.enFuncional !== null) || sobra !== null,
    sobra,
    totalEnBolivares: c.aBolivares ? convert(c.total, c.aBolivares) : null,
    diferencia: subtract(subtract(pagado, sobra?.monto ?? money(0n, funcional)), c.total),
  };
}
