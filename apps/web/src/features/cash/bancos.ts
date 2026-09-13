/**
 * Bancos de Venezuela con su código de 4 dígitos (el que aparece al inicio de
 * la cuenta y en el Pago Móvil). Los de uso más frecuente van primero: en una
 * lista de treinta, el que se busca a diario no puede estar al fondo.
 * TODO(F4-02): cuando la sucursal lo configure, el orden saldrá de lo que más
 * se usa en ese local.
 */
export type Banco = Readonly<{ code: string; name: string }>;

export const BANCOS_VE: readonly Banco[] = [
  { code: "0134", name: "Banesco" },
  { code: "0102", name: "Banco de Venezuela" },
  { code: "0105", name: "Mercantil" },
  { code: "0108", name: "Provincial" },
  { code: "0191", name: "BNC" },
  { code: "0172", name: "Bancamiga" },
  { code: "0114", name: "Bancaribe" },
  { code: "0151", name: "BFC" },
  { code: "0175", name: "Bicentenario" },
  { code: "0174", name: "Banplus" },
  { code: "0138", name: "Banco Plaza" },
  { code: "0115", name: "Exterior" },
  { code: "0163", name: "Banco del Tesoro" },
  { code: "0104", name: "Venezolano de Crédito" },
  { code: "0171", name: "Banco Activo" },
  { code: "0169", name: "R4 (Mi Banco)" },
  { code: "0128", name: "Banco Caroní" },
  { code: "0137", name: "Sofitasa" },
  { code: "0156", name: "100% Banco" },
  { code: "0157", name: "DelSur" },
  { code: "0166", name: "Banco Agrícola" },
  { code: "0168", name: "Bancrecer" },
  { code: "0177", name: "Banfanb" },
  { code: "0178", name: "N58 Banco Digital" },
];

export function nombreBanco(code: string): string {
  return BANCOS_VE.find((b) => b.code === code)?.name ?? `Banco ${code}`;
}
