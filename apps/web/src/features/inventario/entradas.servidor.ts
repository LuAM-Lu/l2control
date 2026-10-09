import "server-only";
import { connection } from "next/server";
import { periodoPredefinido } from "@l2/domain-cash";
import { EstadoDeEntradasSchema, type EntradasDto, type EstadoDeEntradas } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";
import { hoyEnElLocal, type ConsultaEnLaDireccion } from "../reportes/reportes.servidor";

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lo que se pidió de las entradas (de la dirección, o lo de fábrica) y lo que el servidor contestó (B9-13). */
export type EntradasPedidas = Readonly<{
  /** El día de hoy en el local, para los periodos de un toque. */
  hoy: string;
  pedido: Readonly<{ estado: EstadoDeEntradas; desde: string; hasta: string; pagina: number }>;
  /**
   * `null` si no hay sesión, no tiene permiso o el servidor no respondió: la pantalla lo dice en vez de enseñar una
   * lista vacía que parezca un local sin compras.
   */
  entradas: EntradasDto | null;
}>;

/**
 * Las entradas de mercancía de la sucursal (B9-3), leídas como la persona de la sesión: las ve quien puede recibir
 * mercancía. B9-13 (M-35): por estado, periodo y página, de la dirección (`?estado=…&desde=…&hasta=…&pagina=…`); sin
 * ellos, las vigentes de este mes.
 */
export async function entradasDelLocal(q: ConsultaEnLaDireccion): Promise<EntradasPedidas> {
  await connection();
  const hoy = await hoyEnElLocal();
  const mes = periodoPredefinido("MES", hoy);
  const estado = EstadoDeEntradasSchema.safeParse(uno(q.estado)).data ?? "VIGENTES";
  const pagina = Math.max(1, Math.trunc(Number(uno(q.pagina) ?? 1)) || 1);
  const pedido = { estado, desde: uno(q.desde) ?? mes.desde, hasta: uno(q.hasta) ?? mes.hasta, pagina };
  const ctx = await contextoActual();
  if (!ctx) return { hoy, pedido, entradas: null };
  const r = await (await aplicacion()).entradas.leer(ctx, pedido);
  return { hoy, pedido: r.ok ? { ...pedido, pagina: r.valor.pagina } : pedido, entradas: r.ok ? r.valor : null };
}
