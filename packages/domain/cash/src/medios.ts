/**
 * El catálogo de medios de pago — F4-02, F4-04, §9.9 (B3-2).
 *
 * Un medio es un DATO del local, no una constante del código: añadir uno no exige desplegar
 * (§9.9). Lo que sí es regla, y vive aquí, es lo que hace que un medio tenga sentido y cuándo la
 * caja lo puede ofrecer:
 *
 *  · el vuelto sale de la gaveta (§5.6): solo da vuelto el efectivo, y en la gaveta hay dólares y
 *    bolívares, no USDT; y el efectivo no pide referencia, porque no hay banco que la dé;
 *  · un medio que pide datos del local (el teléfono del Pago Móvil, el correo de Zelle, un
 *    terminal para el punto) no se ofrece mientras falten: el cliente pagaría a ninguna parte.
 *
 * Los siete de §5.5 son el catálogo con el que nace un local.
 */
import type { CurrencyCode } from "@l2/domain-money";

/** Qué datos exige un medio para conciliar el pago (F4-04). */
export type PaymentDataKind = "PAGO_MOVIL" | "ZELLE" | "USDT" | "PUNTO";

export type LedgerMethodSpec = Readonly<{
  /** Código estable: lo citan los asientos del libro para siempre. */
  code: string;
  label: string;
  currency: CurrencyCode;
  /** Efectivo de la gaveta: el único que da vuelto (§5.6). */
  givesChange: boolean;
  /** Si el cobro en este medio lleva IGTF. Lo dice la norma, y la norma cambia: es un dato. */
  triggersIgtf: boolean;
  /** Los datos que pide para conciliar; `null`, ninguno. */
  dataKind: PaymentDataKind | null;
  active: boolean;
}>;

/** Los siete medios de §5.5, con los que nace un local. Los que piden datos del local, apagados. */
export const DEFAULT_LEDGER_METHODS: readonly LedgerMethodSpec[] = Object.freeze([
  { code: "EFECTIVO_USD", label: "Efectivo $", currency: "USD", givesChange: true, triggersIgtf: true, dataKind: null, active: true },
  { code: "EFECTIVO_VES", label: "Efectivo Bs", currency: "VES", givesChange: true, triggersIgtf: false, dataKind: null, active: true },
  { code: "PAGO_MOVIL", label: "Pago Móvil", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: "PAGO_MOVIL", active: false },
  { code: "PDV_DEBITO", label: "Punto débito", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: "PUNTO", active: false },
  { code: "PDV_CREDITO", label: "Punto crédito", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: "PUNTO", active: false },
  { code: "ZELLE", label: "Zelle", currency: "USD", givesChange: false, triggersIgtf: true, dataKind: "ZELLE", active: false },
  { code: "USDT", label: "USDT", currency: "USDT", givesChange: false, triggersIgtf: true, dataKind: "USDT", active: true },
] satisfies LedgerMethodSpec[]);

/** Las monedas del cajón: de aquí sale el vuelto. */
const GAVETA: readonly CurrencyCode[] = ["USD", "VES"];

export type MethodDefinitionProblem = "VUELTO_FUERA_DE_LA_GAVETA" | "EFECTIVO_SIN_REFERENCIA";

/** ¿Tiene sentido este medio? Se comprueba al darlo de alta. */
export function methodDefinitionProblem(
  m: Pick<LedgerMethodSpec, "currency" | "givesChange" | "dataKind">,
): MethodDefinitionProblem | null {
  if (m.givesChange && !GAVETA.includes(m.currency)) return "VUELTO_FUERA_DE_LA_GAVETA";
  // Un billete no trae número de aprobación: pedirlo bloquearía el cobro en efectivo.
  if (m.givesChange && m.dataKind !== null) return "EFECTIVO_SIN_REFERENCIA";
  return null;
}

/** Lo que el local tiene configurado para que el cliente pague en los medios que lo necesitan. */
export type CollectionReadiness = Readonly<{
  pagoMovil: boolean;
  zelle: boolean;
  /** Terminales de punto de venta vigentes en la sucursal. */
  terminals: number;
}>;

export type OfferProblem = "APAGADO" | "FALTAN_DATOS_DEL_LOCAL";

/**
 * ¿Puede la caja ofrecer este medio ahora? Encendido, y con los datos del local que el cliente
 * necesita. El USDT no pide datos del local: el TxID lo trae quien paga.
 */
export function offerProblem(m: Pick<LedgerMethodSpec, "active" | "dataKind">, local: CollectionReadiness): OfferProblem | null {
  if (!m.active) return "APAGADO";
  if (m.dataKind === "PAGO_MOVIL" && !local.pagoMovil) return "FALTAN_DATOS_DEL_LOCAL";
  if (m.dataKind === "ZELLE" && !local.zelle) return "FALTAN_DATOS_DEL_LOCAL";
  if (m.dataKind === "PUNTO" && local.terminals === 0) return "FALTAN_DATOS_DEL_LOCAL";
  return null;
}

/** Los medios que la caja ofrece, en el orden del catálogo. */
export function offeredMethods<M extends Pick<LedgerMethodSpec, "active" | "dataKind">>(
  methods: readonly M[],
  local: CollectionReadiness,
): M[] {
  return methods.filter((m) => offerProblem(m, local) === null);
}
