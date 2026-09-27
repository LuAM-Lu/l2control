import "server-only";
import { z } from "zod";
import { leerEntorno, nivelLog, urlPostgres } from "@l2/observability";

/**
 * El entorno del servidor web — B0-3, enganchado en B0-5. Se valida al arrancar
 * (`instrumentation.ts`): si falta algo o algo no tiene la forma esperada, el servidor NO
 * arranca y dice qué (§10.3). No hay valores por defecto ni modo sin base: el modo demo se
 * retiró el 2026-09-26 (MAESTRO, M-6).
 */
const EsquemaEntorno = z.object({
  L2_ENTORNO: z.enum(["desarrollo", "staging", "produccion"]),
  L2_DB_APP_URL: urlPostgres,
  L2_LOG_LEVEL: nivelLog,
  L2_TENANT_ID: z.uuid(),
  L2_BRANCH_ID: z.uuid(),
  /** 32 bytes en base64: sin ella no hay elevación con TOTP ni cifrado en reposo (§7.6). */
  L2_CLAVE_CIFRADO: z.base64().refine((v) => Buffer.from(v, "base64").length === 32, "32 bytes en base64"),
  /**
   * Traer sola la tasa del BCV cada hora (F3-04). `no` en un servidor sin salida a internet o en
   * las pruebas; lo traído siempre entra pendiente de confirmar.
   */
  L2_SINCRONIZAR_TASA: z.enum(["si", "no"]).default("si"),
});

export type EntornoWeb = z.infer<typeof EsquemaEntorno>;

let validado: EntornoWeb | undefined;

/** El entorno validado. La primera llamada valida; si algo falla, lanza `EntornoInvalido`. */
export function entorno(): EntornoWeb {
  return (validado ??= leerEntorno(EsquemaEntorno));
}
