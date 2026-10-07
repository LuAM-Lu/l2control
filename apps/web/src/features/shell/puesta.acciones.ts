"use server";

import type { PuestaAPuntoDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/** Dejar un punto recomendable de la Puesta a punto para después, o retomarlo (T-8b). */
export async function posponerPunto(entrada: unknown): Promise<Resultado<PuestaAPuntoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
  return (await aplicacion()).puestaAPunto.posponer(ctx, entrada);
}
