import "server-only";
import { conectar, type Aplicacion, type Contexto } from "@l2/application";
import { crearLogger, type Logger } from "@l2/observability";
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
  global.__l2Aplicacion ??= conectar(e.L2_DB_APP_URL, {
    claveCifrado: e.L2_CLAVE_CIFRADO,
    urlPublica: e.L2_URL_PUBLICA,
    // T-17: la cuenta de soporte opera en staging (y en desarrollo), nunca en producción.
    soporteOpera: e.L2_ENTORNO !== "produccion",
  }).catch((error: unknown) => {
    // Sin esto, un arranque con la base caída dejaría la promesa rota para siempre.
    global.__l2Aplicacion = undefined;
    throw error;
  });
  return global.__l2Aplicacion;
}

/**
 * El local que sirve este servidor, SIN persona: sirve para leer lo que no es de nadie en
 * particular (el tarifario vigente). Cualquier escritura con él se niega (deny-by-default);
 * lo que hace una persona usa `contextoActual()` de `sesion.ts`.
 */
export function contextoDelLocal(): Contexto {
  const e = entorno();
  return { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID };
}

