"use server";

import { revalidatePath } from "next/cache";
import type { CatalogoDto, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Un cambio del catálogo de productos (B9-1, F8-02). Opera como la persona de la sesión: el caso de
 * uso exige `catalogo.modificar` con elevación y deja el asiento a su nombre. Lo que llega es
 * `unknown`: el caso de uso lo revalida con el contrato (ADR-017), y el día de un precio lo
 * convierte en instante el servidor.
 */
export async function aplicarProducto(entrada: unknown): Promise<Resultado<CatalogoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para cambiar el catálogo." };

  const resultado = await (await aplicacion()).productos.aplicar(ctx, entrada);
  const cambio = typeof entrada === "object" && entrada !== null && "kind" in entrada ? String(entrada.kind) : "desconocido";
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, cambio }, "catálogo de productos cambiado");
    // La caja que navegue lee ya lo nuevo; empujarlo en vivo es de B5-1.
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, cambio, motivo: resultado.motivo }, "cambio del catálogo rechazado");
  }
  return resultado;
}

/**
 * El alta del catálogo en una hoja, sin cantidades (B9-7): todos o ninguno. Es del inventario
 * (`inventario.catalogo`), como «Nuevo producto»; el caso de uso lo revalida con el contrato.
 */
export async function altaEnLote(entrada: unknown): Promise<Resultado<CatalogoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para dar de alta el catálogo." };
  const resultado = await (await aplicacion()).productos.altaEnLote(ctx, entrada);
  const productos = typeof entrada === "object" && entrada !== null && "productos" in entrada && Array.isArray(entrada.productos) ? entrada.productos.length : 0;
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, productos }, "catálogo dado de alta en lote");
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, productos, motivo: resultado.motivo }, "alta en lote rechazada");
  }
  return resultado;
}

/**
 * Fijar o quitar el stock mínimo de un producto (B9-5). Lo hace quien recibe la mercancía
 * (`inventario.entrada`), sin elevación: no cambia lo que se cobra. El caso de uso lo revalida.
 */
export async function fijarMinimo(entrada: unknown): Promise<Resultado<CatalogoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para fijar el mínimo." };
  const resultado = await (await aplicacion()).productos.fijarMinimo(ctx, entrada);
  if (resultado.ok) revalidatePath("/", "layout");
  else log().warn({ tenantId: ctx.tenantId, motivo: resultado.motivo }, "mínimo de stock rechazado");
  return resultado;
}

/**
 * Un cambio de la lista de categorías (T-10): crear, renombrar, unir o retirar una vacía. Es del
 * catálogo: el caso de uso exige `catalogo.modificar` con elevación y deja el asiento.
 */
export async function aplicarCategoria(entrada: unknown): Promise<Resultado<CatalogoDto>> {
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar para cambiar las categorías." };
  const resultado = await (await aplicacion()).categorias.aplicar(ctx, entrada);
  const cambio = typeof entrada === "object" && entrada !== null && "kind" in entrada ? String(entrada.kind) : "desconocido";
  if (resultado.ok) {
    log().info({ tenantId: ctx.tenantId, cambio }, "categorías cambiadas");
    revalidatePath("/", "layout");
  } else {
    log().warn({ tenantId: ctx.tenantId, cambio, motivo: resultado.motivo }, "cambio de categorías rechazado");
  }
  return resultado;
}
