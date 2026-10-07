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
