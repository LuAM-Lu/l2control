"use server";

import { revalidatePath } from "next/cache";
import type { AjusteInventarioDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Salidas con motivo y conteos físicos (B9-4, F8-07). Operan como la persona de la sesión, con la
 * autorización (quién y su PIN) que el caso de uso comprueba y registra antes de mover nada. Lo que
 * llega es `unknown`: se revalida con el contrato (ADR-017). El PIN no va al registro.
 */
const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

export async function registrarSalida(entrada: unknown, autorizacion: unknown): Promise<Resultado<AjusteInventarioDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).salidas.salida(ctx, entrada, autorizacion);
  if (r.ok) revalidatePath("/", "layout");
  log()[r.ok ? "info" : "warn"]({ tenantId: ctx.tenantId, ...(r.ok ? { lineas: r.valor.lineas.length } : { motivo: r.motivo }) }, r.ok ? "salida de inventario registrada" : "salida de inventario rechazada");
  return r;
}

export async function registrarConteo(entrada: unknown, autorizacion: unknown): Promise<Resultado<AjusteInventarioDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).salidas.conteo(ctx, entrada, autorizacion);
  if (r.ok) revalidatePath("/", "layout");
  log()[r.ok ? "info" : "warn"]({ tenantId: ctx.tenantId, ...(r.ok ? { lineas: r.valor.lineas.length } : { motivo: r.motivo }) }, r.ok ? "conteo de inventario registrado" : "conteo de inventario rechazado");
  return r;
}

/** Quiénes pueden autorizar a quien opera un ajuste de inventario (vacío si no le hace falta). */
export async function autorizadoresDeInventario(): Promise<{ id: string; nombre: string; rol: string }[]> {
  const ctx = await contextoActual();
  if (!ctx) return [];
  return (await aplicacion()).salidas.autorizadores(ctx);
}
