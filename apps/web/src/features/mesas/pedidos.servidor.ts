import "server-only";
import { connection } from "next/server";
import type { PedidoDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los pedidos de hoy con su comanda (B6-2), leídos en el servidor para el layout. Vacío sin sesión o
 * para quien no toma pedidos ni cobra (la monitora): no los ve.
 */
export async function pedidosDelLocal(): Promise<readonly PedidoDto[]> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).pedidos.leer(ctx);
  return r.ok ? r.valor.pedidos : [];
}
