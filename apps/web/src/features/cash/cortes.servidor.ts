import "server-only";
import { connection } from "next/server";
import type { ComprobacionAperturaDto, CorteDto, ResumenDelDiaDto, Resultado, TurnoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El cierre del turno leído en el servidor (B3-5). Todo sale del libro del turno: la pantalla no
 * suma cobros ni adivina la gaveta.
 */

/**
 * Cómo va un turno, sin la gaveta (el arqueo es a ciegas): el del equipo o, con `turnoId`, uno de
 * otro equipo para quien ve la sucursal. `null` sin sesión; el rechazo, tal cual, para decirlo.
 */
export async function vistaDelTurno(turnoId?: string): Promise<Resultado<CorteDto> | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).cortes.vista(ctx, turnoId);
  if (!r.ok && r.motivo !== "NO_DISPONIBLE") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "vista del turno no disponible");
  return r;
}

/** El último corte Z de este equipo: lo que se enseña al volver después de cerrar. */
export async function ultimoCorteZ(): Promise<CorteDto | null> {
  await connection();
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).cortes.ultimoZ(ctx) : null;
}

/** Lo que falta para trabajar al abrir el turno (JORNADA §3, A3). */
export async function comprobacionApertura(): Promise<ComprobacionAperturaDto | null> {
  await connection();
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).cortes.comprobarApertura(ctx) : null;
}

/** El resumen del día para Inicio (JORNADA §5, C6). `null` sin sesión o sin permiso de ver la sucursal. */
export async function resumenDelDia(): Promise<ResumenDelDiaDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).cortes.resumenDelDia(ctx);
  return r.ok ? r.valor : null;
}

/**
 * Los turnos abiertos en otros equipos (JORNADA §3: lo que quedó de antes se enseña antes que nada).
 * Sale de los pendientes del cierre, que también ve la cajera. Vacío sin sesión o sin permiso.
 */
export async function turnosAbiertosDeOtros(): Promise<TurnoDto[]> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).cortes.pendientes(ctx);
  return r.ok ? r.valor.turnos : [];
}
