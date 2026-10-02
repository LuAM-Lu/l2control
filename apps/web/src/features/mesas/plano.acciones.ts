"use server";

import type { PlanoPublicadoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Publicar el plano del local (B6-1). Opera como la persona de la sesión: el caso de uso exige
 * `catalogo.modificar` con elevación, choca si otra persona publicó entre medias y deja el asiento a
 * su nombre. Las demás pantallas lo reciben por el canal en vivo (tema `plano`).
 *
 * Lo que llega es `unknown` a propósito: es lo que mandó el navegador, y el caso de uso lo revalida
 * con el contrato antes de tocar la base (ADR-017). La hora de retirar una mesa la pone el servidor.
 */
export async function publicarPlano(entrada: unknown): Promise<Resultado<PlanoPublicadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para publicar." };

  const resultado = await (await aplicacion()).plano.publicar(ctx, entrada);
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, branchId: ctx.branchId, version: resultado.valor.version }, "plano del local publicado");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "plano del local rechazado");
  }
  return resultado;
}
