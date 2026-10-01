import "server-only";
import { connection } from "next/server";
import type { DescuentosDelLocalDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las reglas de descuento del local y el tope de supervisión (B3-6), leídos en el servidor en cada
 * petición. Solo con alguien en sesión; `null` si no la hay o si el servidor no las puede leer, y la
 * pantalla lo dice en vez de enseñar una lista vacía que no es verdad.
 */
export async function descuentosDelLocal(): Promise<DescuentosDelLocalDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).descuentos.leer(ctx);
  if (!r.ok) {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "descuentos no disponibles");
    return null;
  }
  return r.valor;
}
