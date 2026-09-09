/**
 * Turno de ejemplo para la pantalla de cortes.
 *
 * Los movimientos son los que habría generado una tarde de operación: fondo
 * inicial, cobros por varias vías, vueltos entregados y una salida de caja.
 */
import { fromMajor, type Money } from "@l2/domain-money";
import type { ShiftMovement } from "@l2/domain-cash";

export type Excepcion = Readonly<{
  hora: string;
  tipo: "ANULACIÓN" | "DESCUENTO" | "CORTESÍA" | "REIMPRESIÓN";
  detalle: string;
  usuario: string;
  motivo: string;
  autorizadoPor: string | null;
}>;

/** Denominaciones que circulan, para el conteo del arqueo (F4-07). */
export const DENOMINACIONES: Record<"USD" | "VES", Money[]> = {
  USD: [
    fromMajor("100.00", "USD"),
    fromMajor("50.00", "USD"),
    fromMajor("20.00", "USD"),
    fromMajor("10.00", "USD"),
    fromMajor("5.00", "USD"),
    fromMajor("1.00", "USD"),
    fromMajor("0.25", "USD"),
  ],
  VES: [
    fromMajor("500.00", "VES"),
    fromMajor("200.00", "VES"),
    fromMajor("100.00", "VES"),
    fromMajor("50.00", "VES"),
    fromMajor("20.00", "VES"),
    fromMajor("10.00", "VES"),
  ],
};

export const DEMO_SHIFT_MOVEMENTS: ShiftMovement[] = [
  // Fondo inicial declarado por moneda (F4-01)
  { kind: "OPENING_FLOAT", methodCode: "EFECTIVO_USD", amount: fromMajor("50.00", "USD"), inDrawer: true },
  { kind: "OPENING_FLOAT", methodCode: "EFECTIVO_VES", amount: fromMajor("2000.00", "VES"), inDrawer: true },

  // Cobros de la tarde
  { kind: "PAYMENT", methodCode: "EFECTIVO_USD", amount: fromMajor("11.17", "USD"), inDrawer: true },
  { kind: "PAYMENT", methodCode: "EFECTIVO_USD", amount: fromMajor("24.00", "USD"), inDrawer: true },
  { kind: "PAYMENT", methodCode: "EFECTIVO_VES", amount: fromMajor("3426.15", "VES"), inDrawer: true },
  { kind: "PAYMENT", methodCode: "PAGO_MOVIL", amount: fromMajor("18272.80", "VES"), inDrawer: false },
  { kind: "PAYMENT", methodCode: "PDV_DEBITO", amount: fromMajor("9136.40", "VES"), inDrawer: false },
  { kind: "PAYMENT", methodCode: "ZELLE", amount: fromMajor("35.00", "USD"), inDrawer: false },
  { kind: "PAYMENT", methodCode: "USDT", amount: fromMajor("18.00", "USDT"), inDrawer: false },

  // Vueltos entregados: SALEN de la gaveta
  { kind: "CHANGE_OUT", methodCode: "EFECTIVO_USD", amount: fromMajor("2.59", "USD"), inDrawer: true },
  { kind: "CHANGE_OUT", methodCode: "EFECTIVO_VES", amount: fromMajor("573.85", "VES"), inDrawer: true },

  // Propina en efectivo: está en la gaveta aunque no sea ingreso del negocio
  { kind: "TIP_IN_DRAWER", methodCode: "EFECTIVO_USD", amount: fromMajor("3.00", "USD"), inDrawer: true },

  // Salida de caja registrada
  { kind: "PAYOUT", methodCode: "EFECTIVO_USD", amount: fromMajor("15.00", "USD"), inDrawer: true },
];

/** Etiquetas legibles de cada medio. */
export const MEDIO_LABEL: Record<string, string> = {
  EFECTIVO_USD: "Efectivo $",
  EFECTIVO_VES: "Efectivo Bs",
  PAGO_MOVIL: "Pago Móvil",
  PDV_DEBITO: "Punto débito",
  ZELLE: "Zelle",
  USDT: "USDT",
};

/**
 * Excepciones del turno (F4-08).
 *
 * §7.5 punto 8: no van enterradas en un log, van en un reporte que el
 * administrador ve. Un residuo pequeño y recurrente en el mismo cajero es la
 * señal de fraude interno más barata de detectar.
 */
export const DEMO_EXCEPCIONES: Excepcion[] = [
  {
    hora: "15:42",
    tipo: "ANULACIÓN",
    detalle: "Paquete 1 hora · AK-0188",
    usuario: "M. Prieto",
    motivo: "Error al registrar el paquete",
    autorizadoPor: "L. Guerrero",
  },
  {
    hora: "16:20",
    tipo: "DESCUENTO",
    detalle: "Cuenta #1042 · 10 %",
    usuario: "M. Prieto",
    motivo: "Cumpleaños del niño",
    autorizadoPor: "L. Guerrero",
  },
  {
    hora: "17:05",
    tipo: "CORTESÍA",
    detalle: "Paquete 30 min · AK-0195",
    usuario: "L. Guerrero",
    motivo: "Falla del sistema en la entrada",
    autorizadoPor: "L. Guerrero",
  },
  {
    hora: "18:11",
    tipo: "REIMPRESIÓN",
    detalle: "Documento #1038",
    usuario: "M. Prieto",
    motivo: "El cliente perdió el ticket",
    autorizadoPor: "L. Guerrero",
  },
];
