import "server-only";
import { connection } from "next/server";
import type { CatalogoDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/**
 * El catálogo de productos del local, leído en el servidor (B9-1). Lo lee cualquiera: la caja de
 * toda estación vende con él. `connection()` obliga a leerlo en cada petición: congelado en la
 * compilación, la caja vendería con los precios de aquel día.
 */
export async function catalogoDelLocal(): Promise<CatalogoDto> {
  await connection();
  return (await aplicacion()).productos.leer(contextoDelLocal());
}
