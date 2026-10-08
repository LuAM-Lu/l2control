"use server";

import type { ReporteDto, ReporteEnviadoDto, ReportesDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Reportar un problema y seguirlo (T-11, M-27, P-4). Quién reporta, su rol y el equipo salen de SU sesión, nunca de lo
 * que diga la página; lo que llega se revalida entero en el servidor.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Envía un reporte (texto, pantalla, versión, últimos errores y, si se dejó, la captura). */
export async function reportarProblema(entrada: unknown): Promise<Resultado<ReporteEnviadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).soporte.reportar(ctx, entrada);
}

/** Los reportes de la persona de la sesión, con su estado. */
export async function leerMisReportes(): Promise<Resultado<ReportesDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).soporte.mios(ctx);
}

/** Marca un reporte visto, en curso o resuelto en una versión (quien atiende el soporte). */
export async function cambiarEstadoDeReporte(entrada: unknown): Promise<Resultado<ReporteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).soporte.estado(ctx, entrada);
}
