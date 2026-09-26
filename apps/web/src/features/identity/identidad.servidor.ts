import "server-only";
import type { BranchAccessDto, Resultado, UsersDirectoryDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra por el acceso para ver esto." } as const;

/** El directorio de personas de la sucursal de la sesión (F2-10). Exige `usuarios.gestionar`. */
export async function directorioDelLocal(): Promise<Resultado<UsersDirectoryDto>> {
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).equipo.directorio(ctx) : sinSesion;
}

/** Los ajustes de la sucursal sobre la matriz (F2-13). Exige `usuarios.gestionar`. */
export async function accesosDelLocal(): Promise<Resultado<BranchAccessDto>> {
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).accesos.leer(ctx) : sinSesion;
}
