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

/**
 * Sienta a una familia (B6-7): abre su cuenta en una mesa —una más si la mesa es compartida— o una cuenta
 * de pie. Reenviar el mismo id no abre dos.
 */
export async function abrirCuentaDelSalon(entrada: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).mesas.abrir(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id, mesa: r.valor.tableLabel ?? "de pie" }, "cuenta del salón abierta");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "abrir cuenta del salón rechazado");
  return r;
}

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

/** Cierra una mesa sin cobrar (B6-13): anula todo lo que debe y la libera. De supervisión y administración, con su PIN. */
export async function cerrarMesaSinCobrar(entrada: unknown, autorizacion?: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.cerrarSinCobrar(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, "mesa cerrada sin cobrar");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cerrar mesa sin cobrar rechazado");
  return r;
}

/** Libera una mesa sin nada que cobrar: su cuenta se cierra «sin consumo» (B6-5, M-18). Sin PIN. */
export async function liberarMesa(entrada: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.liberarMesa(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id, estado: r.valor.status }, "mesa liberada sin consumo");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "liberar mesa rechazado");
  return r;
}
