import "server-only";
import { cache } from "react";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { contextoDeSesion, type Contexto, type SesionActiva } from "@l2/application";
import { aplicacion } from "./aplicacion";
import { entorno } from "./entorno";

/**
 * La sesión y el equipo de la petición en curso (ADR-018).
 *
 * Dos cookies `httpOnly` (el JavaScript de la página no puede leerlas, que es lo que
 * impide robarlas con un XSS), `SameSite=Lax` y `Secure` fuera de desarrollo:
 *   l2_equipo   la credencial del dispositivo, primer factor. Larga: es del aparato.
 *   l2_sesion   la de la persona. Vive lo que la sesión; el servidor la cierra por su cuenta.
 */
export const COOKIE_EQUIPO = "l2_equipo";
export const COOKIE_SESION = "l2_sesion";

const CINCO_AÑOS = 5 * 365 * 24 * 60 * 60;
const DOCE_HORAS = 12 * 60 * 60;

function opciones(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: entorno().L2_ENTORNO !== "desarrollo",
    path: "/",
    maxAge,
  };
}

export async function guardarCookieEquipo(credencial: string): Promise<void> {
  (await cookies()).set(COOKIE_EQUIPO, credencial, opciones(CINCO_AÑOS));
}

export async function guardarCookieSesion(credencial: string): Promise<void> {
  (await cookies()).set(COOKIE_SESION, credencial, opciones(DOCE_HORAS));
}

export async function borrarCookieSesion(): Promise<void> {
  (await cookies()).delete(COOKIE_SESION);
}

export async function credencialEquipo(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_EQUIPO)?.value;
}

export async function credencialSesion(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_SESION)?.value;
}

/** La IP de quien pide, si es una IP. Detrás del proxy del VPS llega en `x-forwarded-for`. */
export async function ipDeLaPeticion(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  return isIP(ip) ? ip : null;
}

/** La sesión viva de esta petición, o `null`. Una sola consulta por petición (`cache`). */
export const sesionActual = cache(async (): Promise<SesionActiva | null> => {
  const credencial = await credencialSesion();
  if (!credencial) return null;
  return (await aplicacion()).sesiones.consultar(credencial, Date.now());
});

/** El contexto para operar como la persona de esta sesión, o `null` si no hay sesión. */
export async function contextoActual(): Promise<Contexto | null> {
  const s = await sesionActual();
  return s ? contextoDeSesion(s, await ipDeLaPeticion()) : null;
}
