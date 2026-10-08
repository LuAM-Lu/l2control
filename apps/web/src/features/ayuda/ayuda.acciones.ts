"use server";

import type { RecorridosVistosDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Anota que la persona de la sesión vio (o saltó) un recorrido guiado (T-12). Lo que llega se revalida. */
export async function marcarRecorridoVisto(entrada: unknown): Promise<Resultado<RecorridosVistosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).recorridos.marcar(ctx, entrada);
}
