/**
 * L2 Control — Aritmética de dinero
 * Implementa §5.1 del plan (docs/PLAN.md).
 *
 * Reglas que este módulo IMPONE y que nadie puede saltarse:
 *
 *  1. Todo monto es un entero en la unidad menor de su moneda (`bigint`).
 *     Nunca `number`, nunca punto flotante. 0,1 no existe en binario y en
 *     dinero esa fracción perdida es un pasivo.
 *  2. Un monto NUNCA viaja sin su moneda.
 *  3. No se pueden sumar dos monedas distintas: el compilador lo rechaza.
 *     Para combinarlas hay que pasar por `convert()`, que EXIGE una tasa.
 *  4. El reparto usa mayor resto: la suma de las partes es siempre el total.
 *  5. El redondeo se aplica una sola vez, al final.
 */

export type CurrencyCode = "USD" | "VES" | "USDT";

/** Decimales de cada moneda, según ISO 4217. */
const SCALE: Readonly<Record<CurrencyCode, number>> = {
  USD: 2,
  VES: 2,
  USDT: 2,
};

/**
 * Un monto y su moneda, inseparables.
 * `amount` está en unidades menores: 1 USD = 100n.
 */
export type Money = Readonly<{
  amount: bigint;
  currency: CurrencyCode;
}>;

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(
      `No se pueden operar ${a} y ${b} directamente. ` +
        `Convierte primero con una tasa explícita (ADR-005).`,
    );
    this.name = "CurrencyMismatchError";
  }
}

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/** Crea un Money desde unidades menores (centavos). */
export function money(minorUnits: bigint, currency: CurrencyCode): Money {
  return Object.freeze({ amount: minorUnits, currency });
}

/**
 * Crea un Money desde unidades mayores, que es como escribe una persona.
 * Solo debe usarse en los BORDES del sistema: entrada de usuario e
 * importación de datos. Nunca en medio de un cálculo.
 */
export function fromMajor(major: string | number, currency: CurrencyCode): Money {
  const scale = SCALE[currency];
  const text = typeof major === "number" ? major.toString() : major.trim();

  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new InvalidAmountError(`Monto no válido: "${major}"`);
  }

  const negative = text.startsWith("-");
  const [wholePart = "0", fracPart = ""] = text.replace("-", "").split(".");

  if (fracPart.length > scale) {
    throw new InvalidAmountError(
      `${currency} admite ${scale} decimales; "${major}" tiene ${fracPart.length}.`,
    );
  }

  const padded = fracPart.padEnd(scale, "0");
  const minor = BigInt(wholePart + padded);
  return money(negative ? -minor : minor, currency);
}

/** Convierte a unidades mayores como texto. Solo para mostrar. */
export function toMajor(m: Money): string {
  const scale = SCALE[m.currency];
  const negative = m.amount < 0n;
  const abs = negative ? -m.amount : m.amount;
  const divisor = 10n ** BigInt(scale);
  const whole = abs / divisor;
  const frac = (abs % divisor).toString().padStart(scale, "0");
  const sign = negative ? "-" : "";
  return scale === 0 ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, currency);
}

export function isZero(m: Money): boolean {
  return m.amount === 0n;
}

export function isNegative(m: Money): boolean {
  return m.amount < 0n;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

/** Suma una lista. Requiere la moneda explícita para que una lista vacía
 *  siga teniendo una respuesta correcta en lugar de fallar. */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce<Money>((acc, m) => add(acc, m), zero(currency));
}

/** Multiplica por una cantidad entera (unidades de un producto). */
export function multiply(m: Money, factor: bigint): Money {
  return money(m.amount * factor, m.currency);
}

/**
 * Modos de redondeo.
 *
 * `HALF_UP` (mitad hacia arriba, alejándose del cero) es la convención fiscal
 * habitual y el valor por defecto. `DOWN` trunca, y sirve para la política de
 * residuo a favor del cliente que fijó DEC-5.
 */
export type Rounding = "HALF_UP" | "HALF_EVEN" | "DOWN";

