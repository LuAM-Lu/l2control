import "server-only";
import { connection } from "next/server";
import type { ImpresorasDelLocalDto, TrabajoDeImpresionDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las impresoras de la sucursal y sus agentes (B5-2), leídos en el servidor en cada petición. `null`
 * sin sesión o si el servidor no las puede leer: la pantalla lo dice en vez de enseñar una lista vacía.
 */
export async function impresorasDelLocal(): Promise<ImpresorasDelLocalDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).impresion.leer(ctx);
  if (!r.ok) {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "impresoras no disponibles");
    return null;
  }
  return r.valor;
}

/** La cola de la sucursal, para quien imprime o configura; vacía si no puede verla. */
export async function trabajosDelLocal(): Promise<readonly TrabajoDeImpresionDto[]> {
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).impresion.trabajos(ctx);
  return r.ok ? r.valor.trabajos : [];
}

/** A dónde se conecta el agente: la misma dirección del canal en vivo (vacía = esta máquina, ese puerto). */
export async function direccionDelWorker(): Promise<{ url: string; puerto: number }> {
  const { entorno } = await import("../../servidor/entorno");
  const e = entorno();
  return { url: e.L2_TIEMPO_REAL_URL, puerto: e.L2_TIEMPO_REAL_PUERTO };
}
