import "server-only";
import { connection } from "next/server";
import type { AnulacionesPedidasDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los pedidos de anulación de la sucursal, leídos en el servidor (B3-30, M-40): los que esperan y los de los últimos días.
 * Sin sesión o sin permiso de caja ni de anular, nada: la lista no se inventa.
 */
export async function anulacionesPedidas(): Promise<AnulacionesPedidasDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).anulaciones.leer(ctx);
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "anulaciones pedidas no disponibles");
    return null;
  }
  return r.valor;
}
