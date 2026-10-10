import "server-only";
import { connection } from "next/server";
import { calendarDay } from "@l2/domain-rates";
import { periodoPredefinido } from "@l2/domain-cash";
import type { InformeDeDeudasDto, InformeDeInventarioDto, InformeDeMovimientosDto, InformeDeVentasDto, InformeDelParqueDto, Resultado, ValesDelPersonalDto } from "@l2/contracts";
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

/** Lo que se pidió del kárdex (de la dirección, o el día de hoy sin producto) y lo que el servidor contestó. */
export type MovimientosPedidos = Readonly<{
  hoy: string;
  pedido: Readonly<{ desde: string; hasta: string; producto: string | null; categoria: string | null }>;
  informe: Resultado<InformeDeMovimientosDto>;
}>;

/**
 * Reportes → Movimientos (B11-3): el kárdex del periodo y del producto o la categoría de la dirección. Sin periodo, el
 * de hoy; sin producto ni categoría, el informe trae solo lo que se puede elegir.
 */
export async function informeDeMovimientos(q: ConsultaEnLaDireccion): Promise<MovimientosPedidos> {
  await connection();
  const hoy = await hoyEnElLocal();
  const porDefecto = periodoPredefinido("HOY", hoy);
  const producto = uno(q.producto) ?? null;
  const categoria = producto ? null : (uno(q.categoria) ?? null);
  const pedido = { desde: uno(q.desde) ?? porDefecto.desde, hasta: uno(q.hasta) ?? porDefecto.hasta, producto, categoria };
  const ctx = await contextoActual();
  if (!ctx) return { hoy, pedido, informe: { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los reportes." } };
  const consulta = { desde: pedido.desde, hasta: pedido.hasta, ...(producto ? { producto } : {}), ...(categoria ? { categoria } : {}) };
  return { hoy, pedido, informe: await (await aplicacion()).reportes.movimientos(ctx, consulta) };
}

/** Reportes → Inventario al momento (B11-2): el inventario de la sucursal a esta hora. */
export async function informeDeInventario(): Promise<Resultado<InformeDeInventarioDto>> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los reportes." };
  return (await aplicacion()).reportes.inventario(ctx);
}

/** Lo que se pidió de los vales del personal (de la dirección, o la quincena en curso) y lo que el servidor contestó. */
export type ValesPedidos = Readonly<{
  hoy: string;
  pedido: Readonly<{ desde: string; hasta: string }>;
  informe: Resultado<ValesDelPersonalDto>;
}>;

/**
 * Caja → Personal y Reportes → Personal (B3-17, M-37): los vales del periodo de la dirección; sin periodo, los de la
 * quincena en curso. Los de todos son de supervisión y administración: a los demás el caso de uso les dice que no, y la
 * caja les ofrece ver los suyos con su PIN.
 */
export async function valesDelPeriodo(q: ConsultaEnLaDireccion): Promise<ValesPedidos> {
  await connection();
  const hoy = await hoyEnElLocal();
  const porDefecto = periodoPredefinido("QUINCENA", hoy);
  const pedido = { desde: uno(q.desde) ?? porDefecto.desde, hasta: uno(q.hasta) ?? porDefecto.hasta };
  const ctx = await contextoActual();
  if (!ctx) return { hoy, pedido, informe: { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los vales." } };
  return { hoy, pedido, informe: await (await aplicacion()).personal.vales(ctx, pedido) };
}

/** Lo que se pidió del informe del parque (de la dirección, o el día de hoy) y lo que el servidor contestó. */
export type ParquePedido = Readonly<{
  hoy: string;
  pedido: Readonly<{ desde: string; hasta: string }>;
  informe: Resultado<InformeDelParqueDto>;
}>;

/** Reportes → Parque (B11-6): el parque del periodo de la dirección; sin periodo, el de hoy. */
export async function informeDelParque(q: ConsultaEnLaDireccion): Promise<ParquePedido> {
  await connection();
  const hoy = await hoyEnElLocal();
  const porDefecto = periodoPredefinido("HOY", hoy);
  const pedido = { desde: uno(q.desde) ?? porDefecto.desde, hasta: uno(q.hasta) ?? porDefecto.hasta };
  const ctx = await contextoActual();
  if (!ctx) return { hoy, pedido, informe: { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los reportes." } };
  return { hoy, pedido, informe: await (await aplicacion()).reportes.parque(ctx, pedido) };
}

/** Lo que se pidió del informe de deudas (de la dirección, o el día de hoy) y lo que el servidor contestó. */
export type DeudasPedidas = Readonly<{
  hoy: string;
  pedido: Readonly<{ desde: string; hasta: string }>;
  informe: Resultado<InformeDeDeudasDto>;
}>;

/**
 * Reportes → Deudas (B11-4, M-33): las deudas de clientes del periodo de la dirección; sin periodo, las de hoy. Lo
 * revalida y lo arma el caso de uso (`reportes.deudas`).
 */
export async function informeDeDeudas(q: ConsultaEnLaDireccion): Promise<DeudasPedidas> {
  await connection();
  const hoy = await hoyEnElLocal();
  const porDefecto = periodoPredefinido("HOY", hoy);
  const pedido = { desde: uno(q.desde) ?? porDefecto.desde, hasta: uno(q.hasta) ?? porDefecto.hasta };
  const ctx = await contextoActual();
  if (!ctx) return { hoy, pedido, informe: { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los reportes." } };
  return { hoy, pedido, informe: await (await aplicacion()).reportes.deudas(ctx, pedido) };
}
