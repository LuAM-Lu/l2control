import "server-only";
import { cookies } from "next/headers";
import { entorno } from "./entorno";

/**
 * El tema de ESTE equipo: claro (el predeterminado) u oscuro. Es una preferencia de cómo se ve la
 * pantalla, no un dato del negocio, y va por equipo: la laptop de caja, la tablet del mesero y el
 * teléfono de la monitora son compartidos, y cada puesto se queda como lo dejaron (a pleno sol
 * conviene el claro; en la sala, el oscuro). Por eso vive en una cookie del navegador y no en la
 * base: no hay nada que auditar ni que sincronizar entre equipos.
 *
 * La cookie es `httpOnly` como las otras dos: la lee el servidor para pintar `data-tema` en
 * <html> desde el primer byte, sin el parpadeo de un tema que se corrige al cargar.
 */
export const TEMAS = ["oscuro", "claro"] as const;
export type Tema = (typeof TEMAS)[number];

const COOKIE_TEMA = "l2_tema";
const CINCO_AÑOS = 5 * 365 * 24 * 60 * 60;

export const esTema = (v: unknown): v is Tema => typeof v === "string" && (TEMAS as readonly string[]).includes(v);

export async function temaDelEquipo(): Promise<Tema> {
  const guardado = (await cookies()).get(COOKIE_TEMA)?.value;
  // Sin preferencia guardada, el claro: es el predeterminado (pedido del usuario, 2026-10-06).
  return esTema(guardado) ? guardado : "claro";
}

export async function guardarTemaDelEquipo(tema: Tema): Promise<void> {
  (await cookies()).set(COOKIE_TEMA, tema, {
    httpOnly: true,
    sameSite: "lax",
    secure: entorno().L2_ENTORNO !== "desarrollo",
    path: "/",
    maxAge: CINCO_AÑOS,
  });
}
