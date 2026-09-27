/**
 * Los datos de cobro de desarrollo (B3-2): inventados, para que la caja local ofrezca todos los
 * medios. Ninguno es una cuenta real; los del local se cargan en Ajustes → Medios de pago (F0-04).
 */
export const MEDIOS_DE_DESARROLLO = [
  { kind: "DATOS_PAGO_MOVIL", datos: { bankCode: "0134", phone: "0414-2345678", document: "J-40123456-7" } },
  { kind: "DATOS_ZELLE", datos: { holder: "Parque Infantil L2 C.A.", email: "pagos@abby-kingdom.example" } },
  { kind: "AÑADIR_TERMINAL", terminal: { name: "Punto Banesco", bank: "Banesco" } },
  { kind: "AÑADIR_TERMINAL", terminal: { name: "Punto Mercantil", bank: "Mercantil" } },
  { kind: "ACTIVAR", code: "PAGO_MOVIL", activo: true },
  { kind: "ACTIVAR", code: "PDV_DEBITO", activo: true },
  { kind: "ACTIVAR", code: "ZELLE", activo: true },
] as const;
