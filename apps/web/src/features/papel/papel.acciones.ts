"use server";

import type { CargaDePapelDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * La carga de lo anotado en papel desde el navegador (B3-7, ADR-027). Opera como la persona de la sesión;
 * lo que llega es `unknown` y el caso de uso lo revalida con el contrato (ADR-017). Al log van la carga y
 * el motivo, nunca los datos de las familias ni lo cobrado (§7.6). Las entradas, salidas y cobros que se
 * cargan pasan por `registrarEntrada`, `registrarSalida` y `cobrarCuenta` con su `desdePapel`.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Abre una carga en el turno del equipo, con la ventana del corte. */
export async function abrirCarga(entrada: unknown): Promise<Resultado<CargaDePapelDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).papel.abrir(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, carga: r.valor.id }, "carga desde papel abierta");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "carga desde papel rechazada");
  return r;
}

/** La cajera termina de cargar: la carga queda a la espera de revisión (o se descarta, si está vacía). */
export async function terminarCarga(entrada: unknown): Promise<Resultado<CargaDePapelDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).papel.terminar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, carga: r.valor.id, estado: r.valor.estado }, "carga desde papel terminada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "terminar la carga rechazado");
  return r;
}

/** Supervisión revisa una carga contra el papel. `autorizacion` lleva su PIN (nunca al log). */
export async function revisarCarga(entrada: unknown, autorizacion?: unknown): Promise<Resultado<CargaDePapelDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).papel.revisar(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, carga: r.valor.id }, "carga desde papel revisada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "revisión de la carga rechazada");
  return r;
}
