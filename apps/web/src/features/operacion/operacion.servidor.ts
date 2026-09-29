import "server-only";
import { connection } from "next/server";
import type { SesionEnCursoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Quién está en sesión en la sucursal, y en qué equipo (F9-08, D7): lo dice la base desde B5-1, no
 * lo que se contaban las pestañas de un navegador. Vacío para quien no ve el resumen de la sucursal.
 */
export async function sesionesEnCurso(): Promise<SesionEnCursoDto[]> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).sesiones.enCurso(ctx, Date.now());
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "sesiones en curso no disponibles");
    return [];
  }
  return r.valor;
}
