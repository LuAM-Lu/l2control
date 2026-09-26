import "server-only";
import { conectar, type Aplicacion, type Contexto } from "@l2/application";
import { crearLogger, type Logger } from "@l2/observability";
import type { Rechazo } from "@l2/contracts";
import { entorno, type EntornoServidor } from "./entorno";

/**
 * La conexión del servidor web con la aplicación (B0-5). Una por proceso: en desarrollo,
 * Next recarga módulos y abriría una conexión nueva en cada cambio, así que se guarda en
 * `globalThis`.
 */
const global = globalThis as { __l2Aplicacion?: Promise<Aplicacion> | undefined; __l2Log?: Logger };

export function log(): Logger {
  const e = entorno();
  return (global.__l2Log ??= crearLogger({
    servicio: "web",
    nivel: e.L2_FUENTE_DE_DATOS === "servidor" ? e.L2_LOG_LEVEL : "info",
  }));
}

/** El entorno en modo servidor. Llamarlo en modo demo es un error de programación. */
export function entornoServidor(): EntornoServidor {
  const e = entorno();
  if (e.L2_FUENTE_DE_DATOS !== "servidor") {
    throw new Error("Se pidió la base con L2_FUENTE_DE_DATOS=demo.");
  }
  return e;
}

export function aplicacion(): Promise<Aplicacion> {
  const e = entornoServidor();
  global.__l2Aplicacion ??= conectar(e.L2_DB_APP_URL).catch((error: unknown) => {
    // Sin esto, un arranque con la base caída dejaría la promesa rota para siempre.
    global.__l2Aplicacion = undefined;
    throw error;
  });
  return global.__l2Aplicacion;
}

/** El local donde corre este servidor. Con la sesión (B1) saldrá del dispositivo y la persona. */
export function contextoDelLocal(): Contexto {
  const e = entornoServidor();
  return { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID };
}

/**
 * Hasta que exista la sesión en el servidor (B1-2) no hay a quién pedirle permiso, así que
 * las acciones que escriben SOLO corren en desarrollo. En staging o producción se niegan:
 * fail-closed, nunca «cualquiera puede publicar». Se quita en B1-5, cuando `can()` decida.
 */
export function escrituraSinSesion(): Rechazo | null {
  if (entornoServidor().L2_ENTORNO === "desarrollo") return null;
  return {
    ok: false,
    motivo: "NO_PERMITIDO",
    mensaje: "Sin sesión en el servidor todavía: los cambios solo se guardan en desarrollo.",
  };
}
