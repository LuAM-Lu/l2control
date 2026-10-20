"use server";

import type { FichaDelClienteDto, PaginaDeClientesDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** Clientes (T-25): una página, con lo buscado y el filtro (`PaginaDeClientesQuerySchema`). */
export async function buscarClientes(entrada: unknown): Promise<Resultado<PaginaDeClientesDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).directorio.pagina(ctx, entrada);
}

/** La ficha de un cliente; si se juntó con otro, la del que queda. */
export async function leerFichaDelCliente(clienteId: unknown): Promise<Resultado<FichaDelClienteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  if (typeof clienteId !== "string" || !/^[0-9a-f-]{36}$/i.test(clienteId)) return { ok: false, motivo: "INVALIDO", mensaje: "Ese cliente no existe." };
  return (await aplicacion()).directorio.ficha(ctx, clienteId);
}

/** Corrige sus datos (`CorregirClienteCommandSchema`). */
export async function corregirCliente(entrada: unknown): Promise<Resultado<FichaDelClienteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).directorio.corregir(ctx, entrada);
}

/** Agrega, corrige o retira uno de sus niños (`NinoDelClienteCommandSchema`). */
export async function ninoDelCliente(entrada: unknown): Promise<Resultado<FichaDelClienteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).directorio.nino(ctx, entrada);
}

/** Junta a la misma persona que quedó dos veces (`JuntarClientesCommandSchema`). */
export async function juntarClientes(entrada: unknown): Promise<Resultado<FichaDelClienteDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).directorio.juntar(ctx, entrada);
}
