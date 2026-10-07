"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDelSistemaDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";
import { servidorActual } from "./sistema.servidor";

const sinSesion = { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Tu sesión terminó. Vuelve a entrar." };

/**
 * Pedir una versión (T-8b, ADR-028): ahora o al cierre. La web solo deja la petición; la pone el actualizador
 * del servidor cuando no queden turnos abiertos ni niños en sala. Administración, con su identidad confirmada.
 */
export async function pedirActualizacion(entrada: unknown): Promise<Resultado<EstadoDelSistemaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).actualizaciones.pedir(ctx, entrada, servidorActual());
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, version: r.valor.pendiente?.version, cuando: r.valor.pendiente?.modo }, "actualización pedida");
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "actualización no pedida");
  }
  return r;
}

/** Cancelar la pedida mientras espera. */
export async function cancelarActualizacion(entrada: unknown): Promise<Resultado<EstadoDelSistemaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).actualizaciones.cancelar(ctx, entrada, servidorActual());
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
