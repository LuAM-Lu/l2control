/**
 * La cédula y el teléfono del cliente de una cuenta o de una deuda, para leerlos en un renglón — B6-22 (M-40).
 *
 * Sentado «Más rápido», puede faltar la cédula (si se fue antes de darla); con «Solo si queda una deuda», el teléfono.
 * Lo que falta se dice, no se deja un «·» suelto.
 */
export function datosDeContacto(c: Readonly<{ cedula: string | null; telefono: string | null }>): string {
  return [c.cedula ?? "Sin cédula", c.telefono ?? "Sin teléfono"].join(" · ");
}
