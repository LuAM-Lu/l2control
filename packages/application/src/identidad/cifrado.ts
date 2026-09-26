/**
 * Cifrado en reposo (§7.6): AES-256-GCM de `node:crypto`, sin criptografía casera.
 *
 * Para lo que el sistema tiene que poder LEER de vuelta: el secreto TOTP de administración y,
 * en B3-2, las referencias de pago. Lo que solo hay que comprobar (PIN, contraseña) no se
 * cifra: se hashea.
 *
 * Formato: `v1.<iv>.<etiqueta>.<cifrado>`, todo en base64url. El IV son 12 bytes aleatorios
 * por mensaje; GCM autentica, así que un texto manipulado no se descifra: falla.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Cifrador {
  cifrar(texto: string): string;
  descifrar(cifrado: string): string;
}

/** `clave` son 32 bytes en base64 (L2_CLAVE_CIFRADO). Con otra longitud, se niega. */
export function crearCifrador(clave: string): Cifrador {
  const k = Buffer.from(clave, "base64");
  if (k.length !== 32) {
    throw new Error("La clave de cifrado debe ser de 32 bytes en base64 (openssl rand -base64 32).");
  }
  return {
    cifrar(texto) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", k, iv);
      const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
      return ["v1", iv, c.getAuthTag(), datos].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
    },
    descifrar(cifrado) {
      const [version, iv, etiqueta, datos] = cifrado.split(".");
      if (version !== "v1" || !iv || !etiqueta || datos === undefined) throw new Error("Texto cifrado con formato desconocido.");
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(etiqueta, "base64url"));
      return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
    },
  };
}
