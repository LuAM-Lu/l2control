"use server";

import type {
  HistorialDeImpresionDto,
  ImpresorasAplicadasDto,
  Resultado,
  TrabajoDeImpresionDto,
  TrabajosDeImpresionDto,
  TrabajosDescartadosDto,
} from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las impresoras y la cola de impresión (B5-2, ADR-026). Operan como la persona de la sesión; lo que
 * llega es `unknown` y el caso de uso lo revalida (ADR-017). Al log va qué y cómo fue, nunca el código
 * de vinculación de un agente.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Configura una impresora o un agente (con elevación). Al vincular, devuelve el código una sola vez. */
export async function aplicarImpresora(entrada: unknown): Promise<Resultado<ImpresorasAplicadasDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).impresion.aplicar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, impresoras: r.valor.local.impresoras.length, codigo: r.valor.codigo !== null }, "impresoras cambiadas");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cambio de impresoras rechazado");
  return r;
}

/** La cola de la sucursal (lo de las últimas 24 h). */
export async function leerTrabajos(): Promise<Resultado<TrabajosDeImpresionDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).impresion.trabajos(ctx);
}

/** Una página del historial, con sus filtros. */
export async function leerHistorial(entrada: unknown): Promise<Resultado<HistorialDeImpresionDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).impresion.historial(ctx, entrada);
}

export async function imprimirPrueba(entrada: unknown): Promise<Resultado<TrabajoDeImpresionDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).impresion.imprimirPrueba(ctx, entrada);
}

export async function imprimirCorte(entrada: unknown): Promise<Resultado<TrabajoDeImpresionDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).impresion.imprimirCorte(ctx, entrada);
}

export async function reintentarTrabajo(entrada: unknown): Promise<Resultado<TrabajoDeImpresionDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).impresion.reintentar(ctx, entrada);
}

/** Descarta lo que falló o espera y ya no importa: no se imprime y deja de avisar. */
export async function descartarTrabajos(entrada: unknown): Promise<Resultado<TrabajosDescartadosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).impresion.descartar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, descartados: r.valor.descartados }, "trabajos de impresión descartados");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "descarte de impresión rechazado");
  return r;
}
