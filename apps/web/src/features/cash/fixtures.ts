/**
 * Datos de ejemplo de caja.
 *
 * La cuenta representa una liquidación de parque cobrada en taquilla, que es
 * el caso que enlaza con la pantalla de salida.
 */
import { fromMajor } from "@l2/domain-money";
import type { PaymentMethodSpec, TaxRule } from "@l2/domain-tax";
import type { TenderMethod } from "@l2/domain-cash";
import { PosTerminalSchema, type PosTerminalDto, type TipoDeDatosDePago } from "@l2/contracts";

/**
 * Alícuotas de trabajo. **No son una afirmación sobre la normativa vigente**:
 * las confirma el contador (DEC-1). Van con vigencia desde el principio para
 * que cambiarlas no reescriba el pasado (F3-06).
 */
export const DEMO_TAX_RULES: TaxRule[] = [
  { code: "GENERAL", basisPoints: 1600, effectiveFrom: 0, effectiveTo: null },
  { code: "REDUCIDA", basisPoints: 800, effectiveFrom: 0, effectiveTo: null },
  { code: "EXENTA", basisPoints: 0, effectiveFrom: 0, effectiveTo: null },
];

/** IGTF en puntos básicos. 3 % = 300. Dato, no constante del código. */
export const DEMO_IGTF_BASIS_POINTS = 300;

/** Umbral máximo que puede quedarse en caja como residuo (§5.6). */
export const DEMO_MAX_RETAINED = fromMajor("0.05", "USD");

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

export const DEMO_TENDERS: MedioPago[] = [
  {
    code: "EFECTIVO_USD",
    label: "Efectivo $",
    currency: "USD",
    triggersIgtf: true,
    canGiveChange: true,
  },
  {
    code: "EFECTIVO_VES",
    label: "Efectivo Bs",
    currency: "VES",
    triggersIgtf: false,
    canGiveChange: true,
  },
  {
    code: "PAGO_MOVIL",
    label: "Pago Móvil",
    currency: "VES",
    triggersIgtf: false,
    canGiveChange: false,
    datos: "PAGO_MOVIL",
  },
  {
    code: "PDV_DEBITO",
    label: "Punto débito",
    currency: "VES",
    triggersIgtf: false,
    canGiveChange: false,
    datos: "PUNTO",
  },
  {
    code: "ZELLE",
    label: "Zelle",
    currency: "USD",
    triggersIgtf: true,
    canGiveChange: false,
    datos: "ZELLE",
  },
  {
    code: "USDT",
    label: "USDT",
    currency: "USDT",
    triggersIgtf: true,
    canGiveChange: false,
    datos: "USDT",
  },
];

/**
 * Terminales de punto de venta del local. Con dos o más, la cajera elige por
 * cuál pasó la tarjeta; con uno, se asume.
 * TODO(F4-02): se configuran en Configuración; hoy son de ejemplo.
 */
export const DEMO_TERMINALES: readonly PosTerminalDto[] = PosTerminalSchema.array().parse([
  { id: "pdv-banesco", name: "Punto Banesco", bank: "Banesco" },
  { id: "pdv-mercantil", name: "Punto Mercantil", bank: "Mercantil" },
]);
