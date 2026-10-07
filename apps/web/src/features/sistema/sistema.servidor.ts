import "server-only";
import { connection } from "next/server";
import type { EstadoDelSistemaDto, Resultado } from "@l2/contracts";
import type { Servidor } from "@l2/application";
import { aplicacion } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";
import { entorno } from "../../servidor/entorno";
import { VERSION } from "../shell/version";

/**
 * Lo que este servidor web sabe de sí mismo (T-8b): su versión, la incrustada al compilar, y si se pone al
 * día solo (staging). La versión en marcha la dice el servidor, nunca el navegador (ADR-017).
 */
export function servidorActual(): Servidor {
  return { enMarcha: VERSION.numero || "0.0.0", automatico: entorno().L2_ENTORNO === "staging" };
}

/** Ajustes → Sistema: la versión en marcha, las disponibles, la pendiente y lo que impide actualizar ahora. */
export async function estadoDelSistema(): Promise<Resultado<EstadoDelSistemaDto>> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver el sistema." };
  return (await aplicacion()).actualizaciones.estado(ctx, servidorActual());
}

/** Lo que enseña Inicio a quien decide: la versión nueva, si es urgente y si ya se pidió. */
export type AvisoDeVersion = Readonly<{ version: string; urgente: boolean; pedida: "AHORA" | "AL_CIERRE" | null }>;

/**
 * Inicio (T-8b): si hay una versión más nueva que la que está en marcha, para quien decide las
 * actualizaciones. En staging, nada: se pone al día solo. Sin permiso o sin servidor, nada.
 */
export async function avisoDeVersion(): Promise<AvisoDeVersion | null> {
  const r = await estadoDelSistema();
  if (!r.ok || r.valor.automatico) return null;
  const nueva = r.valor.disponibles[0];
  if (!nueva) return null;
  const p = r.valor.pendiente;
  return { version: nueva.version, urgente: nueva.urgente, pedida: p && p.modo !== "AUTOMATICA" ? p.modo : null };
}
