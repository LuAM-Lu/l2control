"use server";

import { revalidatePath } from "next/cache";
import type { CambioHecho } from "@l2/application";
import type { BranchAccessDto, Resultado, UserSummaryDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Personas, excepciones y accesos (B1-5). Cada acción opera como la persona de la sesión; el
 * caso de uso revalida el comando con el contrato, aplica las reglas del dominio (las cinco
 * puertas, el suelo intocable) y deja su asiento. Tras un cambio se vuelve a pintar todo, porque
 * puede cambiar lo que alguien alcanza, y el menú se pinta con el actor del servidor.
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

export async function cambiarPersona(comando: unknown): Promise<Resultado<CambioHecho>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).equipo.cambiar(ctx, comando);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function registrarExcepcion(comando: unknown): Promise<Resultado<UserSummaryDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).equipo.excepcion(ctx, comando);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function ordenarAcceso(comando: unknown): Promise<Resultado<BranchAccessDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).accesos.ordenar(ctx, comando);
  if (r.ok) revalidatePath("/", "layout");
  return r;
}
