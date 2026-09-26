import "server-only";
import { conectar, type Aplicacion, type Contexto } from "@l2/application";
import { crearLogger, type Logger } from "@l2/observability";
import type { Rechazo } from "@l2/contracts";
import { entorno } from "./entorno";

/**
 * La conexión del servidor web con la aplicación (B0-5). Una por proceso: en desarrollo,
 * Next recarga módulos y abriría una conexión nueva en cada cambio, así que se guarda en
 * `globalThis`.
 */
const global = globalThis as { __l2Aplicacion?: Promise<Aplicacion> | undefined; __l2Log?: Logger };

export function log(): Logger {
  return (global.__l2Log ??= crearLogger({ servicio: "web", nivel: entorno().L2_LOG_LEVEL }));
}

export function aplicacion(): Promise<Aplicacion> {
  const e = entorno();
  global.__l2Aplicacion ??= conectar(e.L2_DB_APP_URL).catch((error: unknown) => {
    // Sin esto, un arranque con la base caída dejaría la promesa rota para siempre.
    global.__l2Aplicacion = undefined;
    throw error;
  });
  return global.__l2Aplicacion;
}

/** El local donde corre este servidor. Con la sesión (B1) saldrá del dispositivo y la persona. */
export function contextoDelLocal(): Contexto {
  const e = entorno();
  return { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID };
}

/**
 * Hasta que exista la sesión en el servidor (B1-2) no hay a quién pedirle permiso, así que
 * las acciones que escriben SOLO corren en desarrollo. En staging o producción se niegan:
 * fail-closed, nunca «cualquiera puede publicar». Se quita en B1-5, cuando `can()` decida.
 */
export function escrituraSinSesion(): Rechazo | null {
  if (entorno().L2_ENTORNO === "desarrollo") return null;
  return {
    ok: false,
    motivo: "NO_PERMITIDO",
    mensaje: "Sin sesión en el servidor todavía: los cambios solo se guardan en desarrollo.",
  };
}
