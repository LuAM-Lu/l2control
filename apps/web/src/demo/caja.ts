/**
 * Datos de ejemplo de caja.
 *
 * La cuenta representa una liquidación de parque cobrada en caja, que es
 * el caso que enlaza con la pantalla de salida.
 */
import { fromMajor } from "@l2/domain-money";
import { PosTerminalSchema, type PosTerminalDto } from "@l2/contracts";
import type { MedioPago } from "../features/cash/medios.ts";

/**
 * Umbral máximo que puede quedarse en caja como residuo (§5.6).
 * Ahora vive en los ajustes de la sucursal. Se deja aquí hasta F0-04 o hasta que se elimine.
 */
export const DEMO_MAX_RETAINED = fromMajor("0.05", "USD");

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
