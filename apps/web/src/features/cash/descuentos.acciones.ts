"use server";

import type { ReglaDescuentoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las reglas de descuento y las familias VIP (B3-6). Operan como la persona de la sesión: el caso de
 * uso exige `catalogo.modificar` con elevación y deja el asiento. Llega `unknown`: el contrato lo
 * revalida (ADR-017). El canal en vivo cuenta el cambio a las demás pantallas (tema «descuentos»).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

export async function crearReglaDescuento(entrada: unknown): Promise<Resultado<ReglaDescuentoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).descuentos.crear(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, regla: r.valor.id }, "descuento creado");
  return r;
}

export async function retirarReglaDescuento(entrada: unknown): Promise<Resultado<ReglaDescuentoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).descuentos.retirar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, regla: r.valor.id }, "descuento retirado");
  return r;
}

export async function marcarFamiliaVip(entrada: unknown): Promise<Resultado<{ guardianId: string; vip: { reglaId: string; nombre: string } | null }>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).descuentos.marcarVip(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, familia: r.valor.guardianId }, r.valor.vip ? "familia marcada VIP" : "marca VIP quitada");
  return r;
}
