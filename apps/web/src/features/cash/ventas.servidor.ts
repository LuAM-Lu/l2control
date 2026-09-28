import "server-only";
import { connection } from "next/server";
import type { VentaCerradaDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las ventas del turno abierto de este equipo, leídas en el servidor (B3-4). Sin sesión, sin permiso
 * de caja o sin turno, ninguna: la lista no se inventa.
 */
export async function ventasDelTurno(): Promise<VentaCerradaDto[]> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).ventas.delTurno(ctx);
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "ventas del turno no disponibles");
    return [];
  }
  return r.valor.ventas;
}
