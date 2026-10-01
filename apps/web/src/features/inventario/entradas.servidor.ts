import "server-only";
import { connection } from "next/server";
import type { EntradasDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las entradas de mercancía recientes de la sucursal (B9-3), leídas como la persona de la sesión:
 * las ve quien puede recibir mercancía. `null` si no hay sesión, no tiene permiso o el servidor no
 * respondió: la pantalla lo dice en vez de enseñar una lista vacía que parezca un local sin compras.
 */
export async function entradasDelLocal(): Promise<EntradasDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).entradas.leer(ctx);
  return r.ok ? r.valor : null;
}
