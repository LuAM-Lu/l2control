"use server";

import { revalidatePath } from "next/cache";
import type { ExchangeRateDto, Resultado, SincronizacionTasaDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/**
 * Capturar una tasa (F3-04). Entra sin confirmar; quién la captura lo pone el servidor desde la
 * sesión. Lo que llega es `unknown` a propósito: el caso de uso lo revalida (ADR-017).
 */
export async function capturarTasa(entrada: unknown): Promise<Resultado<ExchangeRateDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).tasas.capturar(ctx, entrada);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, tasa: r.valor.id, par: r.valor.pair }, "tasa capturada");
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "tasa no capturada");
  }
  return r;
}

/**
 * Confirmar una tasa (F3-04): desde aquí la caja puede cobrar con ella, si es la del día.
 * `autorizacion` lleva quién autoriza, su PIN y el motivo cuando quien confirma es supervisión.
 */
export async function confirmarTasa(entrada: unknown, autorizacion?: unknown): Promise<Resultado<ExchangeRateDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).tasas.confirmar(ctx, entrada, autorizacion);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, tasa: r.valor.id, par: r.valor.pair }, "tasa confirmada");
    // Las estaciones que naveguen la leen ya; empujarla en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "tasa no confirmada");
  }
  return r;
}

/**
 * Traer la tasa del BCV (F3-04). Lo traído entra PENDIENTE: alguien la confirma antes de cobrar.
 * Si ninguna fuente responde, lo dice y la carga manual sigue disponible.
 */
export async function traerTasaDelBcv(): Promise<Resultado<SincronizacionTasaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).tasas.sincronizar(ctx);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, capturadas: r.valor.capturadas.length, avisos: r.valor.avisos.length }, "tasa traída del BCV");
    if (r.valor.capturadas.length > 0) revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "tasa del BCV no traída");
  }
  return r;
}
