import "server-only";
import { connection } from "next/server";
import type { AjustesPublicadosDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/**
 * Los ajustes vigentes de la sucursal, leídos en el servidor para el layout (B4-4).
 *
 * `connection()` obliga a leerlos en cada petición: sin ella, `next build` congelaría en el HTML el
 * formato de hora y los umbrales del día de la compilación. Sin ajustes publicados rigen los de
 * fábrica (versión 0), que el servidor pone: nunca se inventan aquí.
 */
export async function ajustesDelLocal(): Promise<AjustesPublicadosDto> {
  await connection();
  return (await aplicacion()).ajustes.leer(contextoDelLocal());
}
