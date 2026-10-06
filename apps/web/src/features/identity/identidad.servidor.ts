import "server-only";
import type { BranchAccessDto, CredencialesDePersonaDto, PuestaAPuntoDto, Resultado, UsersDirectoryDto } from "@l2/contracts";
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

/** Las credenciales de cada persona, sin ningún secreto (ADR-020). Exige `usuarios.gestionar`. */
export async function credencialesDelLocal(): Promise<Resultado<CredencialesDePersonaDto[]>> {
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).enlaces.resumen(ctx) : sinSesion;
}

/** La Puesta a punto (JORNADA §2), que solo ve quien gestiona personas. */
export async function puestaAPuntoDelLocal(): Promise<Resultado<PuestaAPuntoDto>> {
  const ctx = await contextoActual();
  return ctx ? (await aplicacion()).puestaAPunto.leer(ctx) : sinSesion;
}
