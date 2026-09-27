/**
 * Credenciales de equipo y de sesión (ADR-018): `tenantId.id.secreto`.
 *
 * - El **secreto** son 32 bytes aleatorios (256 bits) en base64url. Solo existe en la cookie
 *   `httpOnly` del navegador; la base guarda su SHA-256. Un volcado de la base no sirve para
 *   entrar.
 * - El **tenant** va en claro, porque hace falta para abrir la transacción correcta (RLS) y no
 *   es secreto. Cambiarlo solo hace buscar la credencial donde no existe.
 * - El **id** localiza la fila sin recorrer la tabla, y el hash se compara en tiempo constante.
 *
 * Con 256 bits aleatorios, SHA-256 basta: no hace falta un hash lento, porque no hay
 * diccionario que probar. El PIN sí lo necesita (Argon2id, `pin.ts`).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRETO = /^[A-Za-z0-9_-]{43}$/;

export interface Credencial {
  readonly tenantId: string;
  readonly id: string;
  readonly secreto: string;
}

export function nuevoSecreto(): string {
  return randomBytes(32).toString("base64url");
}

export function huella(secreto: string): string {
  return createHash("sha256").update(secreto, "utf8").digest("hex");
}

/** ¿Este secreto corresponde a esta huella? En tiempo constante. */
export function coincide(secreto: string, huellaGuardada: string): boolean {
  const a = Buffer.from(huella(secreto), "hex");
  const b = Buffer.from(huellaGuardada, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function componer(c: Credencial): string {
  return `${c.tenantId}.${c.id}.${c.secreto}`;
}

/** Lee una credencial de una cookie. Cualquier cosa que no tenga la forma exacta es `null`. */
export function leerCredencial(texto: string | undefined | null): Credencial | null {
  if (!texto) return null;
  const partes = texto.split(".");
  if (partes.length !== 3) return null;
  const [tenantId, id, secreto] = partes as [string, string, string];
  if (!UUID.test(tenantId) || !UUID.test(id) || !SECRETO.test(secreto)) return null;
  return { tenantId, id, secreto };
}

/** Sin 0/O ni 1/I: se leen en voz alta y se comparan de un vistazo. 32 símbolos, 5 bits cada uno. */
const SIMBOLOS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * El código de emparejamiento de un equipo (M-7), «K7F-2QX». Sale de su id y siempre es el mismo,
 * así que lo pueden enseñar a la vez el equipo pendiente, el panel y la consola sin guardarlo.
 * No es secreto ni da acceso: sirve para comprobar que se aprueba el aparato que se tiene delante.
 */
export function codigoDeEmparejamiento(deviceId: string): string {
  const h = createHash("sha256").update(`l2-emparejamiento:${deviceId}`, "utf8").digest();
  let texto = "";
  for (let i = 0; i < 6; i++) texto += SIMBOLOS[h[i]! & 31];
  return `${texto.slice(0, 3)}-${texto.slice(3)}`;
}
