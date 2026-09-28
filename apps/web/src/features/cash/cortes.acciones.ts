"use server";

import { revalidatePath } from "next/cache";
import type { ArqueoDto, CorteDto, PendientesDelCierreDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El cierre del turno y de la jornada (B3-5). Opera como la persona de la sesión; lo que llega es
 * `unknown` y el caso de uso lo revalida (ADR-017). Al log van el turno y el motivo, nunca lo contado
 * ni el PIN de quien firma (§7.6).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;
const turnoDe = (x: unknown) => (typeof x === "string" && x.length > 0 ? x : undefined);

/** Cómo va el turno (sin la gaveta): el del equipo, u otro con `turnoId` para quien ve la sucursal. */
export async function leerVistaDelTurno(turnoId?: unknown): Promise<Resultado<CorteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).cortes.vista(ctx, turnoDe(turnoId));
}

/** El corte X: el informe del turno, que queda guardado. No cambia el turno. */
export async function hacerCorteX(entrada: unknown): Promise<Resultado<CorteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cortes.corteX(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, turno: r.valor.turno.id }, "corte X");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "corte X rechazado");
  return r;
}

/** Registra el conteo a ciegas de la gaveta y devuelve la diferencia y quién firma el Z. */
export async function registrarArqueo(entrada: unknown): Promise<Resultado<ArqueoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cortes.arquear(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, turno: r.valor.turnoId, firma: r.valor.firma }, "arqueo registrado");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "arqueo rechazado");
  return r;
}

/** Sella el turno con el corte Z. `autorizacion`: el PIN de quien firma (la cajera o supervisión). */
export async function sellarCorteZ(entrada: unknown, autorizacion?: unknown): Promise<Resultado<CorteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cortes.corteZ(ctx, entrada, autorizacion);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, turno: r.valor.turno.id, cierre: r.valor.cierre?.tipo, firma: r.valor.cierre?.firma }, "turno sellado con corte Z");
    // La barra, la caja e Inicio leen el turno en el servidor: que lo lean ya.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "corte Z rechazado");
  }
  return r;
}

/** Lo que impide cerrar la jornada, sin contar el turno que se va a cerrar. */
export async function leerPendientesDelCierre(turnoId?: unknown): Promise<Resultado<PendientesDelCierreDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).cortes.pendientes(ctx, turnoDe(turnoId));
}
