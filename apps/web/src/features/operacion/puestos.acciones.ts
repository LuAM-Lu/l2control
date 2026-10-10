"use server";

import type { PuestosDelDiaDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Los puestos del día, por uso (T-20): se vuelven a leer cuando algo cambia en el local. */
export async function leerPuestos(): Promise<Resultado<PuestosDelDiaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).puestos.delDia(ctx);
}
