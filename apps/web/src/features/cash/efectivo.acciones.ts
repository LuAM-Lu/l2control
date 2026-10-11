"use server";

import type { MovimientoDeEfectivoDto, MovimientoHechoDto, MovimientosDelTurnoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Mover efectivo (B3-21): entra, sale o se retira de la gaveta sin ser venta, con su comprobante. */
export async function moverEfectivo(entrada: unknown, autorizacion?: unknown): Promise<Resultado<MovimientoHechoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).efectivo.mover(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, movimiento: r.valor.movimiento.id, tipo: r.valor.movimiento.tipo }, "efectivo movido");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "mover efectivo rechazado");
  return r;
}

/** Lo que se movió en el turno de este equipo. */
export async function movimientosDelTurno(): Promise<Resultado<MovimientosDelTurnoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).efectivo.delTurno(ctx);
}

/** Reimprime el comprobante de un movimiento (sale como copia). */
export async function reimprimirMovimiento(movimientoId: string): Promise<Resultado<MovimientoDeEfectivoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).efectivo.reimprimir(ctx, { movimientoId });
}
