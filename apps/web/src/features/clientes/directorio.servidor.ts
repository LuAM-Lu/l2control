import "server-only";
import { connection } from "next/server";
import type { PaginaDeClientesDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/** La primera página de Clientes (T-25): todos, del más reciente al más viejo. `null` si quien entra no puede verlos. */
export async function paginaDeClientes(): Promise<PaginaDeClientesDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).directorio.pagina(ctx, {});
  return r.ok ? r.valor : null;
}
