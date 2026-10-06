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
 * El agente empaquetado que se puede descargar, con su versión y su huella; `null` si no está. Su versión
 * es la del sistema: se empaqueta con la misma etiqueta (T-8a), y la imagen no lleva el package.json raíz.
 */
export async function agenteDescargable(): Promise<{ version: string; sha256: string; mb: number } | null> {
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const { entorno } = await import("../../servidor/entorno");
  const { VERSION } = await import("../shell/version");
  // La ruta la decide el entorno al arrancar: que `next build` no trace el proyecto entero buscándola.
  const exe = entorno().L2_AGENTE_EXE || resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "printer-agent", "dist", "l2-impresion.exe");
  if (!existsSync(/*turbopackIgnore: true*/ exe)) return null;
  const huella = `${exe}.sha256`;
  const sha256 = existsSync(/*turbopackIgnore: true*/ huella) ? (readFileSync(/*turbopackIgnore: true*/ huella, "utf8").split(/\s+/)[0] ?? "") : "";
  return { version: VERSION.numero, sha256, mb: Math.round(statSync(/*turbopackIgnore: true*/ exe).size / 1_048_576) };
}

/** A dónde se conecta el agente: la misma dirección del canal en vivo (vacía = esta máquina, ese puerto). */
export async function direccionDelWorker(): Promise<{ url: string; puerto: number }> {
  const { entorno } = await import("../../servidor/entorno");
  const e = entorno();
  return { url: e.L2_TIEMPO_REAL_URL, puerto: e.L2_TIEMPO_REAL_PUERTO };
}
