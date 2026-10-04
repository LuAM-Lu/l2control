"use server";

import type { CatalogoEventosPublicadoDto, CheckInResult, ReservaEventoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los cumpleaños desde el navegador (B10-1). Todo opera como la persona de la sesión; lo que llega es
 * `unknown` y el caso de uso lo revalida con el contrato (ADR-017). Al log van identificadores y
 * motivos, nunca el nombre del cumpleañero ni el contacto de la familia (§7.6).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Reserva un cumpleaños: la reserva y la cuenta del anticipo en la cola de la caja, juntas. */
export async function reservarEvento(entrada: unknown): Promise<Resultado<ReservaEventoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).eventos.reservar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, reserva: r.valor.id, cuenta: r.valor.cuenta.id }, "cumpleaños reservado");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "reserva rechazada");
  return r;
}

/** Cancela una reserva cuyo anticipo no se ha cobrado. */
export async function cancelarReserva(entrada: unknown): Promise<Resultado<ReservaEventoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).eventos.cancelar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, reserva: r.valor.id }, "reserva cancelada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cancelación rechazada");
  return r;
}

/** Publica los paquetes de cumpleaños y el anticipo: `catalogo.modificar`, con elevación. */
export async function publicarCatalogoEventos(entrada: unknown): Promise<Resultado<CatalogoEventosPublicadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).eventos.publicarCatalogo(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, version: r.valor.version }, "paquetes de cumpleaños publicados");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "paquetes de cumpleaños rechazados");
  return r;
}

/** Empieza el día de un cumpleaños: su cuenta del día con el saldo va a la caja y lo incluido sale del estante. */
export async function empezarEvento(entrada: unknown): Promise<Resultado<ReservaEventoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).eventos.empezar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, reserva: r.valor.id, cuenta: r.valor.dia?.cuenta.id }, "cumpleaños empezado");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "cumpleaños no empezado");
  return r;
}

/** Entran invitados de un cumpleaños con sus pulseras, a la cuenta del día. */
export async function entrarInvitados(entrada: unknown): Promise<Resultado<CheckInResult>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).eventos.entrarInvitados(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.account.id, invitados: r.valor.sessions.length }, "invitados de cumpleaños");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "entrada de invitados rechazada");
  return r;
}