/**
 * Multiplica por una tasa expresada como fracción de enteros.
 *
 * Existe para los impuestos: un 16 % es `1600/10000`, no `0.16`. Mantener la
 * tasa como fracción de enteros evita meter un `number` en el camino del
 * dinero, que es exactamente lo que §5.1 prohíbe.
 *
 * El redondeo ocurre AQUÍ y una sola vez. Quien llame debe agrupar antes
 * —por ejemplo, sumar toda la base de una alícuota— y multiplicar después;
 * redondear línea a línea produce diferencias de céntimos que en un cierre de
 * mes son visibles.
 */
export function multiplyByRate(
  m: Money,
  numerator: bigint,
  denominator: bigint,
  rounding: Rounding = "HALF_UP",
): Money {
  if (denominator === 0n) {
    throw new InvalidAmountError("El denominador de una tasa no puede ser cero.");
  }

  const product = m.amount * numerator;
  const negative = product < 0n !== denominator < 0n;
  const absProduct = product < 0n ? -product : product;
  const absDenom = denominator < 0n ? -denominator : denominator;

  const quotient = absProduct / absDenom;
  const remainder = absProduct % absDenom;

  let result = quotient;
  if (remainder !== 0n) {
    const twice = remainder * 2n;
    if (rounding === "HALF_UP") {
      if (twice >= absDenom) result = quotient + 1n;
    } else if (rounding === "HALF_EVEN") {
      if (twice > absDenom || (twice === absDenom && quotient % 2n === 1n)) {
        result = quotient + 1n;
      }
    }
    // DOWN trunca: se queda con el cociente.
  }

  return money(negative ? -result : result, m.currency);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amount < b.amount) return -1;
  if (a.amount > b.amount) return 1;
  return 0;
}

/**
 * Reparte un monto en `parts` porciones usando MAYOR RESTO.
 *
 * Dividir 100 entre 3 devuelve [34, 33, 33], nunca [33.33, 33.33, 33.33].
 * La suma de las partes es SIEMPRE igual al total: ese es el punto.
 * Se usa en la división de cuentas (R5) y en el prorrateo de descuentos.
 */
export function allocate(m: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new InvalidAmountError(`El número de partes debe ser un entero ≥ 1, recibido: ${parts}`);
  }
  return allocateByRatios(m, Array.from({ length: parts }, () => 1n));
}

/**
 * Reparte según pesos arbitrarios (ej. por el precio de cada ítem),
 * también por mayor resto. El residuo se entrega a las porciones con
 * mayor parte fraccionaria, en orden.
 */
export function allocateByRatios(m: Money, ratios: readonly bigint[]): Money[] {
  if (ratios.length === 0) {
    throw new InvalidAmountError("Se requiere al menos una proporción.");
  }
  const total = ratios.reduce((acc, r) => acc + r, 0n);
  if (total <= 0n) {
    throw new InvalidAmountError("La suma de las proporciones debe ser positiva.");
  }

  const base: bigint[] = [];
  const remainders: { index: number; rest: bigint }[] = [];
  let allocated = 0n;

  for (let i = 0; i < ratios.length; i++) {
    const ratio = ratios[i] ?? 0n;
    const exact = m.amount * ratio;
    const share = exact / total;
    base.push(share);
    remainders.push({ index: i, rest: exact - share * total });
    allocated += share;
  }

  // El residuo se reparte de a una unidad menor, empezando por quien más
  // fracción perdió. Estable ante empates para que el resultado sea
  // reproducible y auditable.
  let leftover = m.amount - allocated;
  remainders.sort((a, b) => (b.rest === a.rest ? a.index - b.index : b.rest > a.rest ? 1 : -1));

  let cursor = 0;
  const step = leftover >= 0n ? 1n : -1n;
  while (leftover !== 0n) {
    const target = remainders[cursor % remainders.length];
    if (target) {
      base[target.index] = (base[target.index] ?? 0n) + step;
      leftover -= step;
    }
    cursor++;
  }

  return base.map((amount) => money(amount, m.currency));
}

export const __internal = { SCALE };
