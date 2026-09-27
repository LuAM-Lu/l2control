import "server-only";
import { connection } from "next/server";
import type { HistorialTasasDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El historial de tasas, leído en el servidor para el layout (B2-1). Lo lee cualquiera: la barra
 * de toda estación enseña con qué tasa se cobra (§5.2). `connection()` obliga a leerlo en cada
 * petición: congelado en la compilación, la caja cobraría con la tasa de aquel día.
 */
export async function historialDeTasas(): Promise<HistorialTasasDto> {
  await connection();
  return (await aplicacion()).tasas.leer(contextoDelLocal());
}

/**
 * Quiénes pueden autorizar a la persona de la sesión a confirmar una tasa (el 🔐 de supervisión).
 * Vacío para administración, que no lo necesita, y sin sesión.
 */
export async function autorizadoresDeTasa(): Promise<{ id: string; nombre: string }[]> {
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).tasas.autorizadores(ctx) : [];
}
