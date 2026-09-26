import "server-only";
import type { DevicesDirectoryDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/** Los equipos de la sucursal de la sesión (F2-02). Exige `usuarios.gestionar`. */
export async function dispositivosDelLocal(): Promise<Resultado<DevicesDirectoryDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra por el acceso para ver los equipos." };
  return (await aplicacion()).dispositivos.listar(ctx);
}
