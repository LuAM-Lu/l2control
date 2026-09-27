"use server";

import { revalidatePath } from "next/cache";
import type { Resultado, TurnoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Abrir el turno del equipo (B3-1, F4-01). Opera como la persona de la sesión, en su equipo: el
 * caso de uso exige `turno.abrir`, pone la hora y el día de negocio y deja el asiento. Llega
 * `unknown`: solo el fondo, que el contrato revalida (ADR-017).
 */
export async function abrirTurno(entrada: unknown): Promise<Resultado<TurnoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para abrir el turno." };

  const resultado = await (await aplicacion()).turnos.abrir(ctx, entrada);
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, turno: resultado.valor.id, businessDate: resultado.valor.businessDate }, "turno abierto");
    // La barra, la caja e Inicio leen el turno en el servidor: que lo lean ya.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "apertura de turno rechazada");
  }
  return resultado;
}
