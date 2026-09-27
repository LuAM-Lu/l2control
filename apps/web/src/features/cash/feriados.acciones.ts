"use server";

import { revalidatePath } from "next/cache";
import type { FeriadoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Registrar y retirar feriados bancarios (B2-4, D-FER). Operan como la persona de la sesión: el
 * caso de uso exige `catalogo.modificar` con elevación y deja el asiento. Llega `unknown`: el
 * contrato lo revalida (ADR-017).
 */
export async function registrarFeriado(entrada: unknown): Promise<Resultado<FeriadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
  const r = await (await aplicacion()).feriados.registrar(ctx, entrada);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, dia: r.valor.dia }, "feriado registrado");
    // Cambia qué tasa rige ese día: las pantallas que naveguen lo leen ya; las demás, en su sondeo.
    revalidatePath("/", "layout");
  }
  return r;
}

export async function retirarFeriado(entrada: unknown): Promise<Resultado<FeriadoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
  const r = await (await aplicacion()).feriados.retirar(ctx, entrada);
  if (r.ok) {
    log().info({ tenantId: ctx.tenantId, dia: r.valor.dia }, "feriado retirado");
    revalidatePath("/", "layout");
  }
  return r;
}
