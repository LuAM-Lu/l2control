"use server";

import type { DivisionPorItemsDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Dividir por ítems en el servidor — B3-20 (M-37). Opera como la persona de la sesión; lo que llega es `unknown` a
 * propósito: el caso de uso lo revalida con el contrato (ADR-017).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** «Partir» un ítem compartido en partes iguales. */
export async function partirLinea(entrada: unknown): Promise<Resultado<DivisionPorItemsDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).dividir.partir(ctx, entrada);
  if (!r.ok) log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "partir un ítem rechazado");
  return r;
}

/** Lo de cada persona, de la 2 en adelante, a su propia cuenta. */
export async function dividirPorItems(entrada: unknown): Promise<Resultado<DivisionPorItemsDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).dividir.dividir(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.cuenta.id, personas: r.valor.personas.length + 1 }, "cuenta dividida por ítems");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "dividir por ítems rechazado");
  return r;
}

/** «Unir de nuevo»: lo que las personas no cobraron vuelve a la cuenta. */
export async function unirDivision(entrada: unknown): Promise<Resultado<DivisionPorItemsDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).dividir.unir(ctx, entrada);
  if (!r.ok) log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "unir la división rechazado");
  return r;
}
