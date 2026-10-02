import "server-only";
import { connection } from "next/server";
import type { PaginaDeVersionesTarifarioDto, Resultado, TarifarioPublicadoDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/**
 * El tarifario vigente, leído en el servidor para el layout (B0-5).
 *
 * `connection()` obliga a leerlo en cada petición: sin ella, `next build` lo congelaría en
 * el HTML con el precio del día de la compilación.
 *
 * Sin tarifario publicado el parque no puede vender, y no se inventa uno: se falla con un
 * mensaje que dice qué hacer (fail-closed).
 */
export async function tarifarioVigente(): Promise<TarifarioPublicadoDto> {
  await connection();
  const vigente = await (await aplicacion()).tarifario.leer(contextoDelLocal());
  if (!vigente) {
    throw new Error(
      "Esta sucursal no tiene tarifario publicado. En desarrollo: `pnpm db:semilla`. " +
        "En un local nuevo, publícalo desde Panel → Ajustes → Tarifas y paquetes.",
    );
  }
  return vigente;
}

/** La primera página del historial del tarifario, para Ajustes → Tarifas y paquetes (T-7). */
export async function versionesDelTarifario(): Promise<Resultado<PaginaDeVersionesTarifarioDto>> {
  await connection();
  return (await aplicacion()).tarifario.versiones(contextoDelLocal(), {});
}
