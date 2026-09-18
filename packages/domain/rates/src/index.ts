/**
 * L2 Control — El módulo de tasas
 * Implementa §5.2 del plan y [ADR-005](../../../../docs/adr/005-tasa-congelada.md).
 *
 * Es el sitio al que apuntan `@l2/domain-money` y `@l2/domain-cash` cuando
 * dicen «la tasa como dato con vigencia vive en el módulo de tasas». Aquí está
 * lo que ellos no hacen: **cuál es la tasa vigente**, **con qué fracción se
 * convierte** y **cuánto se aparta de la anterior**.
 *
 * Reglas que este módulo impone:
 *
 *  1. Una tasa es un registro histórico: no se corrige, se captura otra. Nada
 *     de lo que hay aquí modifica un historial.
 *  2. Sin tasa confirmada, `currentRate` devuelve `null`. Nunca cero, nunca la
 *     de ayer en silencio, nunca un valor por defecto (regla fail-closed).
 *  3. El instante entra como argumento (ADR-010): una tasa capturada para
 *     mañana no está vigente hoy, y este módulo no tiene reloj para saberlo.
 *  4. La aritmética es exacta y entera. Una tasa con ocho decimales no se
 *     redondea al construir la fracción: se escala.
 */
import type { CurrencyCode, FrozenRate } from "@l2/domain-money";

/** Los pares que opera el negocio. El bolívar siempre es la moneda cotizada. */
export type RatePair = "USD/VES" | "USDT/VES";

/** De dónde salió la tasa. Sin procedencia, una tasa no es auditable (§5.2). */
export type RateSource = "BCV" | "MANUAL" | "COMERCIAL";

/**
 * Una tasa capturada.
 *
 * `value` es texto decimal —«228.41»— por la misma razón que el dinero no es
 * `number`: un flotante pierde precisión y aquí cada céntimo se multiplica por
 * todo lo que se cobre. Es lo que el BCV publica: cuántos bolívares vale una
 * unidad de la moneda base.
 */
export type RateRecord = Readonly<{
  id: string;
  pair: RatePair;
  value: string;
  source: RateSource;
  /** Cuándo se capturó, en ISO. */
  capturedAt: string;
  /** Sin confirmar no se cobra con ella (§5.2, ADR-005). */
  confirmed: boolean;
}>;

export class InvalidRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRateError";
  }
}

/** Decimales de cada moneda. Los mismos que usa `@l2/domain-money`. */
const SCALE: Readonly<Record<CurrencyCode, number>> = { USD: 2, VES: 2, USDT: 2 };

const MONEDAS: Readonly<Record<RatePair, Readonly<{ base: CurrencyCode; quote: CurrencyCode }>>> = {
  "USD/VES": { base: "USD", quote: "VES" },
  "USDT/VES": { base: "USDT", quote: "VES" },
};

/** Las dos monedas de un par, para no partir la cadena en cada sitio. */
export function currenciesOf(pair: RatePair): Readonly<{ base: CurrencyCode; quote: CurrencyCode }> {
  return MONEDAS[pair];
}

/**
 * El valor como entero exacto y cuántos decimales tenía.
 *
 * `"228.4152"` → `{ digits: 2284152n, decimals: 4 }`. No se redondea: quien
 * publique una tasa con ocho decimales la verá entera en la fracción.
 */
function parseDecimal(value: string): Readonly<{ digits: bigint; decimals: number }> {
  const texto = value.trim();
  if (!/^\d+(\.\d+)?$/.test(texto)) {
    throw new InvalidRateError(`Tasa no válida: "${value}". Solo dígitos y un punto decimal.`);
  }
  const [entera = "0", fraccion = ""] = texto.split(".");
  const digits = BigInt(entera + fraccion);
  if (digits === 0n) {
    // §5.2 lo pide como `CHECK value > 0`, y por una razón: una tasa cero
    // convierte cualquier cobro en cero o en una división por cero.
    throw new InvalidRateError("Una tasa de cambio no puede ser cero (§5.2).");
  }
  return { digits, decimals: fraccion.length };
}

