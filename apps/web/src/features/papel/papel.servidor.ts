import "server-only";
import { connection } from "next/server";
import type { CargaDePapelDto, CargasDePapelDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * La carga de lo anotado en papel, leída en el servidor (B3-7). Sin sesión o sin permiso de caja ni de
 * revisión, nada: la lista no se inventa.
 */
export async function cargasDePapel(): Promise<CargasDePapelDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).papel.leer(ctx);
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cargas desde papel no disponibles");
    return null;
  }
  return r.valor;
}

/**
 * La carga abierta `id` en la que este equipo puede cargar cobros: del turno del equipo y todavía
 * abierta. `null` si no existe, ya se terminó o es de otro turno: la caja en modo papel no se abre.
 */
export async function cargaParaCargar(id: string): Promise<CargaDePapelDto | null> {
  const datos = await cargasDePapel();
  const c = datos?.cargas.find((x) => x.id === id);
  return c && c.estado === "ABIERTA" && c.turnoId === datos?.turnoId ? c : null;
}
