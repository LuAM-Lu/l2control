import "server-only";
import { connection } from "next/server";
import type { MonitorSnapshotDto, PaginaDelDirectorioDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * La sala del parque, leída en el servidor (B4-2): los niños dentro con la hora del servidor, de la
 * que las pantallas solo interpolan (ADR-010). `null` sin alguien en sesión que trabaje con el parque
 * o sus cuentas, o si el servidor no la puede dar: una sala inventada es peor que una que dice que no
 * la tiene (fail-closed).
 */
export async function salaDelLocal(): Promise<MonitorSnapshotDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).parque.sala(ctx);
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "sala no disponible");
    return null;
  }
  return r.valor;
}

/** La primera página del directorio (T-22): de a 50, de la visita más reciente a la más vieja. */
export async function paginaDelDirectorio(): Promise<PaginaDelDirectorioDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).representantes.pagina(ctx, {});
  return r.ok ? r.valor : null;
}

/** Niños atendidos hoy y el mismo día de la semana pasada hasta esta hora (Inicio, B4-2). */
export async function ninosAtendidos(): Promise<{ hoy: number; semanaPasada: number } | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).parque.atendidos(ctx);
  return r.ok ? r.valor : null;
}
