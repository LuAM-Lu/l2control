"use server";

import type { ActividadDelPeriodoDto, Resultado, VentaCerradaDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Los siguientes movimientos del periodo (T-22, `ConsultaDeActividadSchema` con `saltar` y `cuantos`): «Cargar más». */
export async function masMovimientos(entrada: unknown): Promise<Resultado<ActividadDelPeriodoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).reportes.actividad(ctx, entrada);
}

/** Una venta entera, para el detalle de un movimiento (B11-7). */
export async function ventaDelMovimiento(saleId: string): Promise<Resultado<VentaCerradaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).reportes.venta(ctx, { saleId });
}
