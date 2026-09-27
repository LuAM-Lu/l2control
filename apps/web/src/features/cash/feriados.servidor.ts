import "server-only";
import { connection } from "next/server";
import type { FeriadosDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/** Los feriados bancarios del local (B2-4), leídos en el servidor en cada petición. */
export async function feriadosDelLocal(): Promise<FeriadosDto> {
  await connection();
  return (await aplicacion()).feriados.listar(contextoDelLocal());
}
