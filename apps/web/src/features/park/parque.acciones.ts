"use server";

import type {
  CheckInResult,
  CheckoutResult,
  DirectorioRepresentantesDto,
  EstanciaDto,
  EstadoPulseraDto,
  FamilyAccountDto,
  MonitorSnapshotDto,
  RecargaResult,
  RepresentanteEncontradoDto,
  Resultado,
} from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * El parque en el servidor (B4-1 a B4-3). Todo opera como la persona de la sesión; lo que llega es
 * `unknown` y el caso de uso lo revalida con el contrato (ADR-017). Al log van el identificador y el
 * motivo, nunca un contacto ni un nombre de niño (§7.6).
 */

const sinSesion = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." } as const;

/** La sala con la hora del servidor: la vuelven a leer las estaciones cuando cambia (B5-1). */
export async function leerSala(): Promise<Resultado<MonitorSnapshotDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).parque.sala(ctx);
}

/** Registra una entrada: estancias y cuenta de la familia, juntas. */
export async function registrarEntrada(entrada: unknown): Promise<Resultado<CheckInResult>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).parque.entrar(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.account.id, ninos: r.valor.sessions.length }, "entrada al parque");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "entrada rechazada");
  return r;
}

/** Registra la salida de niños de una familia y liquida su tiempo de más. */
export async function registrarSalida(entrada: unknown): Promise<Resultado<CheckoutResult>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).parque.salir(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.account.id, estado: r.valor.account.status }, "salida del parque");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo, problemas: r.problemas?.map((p) => p.message) }, "salida rechazada");
  return r;
}

/** Pone o corrige el nombre del niño de una estancia en sala (DEC-28). */
export async function nombrarEstancia(entrada: unknown): Promise<Resultado<EstanciaDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).parque.nombrar(ctx, entrada);
}

/** Si una pulsera se puede usar en una entrada (V-1): libre, en sala, ya usada o de otra serie. */
export async function consultarPulsera(entrada: unknown): Promise<Resultado<EstadoPulseraDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).parque.pulsera(ctx, entrada);
}

/** La familia de un contacto (entero), o `null` si no ha venido nunca. */
export async function buscarRepresentante(entrada: unknown): Promise<Resultado<RepresentanteEncontradoDto | null>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).representantes.buscar(ctx, entrada);
}

/** Corrige un representante o un niño del directorio; devuelve el directorio. */
export async function corregirDirectorio(entrada: unknown): Promise<Resultado<DirectorioRepresentantesDto>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  return (await aplicacion()).representantes.corregir(ctx, entrada);
}

/** Recarga tiempo a un niño en sala (F5-11): un paquete de tiempo fijo más, a su cuenta. */
export async function recargarEstancia(entrada: unknown): Promise<Resultado<RecargaResult>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).parque.recargar(ctx, entrada);
  if (!r.ok) log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "recarga rechazada");
  return r;
}

/** La dirección cierra una estancia huérfana con su motivo (F5-13): sin tiempo de más. */
export async function cerrarEstanciaHuerfana(entrada: unknown): Promise<Resultado<{ account: FamilyAccountDto }>> {
  const ctx = await contextoActual();
  if (!ctx) return sinSesion;
  const r = await (await aplicacion()).parque.cerrarHuerfana(ctx, entrada);
  if (r.ok) log().info({ tenantId: ctx.tenantId, cuenta: r.valor.account.id }, "estancia huérfana cerrada");
  else log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cierre de huérfana rechazado");
  return r;
}
