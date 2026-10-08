import "server-only";
import { cookies } from "next/headers";
import { entorno } from "./entorno";

/**
 * Cómo enseña los precios la carta de la caja en ESTE equipo (T-15, M-27, P-12): en dólares, en bolívares o los dos.
 * Con los dos, el precio mixto se ve apretado en su casilla; cada caja elige. Como el tema, es cómo se ve la pantalla
 * y no un dato del negocio: vive en una cookie del navegador, por equipo, y no se audita.
 */
export const VISTAS_DE_PRECIO = ["USD", "VES", "AMBOS"] as const;
export type VistaDePrecios = (typeof VISTAS_DE_PRECIO)[number];

const COOKIE = "l2_precios";
const CINCO_AÑOS = 5 * 365 * 24 * 60 * 60;

export const esVistaDePrecios = (v: unknown): v is VistaDePrecios =>
  typeof v === "string" && (VISTAS_DE_PRECIO as readonly string[]).includes(v);

export async function vistaDePreciosDelEquipo(): Promise<VistaDePrecios> {
  const guardada = (await cookies()).get(COOKIE)?.value;
  // Sin preferencia, los dos: es lo que la caja enseñaba hasta ahora.
  return esVistaDePrecios(guardada) ? guardada : "AMBOS";
}

export async function guardarVistaDePrecios(vista: VistaDePrecios): Promise<void> {
  (await cookies()).set(COOKIE, vista, {
    httpOnly: true,
    sameSite: "lax",
    secure: entorno().L2_ENTORNO !== "desarrollo",
    path: "/",
    maxAge: CINCO_AÑOS,
  });
}
