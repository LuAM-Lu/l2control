import "server-only";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los recorridos guiados que vio la persona de la sesión (T-12), como «recorrido@versión». Sin sesión, ninguno: el
 * acceso no enseña recorridos.
 */
export async function recorridosVistos(): Promise<string[]> {
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).recorridos.vistos(ctx);
  return r.ok ? r.valor.vistos.map((v) => `${v.recorrido}@${v.version}`) : [];
}
