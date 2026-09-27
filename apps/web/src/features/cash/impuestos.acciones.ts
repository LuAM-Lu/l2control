"use server";

import { revalidatePath } from "next/cache";
import type { Resultado, VigenciaImpuestoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Programar una alícuota (B2-2, F3-06). Opera como la persona de la sesión: el caso de uso exige
 * `catalogo.modificar` con elevación y deja el asiento a su nombre. Lo que llega es `unknown`: el
 * caso de uso lo revalida con el contrato (ADR-017), y el día lo convierte en instante el servidor.
 */
export async function programarImpuesto(entrada: unknown): Promise<Resultado<VigenciaImpuestoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para programar." };

  const resultado = await (await aplicacion()).impuestos.programar(ctx, entrada);
  if (resultado.ok) {
    const v = resultado.valor;
    log().info({ tenantId: ctx.tenantId, impuesto: v.impuesto, code: v.code, basisPoints: v.basisPoints, desde: v.desde }, "impuesto programado");
    // La caja que navegue lee ya el nuevo; empujarlo en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "impuesto rechazado");
  }
  return resultado;
}
