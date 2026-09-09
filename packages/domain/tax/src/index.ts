/**
 * L2 Control — Motor de IVA e IGTF
 * Implementa §5.3 del plan.
 *
 * ⚠ AVISO QUE NO SE PUEDE QUITAR SIN HABLAR CON EL CONTADOR
 * Las alícuotas y las reglas de este módulo son DATOS con vigencia, nunca
 * constantes del código, precisamente porque la normativa cambia. Los valores
 * concretos los confirma el contador del cliente (DEC-1); aquí solo vive la
 * mecánica.
 *
 * LA DECISIÓN ESTRUCTURAL DE ESTE MÓDULO
 * IVA e IGTF NO se calculan juntos, y no por comodidad:
 *
 *   · El IVA depende de QUÉ se vendió. Se conoce al armar la cuenta.
 *   · El IGTF depende de EN QUÉ MONEDA SE PAGA. No se conoce hasta que el
 *     cliente decide cómo paga, y en un pago mixto se aplica solo a la parte
 *     liquidada en divisas o cripto.
 *
 * Por eso son dos funciones y no una. Meterlas en la misma sería obligar a
 * conocer el medio de pago al armar la cuenta, que es imposible.
 */

import {
  type Money,
  type Rounding,
  add,
  allocateByRatios,
  multiply,
  multiplyByRate,
  subtract,
  sum,
  zero,
  type CurrencyCode,
} from "@l2/domain-money";

/* ------------------------------------------------------------- alícuotas */

export type TaxCode = "GENERAL" | "REDUCIDA" | "EXENTA";

/** Denominador de las tasas: puntos básicos. 16 % = 1600. */
export const BASIS = 10_000n;

/**
 * Alícuota con vigencia.
 *
 * `effectiveTo` nulo significa «vigente hasta nuevo aviso». Cuando el IVA
 * cambie se añade una fila nueva y **las facturas viejas se siguen
 * recalculando con la regla que tenían** — que es el requisito de F3-06.
 */
export type TaxRule = Readonly<{
  code: TaxCode;
  /** Alícuota en puntos básicos. Entero: nunca un `number` decimal. */
  basisPoints: number;
  effectiveFrom: number;
  effectiveTo: number | null;
}>;

export class NoApplicableRuleError extends Error {
  constructor(code: TaxCode, at: number) {
    super(
      `No hay alícuota vigente para "${code}" en ${new Date(at).toISOString()}. ` +
        `Sin regla no se factura: fail-closed (§7.2 A10).`,
    );
    this.name = "NoApplicableRuleError";
  }
}

/**
 * Busca la alícuota vigente en un instante.
 *
 * Falla si no encuentra ninguna. Suponer 0 % «porque no hay regla» sería
 * emitir facturas sin IVA en silencio, que es el peor error posible aquí.
 */
export function findRule(rules: readonly TaxRule[], code: TaxCode, at: number): TaxRule {
  const found = rules.find(
    (r) => r.code === code && r.effectiveFrom <= at && (r.effectiveTo === null || at < r.effectiveTo),
  );
  if (!found) throw new NoApplicableRuleError(code, at);
  return found;
}

/* ------------------------------------------------------------ documento */

export type DocumentLine = Readonly<{
  id: string;
  description: string;
  unitPrice: Money;
  quantity: bigint;
  taxCode: TaxCode;
}>;

export type Discount =
  | Readonly<{ kind: "AMOUNT"; value: Money }>
  | Readonly<{ kind: "PERCENT"; basisPoints: number }>;

/**
 * Servicio o propina.
 *
 * `taxable` lo decide el contador (DEC-6). Es un dato del cálculo y no una
 * suposición del código, porque su tratamiento fiscal cambia el total.
 */
export type ServiceCharge = Readonly<{
  basisPoints: number;
  taxable: boolean;
  /** Con qué alícuota tributa si `taxable` es cierto. */
  taxCode: TaxCode;
}>;

export type TaxBucket = Readonly<{
  code: TaxCode;
  basisPoints: number;
  /** Base imponible del grupo, ya con el descuento prorrateado aplicado. */
  base: Money;
  tax: Money;
}>;

export type DocumentTotals = Readonly<{
  subtotal: Money;
  discountTotal: Money;
  serviceCharge: Money;
  buckets: readonly TaxBucket[];
  taxTotal: Money;
  /** Lo que se factura. El IGTF NO está aquí: depende del medio de pago. */
  total: Money;
}>;

function lineAmount(line: DocumentLine): Money {
  return multiply(line.unitPrice, line.quantity);
}

/**
 * Total del documento, con el orden de cálculo de §5.3.
 *
 *   1. Subtotal de líneas
 *   2. − Descuentos, PRORRATEADOS por línea
 *   3. + Servicio
 *   4. = Base imponible agrupada por alícuota
 *   5. + IVA por alícuota
 *   6. = TOTAL DEL DOCUMENTO
 *
 * El descuento se prorratea y no se resta del final: si la cuenta mezcla
 * ítems gravados y exentos, restarlo al total regalaría IVA que sí se debe.
 * El reparto usa mayor resto, así que la suma de las partes es exactamente
 * el descuento concedido.
 *
 * El IVA se calcula **una vez por grupo de alícuota**, sobre la base sumada,
 * no línea a línea: redondear en cada línea produce diferencias de céntimos
 * que en un cierre de mes son visibles.
 */
