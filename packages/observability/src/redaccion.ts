/**
 * Redacción de datos sensibles antes de que lleguen a un log — §7.6: «Ni contactos, ni
 * referencias de pago, ni PIN, ni tokens. Redacción activa en el pipeline de logs,
 * verificada por prueba».
 *
 * Dos redes, porque un dato sensible entra de dos maneras:
 *  1. Por el NOMBRE del campo (`pin`, `referencia`, `telefono`…), en cualquier nivel de
 *     anidamiento. Se compara palabra por palabra del nombre (`pinHash` → pin, hash), no
 *     por subcadena: «tarifa» contiene «rif» y no es un RIF.
 *  2. Por la FORMA del texto, dentro de cualquier cadena: credenciales en una URL de
 *     conexión, un `Bearer …`, un teléfono venezolano. Es lo que atrapa el mensaje de
 *     error que alguien escribió con el dato dentro.
 *
 * Ante la duda se tapa: redactar de más es un log menos útil; de menos, una filtración.
 */

export const REDACTADO = "[REDACTADO]";

/** Palabras que, en el nombre de un campo, lo vuelven secreto. Sin acentos y en minúsculas. */
const PALABRAS_SENSIBLES = new Set([
  // credenciales
  "pin", "password", "contrasena", "clave", "secret", "secreto", "token", "authorization",
  "cookie", "apikey", "otp",
  // referencias de pago y datos financieros identificables (F4-04)
  "referencia", "reference", "txid", "titular", "holder", "iban", "tarjeta",
  // contacto e identidad (§7.6: contacto del representante; DEC-23: documento del cliente)
  "telefono", "phone", "contacto", "contact", "correo", "email", "cedula", "documento", "document", "rif",
]);

/** `pinHash` → [pin, hash]; `referencia_pago` → [referencia, pago]; `Teléfono` → [telefono]. */
function palabras(clave: string): string[] {
  return clave
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Identificadores que contienen una palabra sensible sin serlo: `documentId` señala una cuenta del
 * libro de pagos (§5.5), no una cédula. Lista cerrada y explícita: ante la duda, se tapa.
 */
const IDENTIFICADORES = new Set(["documentid", "documentoid"]);

export function esClaveSensible(clave: string): boolean {
  const partes = palabras(clave);
  if (IDENTIFICADORES.has(partes.join(""))) return false;
  // Cada palabra, y cada par seguido: `txId` → «tx» + «id» = «txid»; `api_key` → «apikey».
  const candidatas = [...partes, ...partes.slice(1).map((p, i) => partes[i] + p)];
  return candidatas.some((p) => PALABRAS_SENSIBLES.has(p));
}

const FORMAS_SENSIBLES: [RegExp, string][] = [
  // postgresql://usuario:contraseña@host → postgresql://usuario:[REDACTADO]@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@]+@/gi, `$1${REDACTADO}@`],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, `$1 ${REDACTADO}`],
  // Móviles de Venezuela: 0414-1234567, 0424 123 4567, +58 412 1234567, 584141234567.
  [/(?:\+?58[\s-]?|\b0)4(?:12|14|16|22|24|26)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, REDACTADO],
];

export function redactarTexto(texto: string): string {
  return FORMAS_SENSIBLES.reduce((t, [forma, reemplazo]) => t.replace(forma, reemplazo), texto);
}

const PROFUNDIDAD_MAXIMA = 8;

/**
 * Copia de `valor` sin nada sensible. No modifica el original. Convierte `bigint` en texto
 * (el dinero es bigint y JSON no sabe escribirlo) y un `Error` en un objeto plano.
 */
export function redactar(valor: unknown): unknown {
  const vistos = new WeakSet<object>();

  const visitar = (v: unknown, profundidad: number): unknown => {
    if (typeof v === "string") return redactarTexto(v);
    if (typeof v === "bigint") return v.toString();
    if (v === null || typeof v !== "object") return v;
    if (vistos.has(v)) return "[CICLO]";
    if (profundidad >= PROFUNDIDAD_MAXIMA) return "[DEMASIADO PROFUNDO]";
    vistos.add(v);

    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map((x) => visitar(x, profundidad + 1));

    const fuente: Record<string, unknown> =
      v instanceof Error
        ? { tipo: v.name, mensaje: v.message, pila: v.stack, ...(v.cause ? { causa: v.cause } : {}), ...v }
        : (v as Record<string, unknown>);

    const copia: Record<string, unknown> = {};
    for (const [clave, x] of Object.entries(fuente)) {
      copia[clave] = esClaveSensible(clave) && x != null ? REDACTADO : visitar(x, profundidad + 1);
    }
    return copia;
  };

  return visitar(valor, 0);
}
