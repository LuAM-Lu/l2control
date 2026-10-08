import "server-only";
import { connection } from "next/server";
import type { ReportesDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/** La bandeja de soporte (T-11): todos los reportes del local, para quien atiende el soporte. */
export async function bandejaDeSoporte(): Promise<Resultado<ReportesDto>> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra por el acceso para ver el soporte." };
  return (await aplicacion()).soporte.bandeja(ctx);
}
