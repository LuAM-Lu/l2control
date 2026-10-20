"use server";

import type { AnulacionPedidaDto, AnulacionesPedidasDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * «Pedir anulación» en el servidor — B3-30 (M-40). Operan como la persona de la sesión. Lo que llega es `unknown` a
 * propósito: el caso de uso lo revalida con el contrato (ADR-017). El PIN no sale en el registro.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Los pedidos de la sucursal, otra vez (cuando algo cambia en vivo). */
export async function leerAnulacionesPedidas(): Promise<Resultado<AnulacionesPedidasDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).anulaciones.leer(ctx);
}

/** La caja pide anular un cobro, con su motivo y lo que se hará con la cuenta. */
export async function pedirAnulacion(entrada: unknown): Promise<Resultado<AnulacionPedidaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).anulaciones.pedir(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, pedido: r.valor.id }, "anulación pedida");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "pedir anulación rechazado");
  return r;
}

/** Administración aprueba (con su PIN) o rechaza (con su motivo). */
export async function responderAnulacion(entrada: unknown, autorizacion?: unknown): Promise<Resultado<AnulacionPedidaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).anulaciones.responder(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, pedido: r.valor.id, estado: r.valor.estado }, "anulación respondida");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "responder anulación rechazado");
  return r;
}
