"use server";

import type { DevolucionHechaDto, ParqueDeLaVentaDto, Resultado, VentaCerradaDto, VentasDelTurnoDto } from "@l2/contracts";
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

/**
 * Un cliente devuelve parte de lo que compró (B3-14): con la autorización de supervisión que el caso de uso comprueba y
 * registra antes de tocar el libro. Ni el PIN ni las referencias van al registro.
 */
export async function devolverVenta(entrada: unknown, autorizacion: unknown): Promise<Resultado<DevolucionHechaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).devoluciones.devolver(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, venta: r.valor.venta.id }, "devolución registrada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "devolución rechazada");
  return r;
}

/** La venta más reciente con ese número de orden (B3-14): para devolver lo de otro día. */
export async function buscarVentaPorOrden(orden: number): Promise<Resultado<VentaCerradaDto | null>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).devoluciones.buscar(ctx, { orden });
}

/** El tiempo del parque de una venta y lo que su niño no usó (B3-18), para devolverlo. */
export async function parqueDeLaVenta(saleId: string): Promise<Resultado<ParqueDeLaVentaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).devoluciones.delParque(ctx, saleId);
}
