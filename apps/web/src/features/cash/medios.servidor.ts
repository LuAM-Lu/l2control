import "server-only";
import { connection } from "next/server";
import type { MediosDePagoDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los medios de pago del local, leídos en el servidor (B3-2). Solo con alguien en sesión: los datos
 * de cobro son del negocio, no de la pantalla de acceso. `null` sin sesión o si el servidor no los
 * puede leer; la caja entonces no ofrece ningún medio (fail-closed).
 */
export async function mediosDelLocal(): Promise<MediosDePagoDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).medios.leer(ctx);
  if (!r.ok) {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "medios de pago no disponibles");
    return null;
  }
  return r.valor;
}
