/**
 * Piezas del turno de caja que no son datos de ejemplo — F4-05 a F4-08.
 *
 * TODO(F4-02): denominaciones y nombres de medios saldrán de la configuración
 * de la sucursal; la forma ya es la definitiva.
 */
import { fromMajor, type Money } from "@l2/domain-money";

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

/** Etiquetas legibles de cada medio. */
export const MEDIO_LABEL: Record<string, string> = {
  EFECTIVO_USD: "Efectivo $",
  EFECTIVO_VES: "Efectivo Bs",
  PAGO_MOVIL: "Pago Móvil",
  PDV_DEBITO: "Punto débito",
  ZELLE: "Zelle",
  USDT: "USDT",
};
