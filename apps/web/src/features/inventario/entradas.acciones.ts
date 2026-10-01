"use server";

import { revalidatePath } from "next/cache";
import type { EntradaDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Registrar una entrada de mercancía (B9-3, F8-06). Opera como la persona de la sesión: el caso de
 * uso exige `inventario.entrada` y deja el asiento a su nombre. Lo que llega es `unknown`: el caso
 * de uso lo revalida con el contrato (ADR-017); el instante y quién recibe los pone el servidor.
 */
export async function registrarEntrada(entrada: unknown): Promise<Resultado<EntradaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para cargar la entrada." };

  const resultado = await (await aplicacion()).entradas.registrar(ctx, entrada);
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, lineas: resultado.valor.lineas.length }, "entrada de mercancía registrada");
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "entrada de mercancía rechazada");
  }
  return resultado;
}
