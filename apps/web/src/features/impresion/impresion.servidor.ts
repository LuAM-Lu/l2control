import "server-only";
import { connection } from "next/server";
import type { ImpresorasDelLocalDto, TrabajoDeImpresionDto } from "@l2/contracts";
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

/** El agente empaquetado que se puede descargar, con su versión y su huella; `null` si no está. */
export async function agenteDescargable(): Promise<{ version: string; sha256: string; mb: number } | null> {
  const { existsSync, readFileSync, statSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const { entorno } = await import("../../servidor/entorno");
  const exe = entorno().L2_AGENTE_EXE || resolve(process.cwd(), "..", "printer-agent", "dist", "l2-impresion.exe");
  if (!existsSync(exe)) return null;
  const sha256 = existsSync(`${exe}.sha256`) ? (readFileSync(`${exe}.sha256`, "utf8").split(/\s+/)[0] ?? "") : "";
  const version = (JSON.parse(readFileSync(resolve(process.cwd(), "..", "..", "package.json"), "utf8")) as { version: string }).version;
  return { version, sha256, mb: Math.round(statSync(exe).size / 1_048_576) };
}

/** A dónde se conecta el agente: la misma dirección del canal en vivo (vacía = esta máquina, ese puerto). */
export async function direccionDelWorker(): Promise<{ url: string; puerto: number }> {
  const { entorno } = await import("../../servidor/entorno");
  const e = entorno();
  return { url: e.L2_TIEMPO_REAL_URL, puerto: e.L2_TIEMPO_REAL_PUERTO };
}
