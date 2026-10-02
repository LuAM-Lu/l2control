import "server-only";
import type { PaginaDeDispositivosDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/** La primera página de los equipos de la sucursal (F2-02, T-7). Exige `usuarios.gestionar`. */
export async function dispositivosDelLocal(): Promise<Resultado<PaginaDeDispositivosDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra por el acceso para ver los equipos." };
  return (await aplicacion()).dispositivos.pagina(ctx, {});
}
