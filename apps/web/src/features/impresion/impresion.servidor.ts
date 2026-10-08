import "server-only";
import { connection } from "next/server";
import type { HistorialDeImpresionDto, ImpresorasDelLocalDto, TrabajoDeImpresionDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las impresoras de la sucursal y sus agentes (B5-2), leídos en el servidor en cada petición. `null`
 * sin sesión o si el servidor no las puede leer: la pantalla lo dice en vez de enseñar una lista vacía.
 */
export async function impresorasDelLocal(): Promise<ImpresorasDelLocalDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).impresion.leer(ctx);
  if (!r.ok) {
    log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "impresoras no disponibles");
    return null;
  }
  return r.valor;
}

/** La cola de la sucursal, para quien imprime o configura; vacía si no puede verla. */
export async function trabajosDelLocal(): Promise<readonly TrabajoDeImpresionDto[]> {
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).impresion.trabajos(ctx);
  return r.ok ? r.valor.trabajos : [];
}

/** La primera página del historial (todo, lo más reciente primero); `null` si no se puede leer. */
export async function historialDelLocal(): Promise<HistorialDeImpresionDto | null> {
  const ctx = await contextoActual();
  if (!ctx) return null;
  const r = await (await aplicacion()).impresion.historial(ctx, {});
  return r.ok ? r.valor : null;
}

/**
 * El agente empaquetado que se puede descargar, con su versión y su huella; `null` si no está. Su versión la
 * escribe el empaquetado al lado (`.version`, T-8c); sin ella, la del sistema: se empaqueta con la misma etiqueta
 * (T-8a), y la imagen no lleva el package.json raíz.
 */
export async function agenteDescargable(): Promise<{ version: string; sha256: string; mb: number } | null> {
  const d = await ejecutableDelAgente();
  // Lo que ve el panel: sin la ruta del archivo en el servidor.
  return d ? { version: d.version, sha256: d.sha256, mb: d.mb } : null;
}

/** El ejecutable del agente en este servidor, con su ruta: solo para las rutas que lo sirven. */
export async function ejecutableDelAgente(): Promise<{ exe: string; version: string; sha256: string; mb: number } | null> {
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const { entorno } = await import("../../servidor/entorno");
  const { VERSION } = await import("../shell/version");
  // La ruta la decide el entorno al arrancar: que `next build` no trace el proyecto entero buscándola.
  const exe = entorno().L2_AGENTE_EXE || resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "printer-agent", "dist", "l2-impresion.exe");
  if (!existsSync(/*turbopackIgnore: true*/ exe)) return null;
  const leer = (archivo: string) => (existsSync(/*turbopackIgnore: true*/ archivo) ? readFileSync(/*turbopackIgnore: true*/ archivo, "utf8").trim() : "");
  const sha256 = leer(`${exe}.sha256`).split(/\s+/)[0] ?? "";
  const version = leer(`${exe}.version`) || VERSION.numero;
  return { exe, version, sha256, mb: Math.round(statSync(/*turbopackIgnore: true*/ exe).size / 1_048_576) };
}

/**
 * El agente que pide su versión o su ejecutable (T-8c), por su credencial (`Authorization: Bearer`): no tiene sesión,
 * es el programa de la laptop de caja. Si no vale, la respuesta 401 que hay que devolver.
 */
export async function agenteDeLaPeticion(peticion: Request): Promise<{ agenteId: string; pedida: boolean } | Response> {
  const { entorno } = await import("../../servidor/entorno");
  const credencial = /^Bearer (\S+)$/.exec(peticion.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = credencial ? await (await aplicacion()).impresion.actualizacionDe(entorno().L2_TENANT_ID, credencial) : null;
  if (!a) {
    log().warn({ ruta: new URL(peticion.url).pathname }, "agente: credencial que no vale");
    return new Response("El servidor no reconoce este agente: vuélvelo a vincular desde Ajustes → Impresoras.", { status: 401, headers: { "www-authenticate": "Bearer" } });
  }
  return a;
}

/** A dónde se conecta el agente: la misma dirección del canal en vivo (vacía = esta máquina, ese puerto). */
export async function direccionDelWorker(): Promise<{ url: string; puerto: number }> {
  const { entorno } = await import("../../servidor/entorno");
  const e = entorno();
  return { url: e.L2_TIEMPO_REAL_URL, puerto: e.L2_TIEMPO_REAL_PUERTO };
}
