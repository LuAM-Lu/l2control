"use server";

import { revalidatePath } from "next/cache";
import type { Resultado, TarifarioPublicadoDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal, escrituraSinSesion, log } from "../../servidor/aplicacion";

/**
 * Publicar el tarifario — la primera escritura real del sistema (B0-5, F5-04).
 *
 * Lo que llega es `unknown` a propósito: es lo que mandó el navegador, y el caso de uso lo
 * revalida con el contrato antes de tocar la base (ADR-017).
 */
export async function publicarTarifario(entrada: unknown): Promise<Resultado<TarifarioPublicadoDto>> {
  const bloqueo = escrituraSinSesion();
  if (bloqueo) return bloqueo;

  const ctx = contextoDelLocal();
  const resultado = await (await aplicacion()).tarifario.publicar(ctx, entrada);

  if (resultado.ok) {
    log().info({ ...ctx, version: resultado.valor.version }, "tarifario publicado");
    // Las estaciones que naveguen leen ya el nuevo; empujarlo en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ ...ctx, motivo: resultado.motivo }, "tarifario rechazado");
  }
  return resultado;
}
