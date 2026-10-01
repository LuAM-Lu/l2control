"use server";

import type { CuentaYLibroDto, CuentasDelLocalDto, DescuentosDeCuentaDto, FamilyAccountDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las cuentas en el servidor (B3-3). Todo opera como la persona de la sesión: el caso de uso decide
 * quién puede y deja el asiento a su nombre. Lo que llega es `unknown` a propósito: el caso de uso
 * lo revalida con el contrato (ADR-017). Al log van el identificador y el motivo, nunca los datos
 * de un pago ni el PIN de quien autoriza (§7.6).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** La cola de la sucursal, para que cada estación vea lo que cambian las demás sin navegar. */
export async function leerCuentas(): Promise<Resultado<CuentasDelLocalDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).cuentas.leer(ctx);
}

/** Abre o cambia una cuenta. Devuelve cómo la dejó el servidor (versión, número de orden). */
export async function guardarCuenta(entrada: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.guardar(ctx, entrada);
  if (!r.ok) log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "cuenta no guardada");
  return r;
}

/** Cobra una cuenta (o una parte) contra el libro. */
export async function cobrarCuenta(entrada: unknown): Promise<Resultado<CuentaYLibroDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.cobrar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.cuenta.id, version: r.valor.cuenta.version }, "cuenta cobrada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "cobro rechazado");
  return r;
}

/** Anula un cobro. `autorizacion` lleva quién autoriza, su PIN y el motivo (🔐, DEC-24). */
export async function anularCobro(entrada: unknown, autorizacion?: unknown): Promise<Resultado<CuentaYLibroDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.anular(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.cuenta.id }, "cobro anulado");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "anulación rechazada");
  return r;
}

/** Regala una línea o deja de regalarla (F6-14). `autorizacion` lleva quién, su PIN y el motivo. */
export async function darCortesia(entrada: unknown, autorizacion?: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.cortesia(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, "cortesía aplicada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cortesía rechazada");
  return r;
}

/** Marca incobrable una cuenta (D-JOR). `autorizacion` lleva quién autoriza, su PIN y el motivo (🔐). */
export async function marcarIncobrable(entrada: unknown, autorizacion?: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).cuentas.incobrable(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, "cuenta incobrable");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "incobrable rechazada");
  return r;
}

/** Lo que la caja puede ofrecerle a una cuenta hoy (B3-6), el mayor primero. */
export async function descuentosDeCuenta(accountId: unknown): Promise<Resultado<DescuentosDeCuentaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).descuentos.deCuenta(ctx, accountId);
}

/** Pone un descuento a una cuenta o se lo quita (B3-6). `autorizacion` lleva quién, su PIN y el motivo. */
export async function aplicarDescuento(entrada: unknown, autorizacion?: unknown): Promise<Resultado<FamilyAccountDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).descuentos.aplicar(ctx, entrada, autorizacion);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.id }, r.valor.descuento ? "descuento aplicado" : "descuento quitado");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "descuento rechazado");
  return r;
}

/** Las acciones de la caja con 🔐 cuya lista de autorizadores puede pedir la pantalla. */
const CON_AUTORIZADORES = ["cobro.anular", "cuenta.cortesia", "cuenta.incobrable", "cuenta.descuento", "turno.corteZ"] as const;

/**
 * Quiénes pueden autorizar a quien opera una acción de la caja (vacío si no le hace falta). Solo las
 * de la lista: la acción llega del navegador y aquí no se abre otra.
 */
export async function autorizadoresDeCaja(accion: unknown): Promise<{ id: string; nombre: string; rol: string }[]> {
  const ctx = await contextoActual();
  const a = CON_AUTORIZADORES.find((x) => x === accion);
  if (!ctx || !a) return [];
  return (await aplicacion()).cuentas.autorizadores(ctx, a);
}
