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
  /** 32 bytes en base64: sin ella no hay cifrado en reposo ni canal en vivo (§7.6). */
  L2_CLAVE_CIFRADO: z.base64().refine((v) => Buffer.from(v, "base64").length === 32, "32 bytes en base64"),
  /**
   * La dirección con la que se abre el sistema en el navegador, como `https://l2.ejemplo.com`
   * (ADR-020). Las llaves de acceso quedan atadas a su dominio —cambiarla las deja sin valer— y
   * los enlaces de alta se componen con ella. WebAuthn exige HTTPS fuera de `localhost`.
   */
  L2_URL_PUBLICA: z.url({ protocol: /^https?$/ }).refine((v) => new URL(v).pathname === "/" && !new URL(v).search, "solo el origen, sin ruta"),
  /**
   * A dónde se conectan los navegadores para el canal en vivo (`apps/worker`, B5-1). Vacío = la
   * misma máquina que sirve la página, en `L2_TIEMPO_REAL_PUERTO`; en producción, la dirección
   * pública, que el proxy lleva al worker. La consulta al BCV ya no la hace este proceso: la hace
   * el worker (B5-1).
   */
  L2_TIEMPO_REAL_URL: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).default(""),
  L2_TIEMPO_REAL_PUERTO: z.coerce.number().int().min(1).max(65535).default(3001),
  /**
   * El agente de impresión empaquetado (`pnpm agente:empaquetar`, ADR-026), que Ajustes → Impresoras
   * deja descargar. Vacío = el que deja el empaquetado en `apps/printer-agent/dist`.
   */
  L2_AGENTE_EXE: z.string().default(""),
  /**
   * Dónde deja `infra/produccion/respaldar.sh` los respaldos cifrados para la PC del local (B7-4, M-26). Vacía =
   * este servidor no sirve respaldos: las rutas `/respaldos/*` responden que no hay (fail-closed).
   */
  L2_RESPALDOS_DIR: z.string().default(""),
});

export type EntornoWeb = z.infer<typeof EsquemaEntorno>;

let validado: EntornoWeb | undefined;

/** El entorno validado. La primera llamada valida; si algo falla, lanza `EntornoInvalido`. */
export function entorno(): EntornoWeb {
  if (validado) return validado;
  const e = leerEntorno(EsquemaEntorno);
  // Una llave de acceso solo funciona en un contexto seguro: fuera de desarrollo, sin HTTPS no hay
  // forma de confirmar identidad, y es mejor no arrancar que descubrirlo al instalar.
  if (e.L2_ENTORNO !== "desarrollo" && !e.L2_URL_PUBLICA.startsWith("https://")) {
    throw new Error("L2_URL_PUBLICA debe ser https:// fuera de desarrollo: las llaves de acceso lo exigen (ADR-020).");
  }
  return (validado = e);
}
