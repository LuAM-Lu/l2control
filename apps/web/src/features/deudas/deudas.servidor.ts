import "server-only";
import { connection } from "next/server";
import type { DeudasDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las deudas de clientes de la sucursal, leídas en el servidor (B3-11, M-33): las pendientes y las que terminaron en
 * los últimos 90 días. Sin sesión o sin permiso de caja ni de reportes, nada: la lista no se inventa.
 */
export async function deudasDelLocal(): Promise<DeudasDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).deudas.leer(ctx);
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "deudas no disponibles");
    return null;
  }
  return r.valor;
}
