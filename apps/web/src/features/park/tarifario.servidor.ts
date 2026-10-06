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
 * `null` es «todavía no se publicó ninguno»: así nace un local recién instalado (M-12, T-4), y
 * la Puesta a punto lo lista como lo que falta para abrir la entrada. No se inventa uno: sin
 * tarifario el parque no vende (el servidor niega la entrada, fail-closed) y cada pantalla dice
 * qué falta. Antes esto lanzaba, y con la base vacía no abría ni el acceso.
 */
export async function tarifarioVigente(): Promise<TarifarioPublicadoDto | null> {
  await connection();
  return (await aplicacion()).tarifario.leer(contextoDelLocal());
}

/** La primera página del historial del tarifario, para Ajustes → Tarifas y paquetes (T-7). */
export async function versionesDelTarifario(): Promise<Resultado<PaginaDeVersionesTarifarioDto>> {
  await connection();
  return (await aplicacion()).tarifario.versiones(contextoDelLocal(), {});
}
