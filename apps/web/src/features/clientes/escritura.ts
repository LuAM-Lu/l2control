import { DocumentoVeSchema, TelefonoVeSchema } from "@l2/contracts";

/**
 * La cédula y el teléfono mientras se escriben — T-19 (M-34, S-19).
 *
 * En el local se tecleaban de cualquier forma («v12345678», «0414 123 45 67», «+58 414…») y un dígito de menos no se
 * veía hasta que el servidor lo rechazaba. Aquí se separa lo que se escribe (o se pega) en sus partes, se guarda en la
 * forma de la casa («V-12345678», «0414-1234567») y se muestra con puntos para leerlo de un vistazo («12.345.678»,
 * «0414-123.45.67»). Lo que se valida es lo mismo que valida el servidor: los esquemas de `@l2/contracts`.
 */

/** Las letras de un documento de Venezuela: V y E de cédula; J, G y P de RIF. */
export const LETRAS_DE_DOCUMENTO = ["V", "E", "J", "G", "P"] as const;
export type LetraDeDocumento = (typeof LETRAS_DE_DOCUMENTO)[number];

const esRif = (letra: string) => letra === "J" || letra === "G" || letra === "P";
/** Hasta 9 dígitos de cédula; el RIF, 8 y su dígito verificador. */
const MAX_DIGITOS = 9;

/**
 * Lo escrito o pegado, en su letra y sus dígitos: «v-12.345.678» es V y 12345678. La letra cuenta si va antes del
 * primer dígito; si no hay, se queda la que había (`letra`).
 */
export function partesDelDocumento(texto: string, letra: LetraDeDocumento = "V"): { letra: LetraDeDocumento; digitos: string } {
  const t = texto.toUpperCase();
  const primerDigito = t.search(/\d/);
  const antes = primerDigito === -1 ? t : t.slice(0, primerDigito);
  const escrita = [...antes].reverse().find((c): c is LetraDeDocumento => (LETRAS_DE_DOCUMENTO as readonly string[]).includes(c));
  return { letra: escrita ?? letra, digitos: t.replace(/\D/g, "").slice(0, MAX_DIGITOS) };
}

/** El documento como se guarda: «V-12345678», y un RIF entero «J-40123456-7». Sin dígitos, vacío. */
export function documentoDe(letra: LetraDeDocumento, digitos: string): string {
  if (!digitos) return "";
  return esRif(letra) && digitos.length === 9 ? `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}` : `${letra}-${digitos}`;
}

/** Los dígitos como se leen: «12.345.678»; el RIF, «40.123.456-7». */
export function digitosALaVista(letra: LetraDeDocumento, digitos: string): string {
  const cuerpo = esRif(letra) && digitos.length === 9 ? digitos.slice(0, 8) : digitos;
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cuerpo === digitos ? conPuntos : `${conPuntos}-${digitos.slice(8)}`;
}

/** Qué le falta al documento para valer (lo mismo que mira el servidor), o `null` si vale o está vacío. */
export function problemaDelDocumento(documento: string): string | null {
  if (!documento.trim()) return null;
  const { letra, digitos } = partesDelDocumento(documento);
  if (esRif(letra) && digitos.length !== 9) return "El RIF lleva 9 dígitos: J-40123456-7";
  if (digitos.length < 5) return "Faltan dígitos: la cédula lleva de 5 a 9";
  return DocumentoVeSchema.safeParse(documento.replace(/[\s.]/g, "")).success ? null : "Documento no válido: V-12345678 o J-40123456-7";
}

/**
 * Los dígitos de un teléfono de Venezuela, escritos o pegados: «+58 414 1234567» y «414-1234567» son 04141234567. Se
 * queda en 11.
 */
export function digitosDelTelefono(texto: string): string {
  let d = texto.replace(/\D/g, "");
  if (d.startsWith("58") && (texto.trim().startsWith("+") || d.length >= 12)) d = `0${d.slice(2)}`;
  else if (/^[24]/.test(d)) d = `0${d}`;
  return d.slice(0, 11);
}

/** El teléfono como se guarda: «0414-1234567» (con lo que lleve escrito, si aún no está entero). */
export function telefonoDe(digitos: string): string {
  return digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
}

/** El teléfono como se lee: «0414-123.45.67». */
export function telefonoALaVista(digitos: string): string {
  if (digitos.length <= 4) return digitos;
  const resto = digitos.slice(4);
  const grupos = [resto.slice(0, 3), resto.slice(3, 5), resto.slice(5, 7)].filter(Boolean);
  return `${digitos.slice(0, 4)}-${grupos.join(".")}`;
}

/** Qué le falta al teléfono para valer (lo mismo que mira el servidor), o `null` si vale o está vacío. */
export function problemaDelTelefono(telefono: string): string | null {
  const d = telefono.replace(/\D/g, "");
  if (!d) return null;
  if (d.length < 11) return `${11 - d.length === 1 ? "Falta un dígito" : `Faltan ${11 - d.length} dígitos`}: 0414-1234567`;
  return TelefonoVeSchema.safeParse(telefonoDe(d)).success ? null : "Ese código no es de Venezuela: 0412, 0414, 0416, 0422, 0424, 0426 o un fijo 02xx";
}

/**
 * Dónde queda el cursor al reescribir el campo: después del mismo número de dígitos que tenía antes. Así, corregir un
 * dígito en medio no manda el cursor al final.
 */
export function cursorTrasDigitos(vista: string, digitosAntes: number): number {
  if (digitosAntes <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < vista.length; i++) {
    if (/\d/.test(vista[i]!)) vistos++;
    if (vistos === digitosAntes) return i + 1;
  }
  return vista.length;
}