/** Máximo común divisor, para que la fracción se guarde en su forma corta. */
function mcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * La fracción con la que `convert()` pasa **de bolívares a la moneda base**.
 *
 * Una cotización dice «1 USD = 228,41 VES»; `FrozenRate` dice «tantas unidades
 * menores de `from` equivalen a tantas de `to`». Aquí se traduce lo uno en lo
 * otro sin perder un céntimo: los decimales del valor se compensan escalando
 * las dos partes de la fracción, y después se reduce.
 *
 * Para el sentido contrario —decirle al cliente en bolívares lo que falta—
 * está `invertRate` de `@l2/domain-money`: una sola forma de darle la vuelta.
 */
export function frozenRateOf(rate: Pick<RateRecord, "pair" | "value">): FrozenRate {
  const { base, quote } = currenciesOf(rate.pair);
  const { digits, decimals } = parseDecimal(rate.value);

  // value · 10^escala(quote) unidades menores de quote  ==
  // 1 · 10^escala(base) unidades menores de base.
  // Se multiplican ambas por 10^decimales para que no quede ninguna fracción.
  const numerator = digits * 10n ** BigInt(SCALE[quote]);
  const denominator = 10n ** BigInt(SCALE[base] + decimals);
  const divisor = mcd(numerator, denominator);

  return Object.freeze({
    from: quote,
    to: base,
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

/**
 * La tasa vigente de un par: la **última confirmada** que ya estaba capturada
 * en ese instante.
 *
 * Devuelve `null` cuando no hay ninguna, y ese `null` es la regla fail-closed
 * de ADR-005: quien llama bloquea el cobro en esa moneda. No existe una
 * versión que «se las arregle» con la de ayer, porque la de ayer, en este
 * negocio, es otro precio.
 *
 * El historial puede venir en cualquier orden: se elige por `capturedAt`, y a
 * igualdad de instante gana la que esté más adelante en la lista, que es la
 * que se capturó después.
 */
export function currentRate(
  history: readonly RateRecord[],
  pair: RatePair,
  now: string,
): RateRecord | null {
  const ahora = Date.parse(now);
  if (Number.isNaN(ahora)) throw new InvalidRateError(`Instante no válido: "${now}".`);

  let vigente: RateRecord | null = null;
  let vigenteEn = -Infinity;

  for (const t of history) {
    if (t.pair !== pair || !t.confirmed) continue;
    const en = Date.parse(t.capturedAt);
    if (Number.isNaN(en) || en > ahora) continue;
    if (en >= vigenteEn) {
      vigente = t;
      vigenteEn = en;
    }
  }
  return vigente;
}

/**
 * Cuánto se aparta una tasa de otra, en puntos básicos (100 bps = 1 %).
 *
 * Siempre positivo: lo que importa para el límite de cordura es el tamaño del
 * salto, no si subió o bajó. Se calcula con enteros escalados a la precisión
 * de las dos, para que «228.41» y «228.410000» den exactamente cero.
 */
export function variationBasisPoints(anterior: string, nueva: string): bigint {
  const a = parseDecimal(anterior);
  const b = parseDecimal(nueva);
  const escala = Math.max(a.decimals, b.decimals);
  const va = a.digits * 10n ** BigInt(escala - a.decimals);
  const vb = b.digits * 10n ** BigInt(escala - b.decimals);
  const diferencia = va > vb ? va - vb : vb - va;
  return (diferencia * 10_000n) / va;
}

/**
 * Si confirmar esta tasa exige que alguien vuelva a teclear el valor (§5.2).
 *
 * Un salto grande es el aviso de que alguien se equivocó de tecla o de que el
 * proveedor devolvió basura, y es exactamente el vector T2 del plan: tocar la
 * tasa para beneficiarse. Sin tasa anterior con la que comparar **también**
 * exige la doble verificación: la primera del local no tiene red debajo.
 */
export function needsDoubleCheck(
  anterior: RateRecord | null,
  nueva: Pick<RateRecord, "value">,
  umbralBasisPoints: number,
): boolean {
  if (!Number.isInteger(umbralBasisPoints) || umbralBasisPoints <= 0) {
    throw new InvalidRateError(
      `El umbral de variación se mide en puntos básicos positivos; llegó ${umbralBasisPoints}.`,
    );
  }
  if (!anterior) return true;
  return variationBasisPoints(anterior.value, nueva.value) > BigInt(umbralBasisPoints);
}
