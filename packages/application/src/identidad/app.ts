/**
 * La app de autenticación (TOTP, RFC 6238) — ADR-029, M-23.
 *
 * Google Authenticator, Authy, Microsoft Authenticator o el gestor de contraseñas del iPhone dan un
 * código de 6 cifras que cambia cada 30 s. Es el segundo factor que funciona en cualquier equipo:
 * el código se escribe, no hace falta huella, Windows Hello ni Bluetooth.
 *
 * El secreto se guarda cifrado (AES-256-GCM, `L2_CLAVE_CIFRADO`) y solo sale en claro una vez, para
 * el QR. Se acepta el intervalo de ahora y el de al lado (el reloj del teléfono puede ir algo
 * desfasado), y **un código ya aceptado no vale otra vez**: se guarda el último intervalo usado y
 * solo pasa uno posterior (la deuda del TOTP de antes de T-4, que se podía repetir en su ventana).
 */
import { Secret, TOTP } from "otpauth";
import type { Transaccion } from "@l2/database";
import type { Cifrador } from "./cifrado.ts";

/** Lo que dura cada código. */
const PERIODO_S = 30;
const CODIGO_DE_LA_APP = /^\d{6}$/;
/** Como lo enseña la app: «L2 Control (Abigail Karam)». */
const EMISOR = "L2 Control";

const totpDe = (secretoBase32: string, etiqueta: string) =>
  new TOTP({ issuer: EMISOR, label: etiqueta, secret: Secret.fromBase32(secretoBase32), algorithm: "SHA1", digits: 6, period: PERIODO_S });

/** El intervalo de 30 s de un instante. */
export const intervaloDe = (ahora: number): number => Math.floor(ahora / 1000 / PERIODO_S);

/** El código como se compara: solo cifras, sin espacios. `null` si no son seis. */
export function normalizarCodigoDeApp(texto: string): string | null {
  const t = texto.replace(/\s/g, "");
  return CODIGO_DE_LA_APP.test(t) ? t : null;
}

/** Un secreto nuevo (160 bits) con lo que necesita la app para darlo de alta. */
export function secretoNuevo(etiqueta: string): { secretoBase32: string; otpauth: string } {
  const secreto = new Secret({ size: 20 });
  return { secretoBase32: secreto.base32, otpauth: totpDe(secreto.base32, etiqueta).toString() };
}

/**
 * El intervalo del código si vale para ese secreto en ese instante (el de ahora o uno al lado), o
 * `null`. No mira si ya se usó: eso lo decide quien lo consume con `last_step`.
 */
export function intervaloDelCodigo(secretoBase32: string, codigo: string, ahora: number): number | null {
  const c = normalizarCodigoDeApp(codigo);
  if (c === null) return null;
  const delta = totpDe(secretoBase32, "").validate({ token: c, timestamp: ahora, window: 1 });
  return delta === null ? null : intervaloDe(ahora) + delta;
}

/** Lo que se sabe de una app que acepta un código: de quién es y cómo dejar constancia. */
export interface AppReconocida {
  readonly userId: string;
  /** Anota el intervalo como usado. Si otra petición lo usó a la vez, lanza: solo una lo gasta. */
  consumir(): Promise<void>;
}

/**
 * Busca la app confirmada que acepta el código, entre las de `userId` o, sin él, entre las de
 * `candidatos` (aprobar un equipo: el código dice de quién es). Si lo aceptan dos apps a la vez
 * (una coincidencia de 6 cifras entre dos personas), no vale ninguna: mejor pedir otro código que
 * adivinar de quién es.
 */
export async function reconocerApp(
  tx: Transaccion,
  cifrador: Cifrador,
  p: { codigo: string; userId?: string | null; candidatos?: readonly string[]; ahora: number },
): Promise<AppReconocida | null> {
  const donde = p.userId ? { userId: p.userId } : { userId: { in: [...(p.candidatos ?? [])] } };
  const apps = await tx.totpCredential.findMany({ where: { ...donde, confirmedAt: { not: null }, retiredAt: null } });
  const aceptan: { id: string; userId: string; intervalo: number }[] = [];
  for (const a of apps) {
    let secreto: string;
    try {
      secreto = cifrador.descifrar(a.secretEnc);
    } catch {
      continue; // Cifrado con otra clave: esa app no vale en este servidor.
    }
    const intervalo = intervaloDelCodigo(secreto, p.codigo, p.ahora);
    // Un código de un intervalo ya aceptado (o anterior) no vale: es una repetición.
    if (intervalo !== null && (a.lastStep === null || BigInt(intervalo) > a.lastStep)) aceptan.push({ id: a.id, userId: a.userId, intervalo });
  }
  if (aceptan.length !== 1) return null;
  const [buena] = aceptan as [(typeof aceptan)[number]];
  return {
    userId: buena.userId,
    async consumir() {
      // Con la condición en el `where`: si dos peticiones traen el mismo código, solo una lo gasta.
      const r = await tx.totpCredential.updateMany({
        where: { id: buena.id, retiredAt: null, OR: [{ lastStep: null }, { lastStep: { lt: BigInt(buena.intervalo) } }] },
        data: { lastStep: BigInt(buena.intervalo), lastUsedAt: new Date(p.ahora) },
      });
      if (r.count !== 1) throw new Error("Ese código de la app ya se había usado.");
    },
  };
}
