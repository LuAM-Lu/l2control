/**
 * El ticket del canal en vivo — B5-1, ADR-008 («la autorización ocurre en el apretón de manos») y
 * ADR-025.
 *
 * El navegador no manda su cookie al worker: pide al servidor web un ticket firmado, que dice de
 * qué sesión es y caduca en segundos, y lo presenta al conectarse. El worker comprueba la firma, el
 * plazo y, en la base, que la sesión siga viva; solo entonces le da las salas de SU tenant y SU
 * sucursal. Nada del ticket lo decide el navegador.
 *
 * La firma es HMAC-SHA256 con una clave derivada (HKDF) de `L2_CLAVE_CIFRADO`: los dos procesos la
 * tienen y ninguna otra cosa firma con ella, así que un ticket no se confunde con otro dato cifrado.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/** Cuánto vale un ticket desde que se firma: lo justo para conectarse. */
export const TICKET_MS = 60_000;

export interface DatosDelTicket {
  readonly tenantId: string;
  readonly branchId: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly deviceId: string;
}

export interface Firmante {
  firmar(datos: DatosDelTicket, ahora: number): string;
  /** Los datos del ticket si la firma es buena y no caducó; si no, `null`. */
  abrir(ticket: string, ahora: number): DatosDelTicket | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function crearFirmante(claveCifradoBase64: string): Firmante {
  const clave = Buffer.from(hkdfSync("sha256", Buffer.from(claveCifradoBase64, "base64"), Buffer.alloc(0), "l2-tiempo-real-ticket", 32));
  const firma = (cuerpo: string) => createHmac("sha256", clave).update(cuerpo).digest();

  return {
    firmar(datos, ahora) {
      const cuerpo = Buffer.from(
        JSON.stringify({ t: datos.tenantId, b: datos.branchId, s: datos.sessionId, u: datos.userId, d: datos.deviceId, v: ahora + TICKET_MS }),
      ).toString("base64url");
      return `${cuerpo}.${firma(cuerpo).toString("base64url")}`;
    },

    abrir(ticket, ahora) {
      if (typeof ticket !== "string" || ticket.length > 1000) return null;
      const [cuerpo, sello, sobra] = ticket.split(".");
      if (!cuerpo || !sello || sobra !== undefined) return null;
      const esperado = firma(cuerpo);
      const dado = Buffer.from(sello, "base64url");
      if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return null;
      let d: unknown;
      try {
        d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (typeof d !== "object" || d === null) return null;
      const { t, b, s, u, d: dev, v } = d as Record<string, unknown>;
      if (typeof v !== "number" || v < ahora) return null;
      if (![t, b, s, u, dev].every((x) => typeof x === "string" && UUID.test(x))) return null;
      return { tenantId: t as string, branchId: b as string, sessionId: s as string, userId: u as string, deviceId: dev as string };
    },
  };
}
