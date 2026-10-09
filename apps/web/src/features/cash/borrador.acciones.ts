"use server";

import type { BorradorGuardadoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El cobro en curso de cada cuenta, en el servidor — B3-13 (M-34). Opera como la persona de la sesión; lo que llega es
 * `unknown` y lo revalida el caso de uso (ADR-017). Lleva referencias y datos de pago: nada de eso sale en el registro.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** El borrador de una cuenta, si hay. */
export async function leerBorrador(accountId: string): Promise<Resultado<BorradorGuardadoDto | null>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).borradores.leer(ctx, accountId);
}

/** Guarda lo que se lleva del cobro (sin pagos, lo borra). */
export async function guardarBorrador(entrada: unknown): Promise<Resultado<BorradorGuardadoDto | null>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).borradores.guardar(ctx, entrada);
  if (!r.ok && r.motivo !== "CONFLICTO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cobro en curso no guardado");
  return r;
}

/** Descarta el cobro en curso de una cuenta. */
export async function descartarBorrador(entrada: unknown): Promise<Resultado<{ descartado: boolean }>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).borradores.descartar(ctx, entrada);
  if (r.ok && r.valor.descartado) log().info({ tenantId: ctx.tenantId }, "cobro en curso descartado");
  return r;
}
