"use server";

import { revalidatePath } from "next/cache";
import type { DeviceDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Aprobar, revocar o renombrar un equipo (F2-02). El caso de uso exige `usuarios.gestionar`,
 * revalida la orden con el contrato y, al revocar, cierra las sesiones abiertas en ese equipo.
 */
export async function ordenarDispositivo(orden: unknown): Promise<Resultado<DeviceDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
  const r = await (await aplicacion()).dispositivos.ordenar(ctx, orden);
  if (r.ok) revalidatePath("/panel/ajustes/dispositivos");
  return r;
}
