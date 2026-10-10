/**
 * Lo que se devuelve cuando un cliente devuelve parte de lo que compró — B3-14 (M-34, S-4).
 *
 * Puro: con las líneas de la venta (cada una, una unidad, con su alícuota), su subtotal, su descuento, si el IVA venía
 * en el precio, su IGTF y su total, calcula lo que vuelve por las líneas elegidas: el descuento se reparte en proporción
 * al subtotal, el IVA se recalcula por alícuota sobre lo que queda tras el descuento, y el IGTF del cobro va en
 * proporción a lo devuelto. Y propone cómo vuelve por los pagos, cada uno en su moneda a la tasa congelada del cobro
 * (ADR-005), sin pasar de lo que queda de cada uno.
 */
import { add, convert, invertRate, money, subtract, sum, zero, type FrozenRate, type Money } from "@l2/domain-money";

export type VentaParaDevolver = Readonly<{
  /** Lo vendido, línea a línea (cada línea, una unidad), en la moneda funcional, con su IVA en puntos básicos. */
  lineas: readonly Readonly<{ lineId: string; amount: Money; taxBp: number }>[];
  /** Antes del descuento. */
  subtotal: Money;
  /** El descuento del cobro (cero si no hubo). */
  descuento: Money;
  /** El IVA venía dentro de los precios: no se suma otra vez. */
  ivaIncluido: boolean;
  /** El IGTF del cobro. */
  igtf: Money;
  /** Lo cobrado, con el IVA y el IGTF. */
  total: Money;
}>;

export type DevolucionCalculada = Readonly<{ base: Money; descuento: Money; iva: Money; igtf: Money; total: Money }>;

/** a × b / c redondeado a la mitad hacia arriba (todos no negativos). */
function proporcion(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) return 0n;
  return (a * b * 2n + c) / (2n * c);
}

/**
 * Lo que vuelve por las líneas elegidas (las que no son de la venta se ignoran). `parciales` (B3-18): de una línea
 * solo esta parte de su importe, sin pasar de él (lo que un niño no usó de su paquete); el resto, entera.
 */
export function devolucionDe(v: VentaParaDevolver, lineIds: readonly string[], parciales: ReadonlyMap<string, Money> = new Map()): DevolucionCalculada {
  const moneda = v.total.currency;
  const elegidas = new Set(lineIds);
  const porAlicuota = new Map<number, bigint>();
  for (const l of v.lineas) {
    if (!elegidas.has(l.lineId)) continue;
    const parte = parciales.get(l.lineId);
    const importe = parte && parte.amount < l.amount.amount ? (parte.amount < 0n ? 0n : parte.amount) : l.amount.amount;
    porAlicuota.set(l.taxBp, (porAlicuota.get(l.taxBp) ?? 0n) + importe);
  }
  let base = 0n;
  let descuento = 0n;
  let iva = 0n;
  for (const [bp, b] of porAlicuota) {
    const d = v.descuento.amount > 0n ? proporcion(b, v.descuento.amount, v.subtotal.amount) : 0n;
    base += b;
    descuento += d;
    if (!v.ivaIncluido) iva += proporcion(b - d, BigInt(bp), 10_000n);
  }
  const sinIgtf = base - descuento + iva;
  const cobradoSinIgtf = v.total.amount - v.igtf.amount;
  const igtf = v.igtf.amount > 0n && cobradoSinIgtf > 0n ? proporcion(v.igtf.amount, sinIgtf, cobradoSinIgtf) : 0n;
  return {
    base: money(base, moneda),
    descuento: money(descuento, moneda),
    iva: money(iva, moneda),
    igtf: money(igtf, moneda),
    total: money(sinIgtf + igtf, moneda),
  };
}

export type PagoParaDevolver = Readonly<{
  /** Lo que todavía se puede devolver de este pago, en su moneda. */
  restante: Money;
  /** La tasa congelada del cobro, de la moneda funcional a la del pago; `null` si el pago es en la funcional. */
  desdeFuncional: FrozenRate | null;
}>;

/**
 * Cómo vuelve `total` (en la moneda funcional) por los pagos, en orden: de cada uno, lo que falte, sin pasar de lo que
 * le queda. Devuelve el monto de cada pago en su moneda y lo que no alcanzó (cero si cuadra).
 */
export function repartirDevolucion(total: Money, pagos: readonly PagoParaDevolver[]): Readonly<{ montos: readonly Money[]; falta: Money }> {
  let falta = total;
  const montos = pagos.map((p) => {
    if (falta.amount <= 0n) return zero(p.restante.currency);
    const restanteFuncional = p.desdeFuncional ? convert(p.restante, invertRate(p.desdeFuncional)) : p.restante;
    if (restanteFuncional.amount <= falta.amount) {
      falta = subtract(falta, restanteFuncional);
      return p.restante;
    }
    const enSuMoneda = p.desdeFuncional ? convert(falta, p.desdeFuncional) : falta;
    falta = zero(total.currency);
    return enSuMoneda.amount > p.restante.amount ? p.restante : enSuMoneda;
  });
  return { montos, falta: falta.amount < 0n ? zero(total.currency) : falta };
}

/**
 * Cuánto suman, en la moneda funcional, los montos de una devolución por sus pagos, y si cuadran con `total`: a la tasa
 * puede quedar un céntimo de redondeo por cada pago en otra moneda.
 */
export function cuadraLaDevolucion(
  total: Money,
  montos: readonly Readonly<{ monto: Money; desdeFuncional: FrozenRate | null }>[],
): Readonly<{ suma: Money; diferencia: Money; cuadra: boolean }> {
  const enFuncional = montos.map((m) => (m.desdeFuncional ? convert(m.monto, invertRate(m.desdeFuncional)) : m.monto));
  const suma = sum(enFuncional, total.currency);
  const diferencia = subtract(suma, total);
  const tolerancia = BigInt(montos.filter((m) => m.desdeFuncional !== null && m.monto.amount !== 0n).length);
  const abs = diferencia.amount < 0n ? -diferencia.amount : diferencia.amount;
  return { suma, diferencia, cuadra: abs <= tolerancia };
}

/** Lo devuelto en total de una lista de devoluciones (para no devolver dos veces lo mismo). */
export const sumaDevuelta = (totales: readonly Money[], moneda: Money["currency"]): Money => totales.reduce((t, m) => add(t, m), zero(moneda));
