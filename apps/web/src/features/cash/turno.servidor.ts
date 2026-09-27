import "server-only";
import { connection } from "next/server";
import type { TurnoDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El turno del equipo de esta petición (B3-1), leído en el servidor en cada petición: la barra, la
 * caja y /turno enseñan el real, no uno supuesto. `null` sin sesión o sin turno abierto.
 */
export async function turnoDelEquipo(): Promise<TurnoDto | null> {
  await connection();
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).turnos.delEquipo(ctx) : null;
}

/** Los turnos abiertos de la sucursal, para Inicio. Vacío sin sesión o sin permiso. */
export async function turnosAbiertos(): Promise<TurnoDto[]> {
  await connection();
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).turnos.abiertos(ctx) : [];
}
