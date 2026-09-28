"use server";

import type { Resultado, VentaCerradaDto, VentasDelTurnoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las ventas del turno (B3-4). Opera como la persona de la sesión; lo que llega es `unknown` y el caso
 * de uso lo revalida (ADR-017).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Las ventas del turno abierto de este equipo. */
export async function leerVentas(): Promise<Resultado<VentasDelTurnoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).ventas.delTurno(ctx);
}

/** Anota una impresión del recibo (la primera es el original; las demás, copias) y devuelve la venta. */
export async function imprimirVenta(entrada: unknown): Promise<Resultado<VentaCerradaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).ventas.imprimir(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, venta: r.valor.id, impresiones: r.valor.prints.length }, "recibo impreso");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "impresión rechazada");
  return r;
}
