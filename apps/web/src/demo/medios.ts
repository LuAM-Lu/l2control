import { MediosDePagoSchema, type MediosDePagoDto } from "@l2/contracts";
import { DEMO_TENDERS, DEMO_TERMINALES } from "./caja.ts";

/**
 * Datos de ejemplo de la configuración de medios de pago.
 * TODO(F4-02/backend): La configuración vendrá del servidor hasta F0-04.
 */
export const MEDIOS_DEMO: MediosDePagoDto = MediosDePagoSchema.parse({
  medios: DEMO_TENDERS.map((t) => ({
    code: t.code,
    label: t.label,
    currency: t.currency,
    triggersIgtf: t.triggersIgtf,
    canGiveChange: t.canGiveChange,
    datos: t.datos,
    activo: true,
  })),
  terminales: DEMO_TERMINALES,
  pagoMovil: {
    bankCode: "0134",
    phone: "0414-2345678",
    document: "J-40123456-7",
  },
  zelle: {
    holder: "Parque Infantil L2 C.A.",
    email: "pagos@parquel2.com",
  },
});
