"use server";

import type { DeudaDto, DeudasDto, FamilyAccountDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las deudas de clientes en el servidor — B3-11 (M-33). Operan como la persona de la sesión. Lo que llega es `unknown`
 * a propósito: el caso de uso lo revalida con el contrato (ADR-017). La cédula y el teléfono no salen en el registro.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Las deudas de la sucursal, otra vez (cuando algo cambia en vivo). */
export async function leerDeudas(): Promise<Resultado<DeudasDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).deudas.leer(ctx);
}

/** «Se fue sin pagar»: la cuenta queda en deuda a nombre de su cliente, con la autorización de supervisión. */
export async function marcarDeuda(entrada: unknown, autorizacion?: unknown): Promise<Resultado<{ cuenta: FamilyAccountDto; deuda: DeudaDto }>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).deudas.marcar(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.cuenta.id, deuda: r.valor.deuda.id }, "cuenta en deuda");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "deuda rechazada");
  return r;
}

/** Cobrar una deuda: la cuenta del mostrador con lo que consumió, para cobrarla en la caja. */
export async function cobrarDeuda(entrada: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).deudas.cobrar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, "deuda en la caja");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cobrar deuda rechazado");
  return r;
}

/** Devolverla a las deudas: el cliente vino pero no pagó. */
export async function devolverDeuda(entrada: unknown): Promise<Resultado<DeudaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).deudas.devolver(ctx, entrada);
  if (!r.ok) log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "devolver deuda rechazado");
  return r;
}

/** Darla por perdida: administración, con su PIN y un motivo. */
export async function perderDeuda(entrada: unknown, autorizacion?: unknown): Promise<Resultado<DeudaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).deudas.perder(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, deuda: r.valor.id }, "deuda dada por perdida");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "perder deuda rechazado");
  return r;
}
