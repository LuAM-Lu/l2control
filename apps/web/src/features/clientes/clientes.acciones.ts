"use server";

import type { ClienteEncontradoDto, FamilyAccountDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El cliente de una cuenta en el servidor — B6-9 (M-33). Operan como la persona de la sesión. Lo que llega es
 * `unknown` a propósito: el caso de uso lo revalida con el contrato (ADR-017). La cédula y el teléfono no salen en el
 * registro (PLAN §7.6): solo la cuenta.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** El cliente que ya vino, por su cédula o su teléfono completos; `null` si no está en el directorio. */
export async function buscarCliente(entrada: unknown): Promise<Resultado<ClienteEncontradoDto | null>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).clientes.buscar(ctx, entrada);
}

/**
 * Pone el cliente de una cuenta abierta (una venta del mostrador que se deja pendiente) o lo cambia, con la
 * autorización de supervisión si hace falta.
 */
export async function asignarCliente(entrada: unknown, autorizacion?: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).clientes.asignar(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, "cliente de la cuenta anotado");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cliente de la cuenta rechazado");
  return r;
}
