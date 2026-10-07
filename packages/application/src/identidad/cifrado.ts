/**
 * Cifrado en reposo (§7.6): AES-256-GCM de `node:crypto`, sin criptografía casera.
 *
 * Para lo que el sistema tiene que poder LEER de vuelta: los datos de cada pago y los datos de
 * cobro del local (B3-2). Lo que solo hay que comprobar (PIN,
 * contraseña) no se cifra: se hashea.
 *
 * `huella` es un HMAC-SHA256 con una clave DERIVADA de la misma (HKDF, otro propósito): reconoce
 * dos veces la misma referencia de pago sin guardarla en claro, y no sirve para descifrar nada.
 *
 * Formato: `v1.<iv>.<etiqueta>.<cifrado>`, todo en base64url. El IV son 12 bytes aleatorios
 * por mensaje; GCM autentica, así que un texto manipulado no se descifra: falla.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

export interface Cifrador {
  cifrar(texto: string): string;
  descifrar(cifrado: string): string;
  /** Huella hexadecimal de 64 caracteres, siempre la misma para el mismo texto y la misma clave. */
  huella(texto: string): string;
}

/** `clave` son 32 bytes en base64 (L2_CLAVE_CIFRADO). Con otra longitud, se niega. */
export function crearCifrador(clave: string): Cifrador {
  const k = Buffer.from(clave, "base64");
  if (k.length !== 32) {
    throw new Error("La clave de cifrado debe ser de 32 bytes en base64 (openssl rand -base64 32).");
  }
  const claveHuella = Buffer.from(hkdfSync("sha256", k, Buffer.alloc(0), "l2control/huella-de-referencia/v1", 32));
  return {
    huella(texto) {
      return createHmac("sha256", claveHuella).update(texto, "utf8").digest("hex");
    },
    cifrar(texto) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", k, iv);
      const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
      return ["v1", iv, c.getAuthTag(), datos].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
    },
    descifrar(cifrado) {
      const [version, iv, etiqueta, datos] = cifrado.split(".");
      if (version !== "v1" || !iv || !etiqueta || datos === undefined) throw new Error("Texto cifrado con formato desconocido.");
      const vector = Buffer.from(iv, "base64url");
      const tag = Buffer.from(etiqueta, "base64url");
      // La etiqueta, entera (B7-5): Node acepta etiquetas GCM más cortas si no se le dice el largo, y con una de
      // 4 bytes falsificar un texto cifrado deja de ser imposible.
      if (vector.length !== 12 || tag.length !== 16) throw new Error("Texto cifrado con formato desconocido.");
      const d = createDecipheriv("aes-256-gcm", k, vector, { authTagLength: 16 });
      d.setAuthTag(tag);
      return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
    },
  };
}
