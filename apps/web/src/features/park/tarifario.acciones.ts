"use server";

import { revalidatePath } from "next/cache";
import type { Resultado, TarifarioPublicadoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Publicar el tarifario (F5-04). Opera como la persona de la sesión: el caso de uso exige
 * `catalogo.modificar` y deja el asiento a su nombre.
 *
 * Lo que llega es `unknown` a propósito: es lo que mandó el navegador, y el caso de uso lo
 * revalida con el contrato antes de tocar la base (ADR-017).
 */
export async function publicarTarifario(entrada: unknown): Promise<Resultado<TarifarioPublicadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para publicar." };

  const resultado = await (await aplicacion()).tarifario.publicar(ctx, entrada);
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, branchId: ctx.branchId, version: resultado.valor.version }, "tarifario publicado");
    // Las estaciones que naveguen leen ya el nuevo; empujarlo en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "tarifario rechazado");
  }
  return resultado;
}
