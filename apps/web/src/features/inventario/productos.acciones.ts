"use server";

import { revalidatePath } from "next/cache";
import type { CatalogoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Un cambio del catálogo de productos (B9-1, F8-02). Opera como la persona de la sesión: el caso de
 * uso exige `catalogo.modificar` con elevación y deja el asiento a su nombre. Lo que llega es
 * `unknown`: el caso de uso lo revalida con el contrato (ADR-017), y el día de un precio lo
 * convierte en instante el servidor.
 */
export async function aplicarProducto(entrada: unknown): Promise<Resultado<CatalogoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para cambiar el catálogo." };

  const resultado = await (await aplicacion()).productos.aplicar(ctx, entrada);
  const cambio = typeof entrada === "object" && entrada !== null && "kind" in entrada ? String(entrada.kind) : "desconocido";
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, cambio }, "catálogo de productos cambiado");
    // La caja que navegue lee ya lo nuevo; empujarlo en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, cambio, motivo: resultado.motivo }, "cambio del catálogo rechazado");
  }
  return resultado;
}
