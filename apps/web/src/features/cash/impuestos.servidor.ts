import "server-only";
import { connection } from "next/server";
import type { ImpuestosDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/**
 * El calendario de los impuestos, leído en el servidor (B2-2). Lo lee cualquiera: la caja de toda
 * estación calcula el ticket con él. `connection()` obliga a leerlo en cada petición: congelado en
 * la compilación, la caja cobraría con la alícuota de aquel día.
 */
export async function impuestosDelLocal(): Promise<ImpuestosDto> {
  await connection();
  return (await aplicacion()).impuestos.leer(contextoDelLocal());
}
