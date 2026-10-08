import "server-only";
import { connection } from "next/server";
import { calendarDay } from "@l2/domain-rates";
import { periodoPredefinido } from "@l2/domain-cash";
import type { InformeDeVentasDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";
import { ajustesDelLocal } from "../sucursal/ajustes.servidor";

/** Lo que la dirección dice de un informe: `?desde=…&hasta=…&cajera=…`. */
export type ConsultaEnLaDireccion = Readonly<Record<string, string | string[] | undefined>>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** El día de hoy en el local (su zona), para los periodos de un toque. */
export async function hoyEnElLocal(): Promise<string> {
  const { ajustes } = await ajustesDelLocal();
  return calendarDay(new Date().toISOString(), ajustes.zonaHoraria);
}

/** Lo que se pidió (de la dirección, o el día de hoy) y lo que el servidor contestó. */
export type VentasPedidas = Readonly<{
  /** El día de hoy en el local, para los periodos de un toque. */
  hoy: string;
  pedido: Readonly<{ desde: string; hasta: string; cajera: string | null }>;
  informe: Resultado<InformeDeVentasDto>;
}>;

/**
 * Reportes → Ventas (B11-1): el informe del periodo de la dirección; sin periodo, el de hoy. Lo revalida y lo arma el
 * caso de uso (`reportes.ventas`); aquí solo se lee la dirección.
 */
export async function informeDeVentas(q: ConsultaEnLaDireccion): Promise<VentasPedidas> {
  await connection();
  const hoy = await hoyEnElLocal();
  const porDefecto = periodoPredefinido("HOY", hoy);
  const cajera = uno(q.cajera) ?? null;
  const pedido = { desde: uno(q.desde) ?? porDefecto.desde, hasta: uno(q.hasta) ?? porDefecto.hasta, cajera };
  const ctx = await contextoActual();
  if (!ctx) return { hoy, pedido, informe: { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los reportes." } };
  const consulta = { desde: pedido.desde, hasta: pedido.hasta, ...(cajera ? { cajera } : {}) };
  return { hoy, pedido, informe: await (await aplicacion()).reportes.ventas(ctx, consulta) };
}
