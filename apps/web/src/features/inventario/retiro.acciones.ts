"use server";

import { revalidatePath } from "next/cache";
import type { Resultado, RetiroHechoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Retirar un producto del catálogo y devolverlo (B9-11). Operan como la persona de la sesión, con la autorización de
 * administración (quién y su PIN), que el caso de uso comprueba y registra antes de mover nada. Lo que llega es
 * `unknown`: se revalida con el contrato (ADR-017). El PIN no va al registro.
 */
const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

export async function retirarProducto(entrada: unknown, autorizacion: unknown): Promise<Resultado<RetiroHechoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).retiro.retirar(ctx, entrada, autorizacion);
  if (r.ok) revalidatePath("/", "layout");
  log()[r.ok ? "info" : "warn"]({ tenantId: ctx.tenantId, ...(r.ok ? { producto: r.valor.productId } : { motivo: r.motivo }) }, r.ok ? "producto retirado" : "retiro de producto rechazado");
  return r;
}

export async function devolverProducto(entrada: unknown, autorizacion: unknown): Promise<Resultado<RetiroHechoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).retiro.devolver(ctx, entrada, autorizacion);
  if (r.ok) revalidatePath("/", "layout");
  log()[r.ok ? "info" : "warn"]({ tenantId: ctx.tenantId, ...(r.ok ? { producto: r.valor.productId } : { motivo: r.motivo }) }, r.ok ? "producto devuelto al catálogo" : "vuelta de producto rechazada");
  return r;
}
