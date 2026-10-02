import "server-only";
import { connection } from "next/server";
import type { PlanoPublicadoDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/**
 * El plano publicado del local, leído en el servidor para el layout (B6-1). `plano: null` si nunca se
 * dibujó: el salón lo dice y enlaza a Ajustes → Plano del local, sin inventar mesas. `connection()`
 * obliga a leerlo en cada petición: congelado en la compilación, el salón vería el plano de aquel día.
 */
export async function planoDelLocal(): Promise<PlanoPublicadoDto> {
  await connection();
  return (await aplicacion()).plano.leer(contextoDelLocal());
}
