import "server-only";
import { connection } from "next/server";
import type { CatalogoDto } from "@l2/contracts";
import { aplicacion, contextoDelLocal } from "../../servidor/aplicacion";

/**
 * El catálogo de productos del local, leído en el servidor (B9-1). Lo lee cualquiera: la caja de
 * toda estación vende con él. `connection()` obliga a leerlo en cada petición: congelado en la
 * compilación, la caja vendería con los precios de aquel día.
 *
 * Los retirados (B9-11) no salen en ninguna lista: la caja, la carta, la tablet, las entradas y los conteos no los ven.
 * Solo Productos los pide (`conRetirados`), para su filtro «Retirados».
 */
export async function catalogoDelLocal({ conRetirados = false }: { conRetirados?: boolean } = {}): Promise<CatalogoDto> {
  await connection();
  const c = await (await aplicacion()).productos.leer(contextoDelLocal());
  return conRetirados ? c : { ...c, productos: c.productos.filter((p) => !p.retirado) };
}
