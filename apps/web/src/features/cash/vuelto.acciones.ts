"use server";

import type { GavetaAlcanzaDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** ¿Alcanza la gaveta para este vuelto? (B3-19): qué monedas no alcanzan, sin decir cuánto hay. */
export async function gavetaAlcanza(entrada: unknown): Promise<Resultado<GavetaAlcanzaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).vuelto.alcanza(ctx, entrada);
}
