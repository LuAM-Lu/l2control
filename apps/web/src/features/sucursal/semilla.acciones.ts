"use server";

import { revalidatePath } from "next/cache";
import type { InformeDeSemillaDto, Resultado, SemillaDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * La semilla del local (B7-2, M-24). Descargarla y cargarla son de administración con la identidad
 * confirmada: el caso de uso lo exige y deja los asientos. Lo que llega es `unknown` (un archivo que
 * alguien eligió): el caso de uso lo revalida entero con el contrato.
 */
export async function exportarSemilla(): Promise<Resultado<SemillaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para descargar la semilla." };
  const r = await (await aplicacion()).semilla.exportar(ctx);
  if (r.ok) log().info({ tenantId: ctx.tenantId, productos: r.valor.productos.length }, "semilla descargada");
  return r;
}

/** Revisa (`cargar: false`) o carga (`cargar: true`) una semilla. */
export async function cargarSemilla(entrada: unknown): Promise<Resultado<InformeDeSemillaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para cargar la semilla." };
  const r = await (await aplicacion()).semilla.cargar(ctx, entrada);
  if (r.ok && r.valor.cargada) {
    log().info({ tenantId: ctx.tenantId, de: r.valor.local, partes: r.valor.partes.map((p) => `${p.parte}:${p.estado}`) }, "semilla cargada");
    revalidatePath("/", "layout");
  } else if (!r.ok) {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "semilla rechazada");
  }
  return r;
}
