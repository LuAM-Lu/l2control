"use server";

import type { PedidoDto, PedidoEnviadoDto, PedidosDelLocalDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los pedidos del mesero y su comanda (B6-2, ADR-022). Operan como la persona de la sesión. Lo que llega
 * es `unknown` a propósito: el caso de uso lo revalida con el contrato (ADR-017), y el precio, el IVA y la
 * existencia los pone el servidor.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Envía un pedido: entra en la cuenta de la mesa y su comanda en la cola, juntos o nada. */
export async function enviarPedido(entrada: unknown): Promise<Resultado<PedidoEnviadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).pedidos.enviar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, comanda: r.valor.pedido.numero, mesa: r.valor.pedido.mesa }, "pedido enviado a cocina");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "pedido rechazado");
  return r;
}

/** Vuelve a imprimir la comanda de un pedido (sale marcada «reimpresión»). */
export async function reimprimirComanda(entrada: unknown): Promise<Resultado<PedidoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).pedidos.reimprimir(ctx, entrada);
}

/** Los pedidos de hoy, para volver a leerlos cuando el canal dice que cambiaron. */
export async function leerPedidos(): Promise<Resultado<PedidosDelLocalDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).pedidos.leer(ctx);
}

/** Marca un pedido servido en la mesa (B6-8, D-SERV): ahí termina su espera. */
export async function servirPedido(entrada: unknown): Promise<Resultado<PedidoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).pedidos.servir(ctx, entrada);
}
