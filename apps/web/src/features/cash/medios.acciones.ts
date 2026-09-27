"use server";

import { revalidatePath } from "next/cache";
import type { MediosDePagoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Un cambio en los medios de pago (B3-2, F4-02, F4-04). Opera como la persona de la sesión: el caso
 * de uso exige `catalogo.modificar` con elevación y deja el asiento a su nombre. Lo que llega es
 * `unknown`: el caso de uso lo revalida con el contrato (ADR-017). Al log va la clase del cambio,
 * nunca los datos (§7.6).
 */
export async function aplicarMedio(entrada: unknown): Promise<Resultado<MediosDePagoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para cambiar los medios de pago." };

  const resultado = await (await aplicacion()).medios.aplicar(ctx, entrada);
  const cambio = typeof entrada === "object" && entrada !== null && "kind" in entrada ? String(entrada.kind) : "desconocido";
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, cambio }, "medios de pago cambiados");
    // La caja que navegue lee ya lo nuevo; empujarlo en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, cambio, motivo: resultado.motivo }, "cambio de medios rechazado");
  }
  return resultado;
}
