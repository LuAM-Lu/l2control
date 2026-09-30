"use server";

import type { AjustesPublicadosDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Publicar los ajustes de la sucursal (B4-4). Opera como la persona de la sesión: el caso de uso
 * exige `catalogo.modificar` con elevación y deja el asiento a su nombre. Las demás pantallas lo
 * reciben por el canal en vivo (tema `sucursal`).
 *
 * Lo que llega es `unknown` a propósito: es lo que mandó el navegador, y el caso de uso lo
 * revalida con el contrato antes de tocar la base (ADR-017).
 */
export async function publicarAjustes(entrada: unknown): Promise<Resultado<AjustesPublicadosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para publicar." };

  const resultado = await (await aplicacion()).ajustes.publicar(ctx, entrada);
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, branchId: ctx.branchId, version: resultado.valor.version }, "ajustes de la sucursal publicados");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "ajustes de la sucursal rechazados");
  }
  return resultado;
}
