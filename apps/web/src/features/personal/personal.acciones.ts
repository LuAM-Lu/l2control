"use server";

import type { PersonaDelLocalDto, Resultado, ValeDto, ValesDelPersonalDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El consumo del personal en el servidor (B3-17). Lo que llega es `unknown`: el caso de uso lo revalida. El PIN de
 * quien consumió viaja al caso de uso y no va al log (§7.6).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Quiénes pueden consumir: las personas del local en esta sucursal. */
export async function personasQueConsumen(): Promise<Resultado<PersonaDelLocalDto[]>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).personal.personas(ctx);
}

/** Los vales de un periodo: todos (supervisión y administración) o los de una persona, con su PIN. */
export async function valesDelPersonal(entrada: unknown): Promise<Resultado<ValesDelPersonalDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).personal.vales(ctx, entrada);
  if (!r.ok) log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "vales del personal rechazados");
  return r;
}

/** Reimprime un vale (sale como copia). */
export async function reimprimirVale(entrada: unknown): Promise<Resultado<ValeDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).personal.reimprimir(ctx, entrada);
}