export function computeDocument(input: {
  lines: readonly DocumentLine[];
  discounts?: readonly Discount[];
  service?: ServiceCharge | undefined;
  rules: readonly TaxRule[];
  at: number;
  currency: CurrencyCode;
  rounding?: Rounding;
}): DocumentTotals {
  const { lines, rules, at, currency } = input;
  const rounding: Rounding = input.rounding ?? "HALF_UP";
  const discounts = input.discounts ?? [];

  const amounts = lines.map(lineAmount);
  const subtotal = sum(amounts, currency);

  // --- descuentos -------------------------------------------------------
  let discountTotal = zero(currency);
  for (const d of discounts) {
    discountTotal = add(
      discountTotal,
      d.kind === "AMOUNT"
        ? d.value
        : multiplyByRate(subtotal, BigInt(d.basisPoints), BASIS, rounding),
    );
  }
  // Nunca se descuenta más de lo que vale la cuenta, **en su propio signo**.
  // En una nota de crédito el subtotal es negativo, y comparar sin tener eso
  // en cuenta convertía un descuento de cero en el subtotal entero.
  if (subtotal.amount >= 0n) {
    if (discountTotal.amount > subtotal.amount) discountTotal = subtotal;
    if (discountTotal.amount < 0n) discountTotal = zero(currency);
  } else {
    if (discountTotal.amount < subtotal.amount) discountTotal = subtotal;
    if (discountTotal.amount > 0n) discountTotal = zero(currency);
  }

  // Prorrateo por peso = MAGNITUD de cada línea. Se usa el valor absoluto
  // porque una cuenta puede mezclar cargos y devoluciones, y los pesos deben
  // sumar algo positivo para poder repartir.
  const weights = amounts.map((a) => (a.amount < 0n ? -a.amount : a.amount));
  const weightSum = weights.reduce((acc, w) => acc + w, 0n);

  const discountPerLine: Money[] =
    discountTotal.amount === 0n || weightSum === 0n
      ? amounts.map(() => zero(currency))
      : allocateByRatios(discountTotal, weights);

  // --- servicio ---------------------------------------------------------
  const netSubtotal = subtract(subtotal, discountTotal);
  const service = input.service;
  const serviceCharge = service
    ? multiplyByRate(netSubtotal, BigInt(service.basisPoints), BASIS, rounding)
    : zero(currency);

  // --- base por alícuota ------------------------------------------------
  const bases = new Map<TaxCode, Money>();
  lines.forEach((line, i) => {
    const bruto = amounts[i] ?? zero(currency);
    const desc = discountPerLine[i] ?? zero(currency);
    const neto = subtract(bruto, desc);
    bases.set(line.taxCode, add(bases.get(line.taxCode) ?? zero(currency), neto));
  });

  if (service && service.taxable && serviceCharge.amount !== 0n) {
    bases.set(
      service.taxCode,
      add(bases.get(service.taxCode) ?? zero(currency), serviceCharge),
    );
  }

  // --- IVA por grupo ----------------------------------------------------
  const buckets: TaxBucket[] = [...bases.entries()]
    .map(([code, base]) => {
      const rule = findRule(rules, code, at);
      return {
        code,
        basisPoints: rule.basisPoints,
        base,
        tax: multiplyByRate(base, BigInt(rule.basisPoints), BASIS, rounding),
      };
    })
    // Orden estable para que el desglose sea reproducible en el ticket.
    .sort((a, b) => a.code.localeCompare(b.code));

  const taxTotal = sum(
    buckets.map((b) => b.tax),
    currency,
  );

  // El servicio suma al total UNA vez, sea o no base imponible. Que tribute
  // solo cambia si además entra en el cálculo del IVA de arriba.
  const total = add(add(netSubtotal, serviceCharge), taxTotal);

  return Object.freeze({
    subtotal,
    discountTotal,
    serviceCharge,
    buckets: Object.freeze(buckets),
    taxTotal,
    total,
  });
}

/* ----------------------------------------------------------------- IGTF */

/**
 * Medio de pago.
 *
 * `triggersIgtf` es un DATO, no una deducción del código a partir de la
 * moneda: quién tributa lo dice la norma y lo confirma el contador. Modelarlo
 * como dato permite corregirlo sin desplegar el día que cambie.
 */
export type PaymentMethodSpec = Readonly<{
  code: string;
  label: string;
  currency: CurrencyCode;
  triggersIgtf: boolean;
}>;

export type PaymentIntent = Readonly<{
  method: PaymentMethodSpec;
  /** Monto entregado en la moneda del medio. */
  amount: Money;
}>;

export type IgtfLine = Readonly<{
  methodCode: string;
  base: Money;
  igtf: Money;
}>;

export type IgtfResult = Readonly<{
  lines: readonly IgtfLine[];
  total: Money;
}>;

/**
 * IGTF sobre los pagos.
 *
 * Se aplica **por pago y solo a los medios que lo disparan**: en un pago
 * mixto, la parte en bolívares no tributa y la parte en divisas sí. Ese es
 * exactamente el caso que el plan marca como imprescindible (§5.3).
 *
 * La base es el monto pagado **con el IVA ya incluido**, porque el impuesto
 * grava el pago y no la venta.
 *
 * @param currency Moneda en la que se expresa el IGTF resultante. Los pagos
 * pueden venir en monedas distintas; cada uno tributa en la suya, y quien
 * llame decide si consolida y con qué tasa (ADR-005).
 */
export function computeIgtf(
  payments: readonly PaymentIntent[],
  igtfBasisPoints: number,
  currency: CurrencyCode,
  rounding: Rounding = "HALF_UP",
): IgtfResult {
  const lines: IgtfLine[] = payments
    .filter((p) => p.method.triggersIgtf && p.amount.amount !== 0n)
    .map((p) => ({
      methodCode: p.method.code,
      base: p.amount,
      igtf: multiplyByRate(p.amount, BigInt(igtfBasisPoints), BASIS, rounding),
    }));

  const total = sum(
    lines.filter((l) => l.igtf.currency === currency).map((l) => l.igtf),
    currency,
  );

  return Object.freeze({ lines: Object.freeze(lines), total });
}
