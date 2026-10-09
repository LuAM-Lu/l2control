"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDeRespaldosDto, PcPreparadaDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Tu sesión terminó. Vuelve a entrar." };

/**
 * Preparar la PC del local que baja los respaldos (B7-4, M-26), con la identidad confirmada. Devuelve su
 * credencial, que se enseña una sola vez; la anterior deja de valer.
 */
export async function prepararPcDeRespaldos(entrada: unknown): Promise<Resultado<PcPreparadaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).respaldos.prepararPc(ctx, entrada);
  // La credencial no va al registro: solo qué PC.
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, pc: r.valor.pc.nombre }, "PC de respaldos preparada");
    revalidatePath("/", "layout");
  }
  return r;
}

/** Retirar la PC del local: su credencial deja de valer. */
export async function retirarPcDeRespaldos(entrada: unknown): Promise<Resultado<EstadoDeRespaldosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).respaldos.retirarPc(ctx, entrada);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Fijar un respaldo con su nombre (B7-6): ni el servidor ni la escalera de la PC lo borran. Con la identidad confirmada. */
export async function fijarRespaldo(entrada: unknown): Promise<Resultado<EstadoDeRespaldosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).respaldos.fijar(ctx, entrada);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, fijados: r.valor.fijados.length }, "respaldo fijado");
    revalidatePath("/", "layout");
  }
  return r;
}

/** Soltar un respaldo fijado (B7-6): vuelve a la retención de siempre. */
export async function soltarRespaldo(entrada: unknown): Promise<Resultado<EstadoDeRespaldosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).respaldos.soltar(ctx, entrada);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/**
 * «Respaldar ahora» (B7-8, M-35), con la identidad confirmada: queda pedido y el servidor lo hace en el minuto
 * siguiente. Con otro pedido o en curso, se queda ese.
 */
export async function respaldarAhora(): Promise<Resultado<EstadoDeRespaldosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).respaldos.pedirAhora(ctx);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, estado: r.valor.pedido?.estado }, "respaldo pedido desde el panel");
    revalidatePath("/", "layout");
  }
  return r;
}
