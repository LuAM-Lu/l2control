/**
 * El fondo fijo de una caja — B3-22 (M-38, W-9). Lo puro: qué se propone dejar al cerrar y cómo se compara la apertura
 * con lo que quedó.
 *
 * Es opcional y por caja (apagado de fábrica). Encendido, el cierre propone dejar ese fondo y retirar el resto, y la
 * apertura se cuenta por billete contra lo que quedó en el último cierre de esa caja: si falta o sobra, se dice y queda
 * a nombre de quien abre. Apagado, como antes: se propone lo que quedó en el último Z.
 */
import { compare, subtract, zero, type CurrencyCode, type Money } from "@l2/domain-money";

/** Lo que se propone dejar al cerrar con fondo fijo: el fondo de cada moneda, nunca más de lo contado. */
export function dejarConFondoFijo(fondo: readonly Money[], contado: readonly Money[]): Money[] {
  return contado.map((c) => {
    const f = fondo.find((x) => x.currency === c.currency) ?? zero(c.currency);
    return compare(f, c) <= 0 ? f : c;
  });
}

/** Una moneda de la apertura: lo contado, lo que quedó y la diferencia (positiva si sobra, negativa si falta). */
export type LineaDeApertura = Readonly<{ currency: CurrencyCode; contado: Money; quedo: Money; diferencia: Money }>;

/** La apertura contada contra lo que quedó, por moneda; `cuadra` si ninguna tiene diferencia. */
export function aperturaContraLoQueQuedo(contado: readonly Money[], quedo: readonly Money[]): Readonly<{ lineas: LineaDeApertura[]; cuadra: boolean }> {
  const lineas = contado.map((c) => {
    const q = quedo.find((x) => x.currency === c.currency) ?? zero(c.currency);
    return { currency: c.currency, contado: c, quedo: q, diferencia: subtract(c, q) };
  });
  return { lineas, cuadra: lineas.every((l) => l.diferencia.amount === 0n) };
}
