import "server-only";
import { connection } from "next/server";
import type { AjustesInventarioDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las salidas y los conteos recientes de la sucursal (B9-4), leídos como la persona de la sesión: los
 * ve quien puede ajustar el inventario (o pedirlo con autorización). `null` si no hay sesión, no tiene
 * permiso o el servidor no respondió: la pantalla lo dice.
 */
export async function ajustesDelLocal(): Promise<AjustesInventarioDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).salidas.leer(ctx);
  return r.ok ? r.valor : null;
}
