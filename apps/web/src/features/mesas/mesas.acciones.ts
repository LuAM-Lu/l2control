"use server";

import type { FamilyAccountDto, Resultado, VincularPulserasResultDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Vincular pulseras (F6-05) y anular un pedido en producción (F6-14), en el servidor — B6-3. Operan
 * como la persona de la sesión. Lo que llega es `unknown` a propósito: el caso de uso lo revalida con
 * el contrato (ADR-017).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Vincula pulseras a una mesa: su parque pendiente pasa a la cuenta de la mesa, junta o nada. */
export async function vincularPulseras(entrada: unknown): Promise<Resultado<VincularPulserasResultDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).mesas.vincular(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, mesa: r.valor.mesa.tableLabel, niños: r.valor.mesa.sessionIds.length }, "pulseras vinculadas a una mesa");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "vincular pulseras rechazado");
  return r;
}

/** Anula un plato ya enviado a cocina, con su autorización (F6-14). No tiene vuelta. */
export async function anularPedido(entrada: unknown, autorizacion?: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.anularPedido(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, "pedido anulado en producción");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "anular pedido rechazado");
  return r;
}
