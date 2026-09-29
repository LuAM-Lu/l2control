/**
 * El entorno del worker (B5-1). Se valida al arrancar: si falta algo o algo no tiene la forma
 * esperada, el proceso NO arranca y dice qué, sin enseñar un solo valor (§10.3, B0-3).
 */
import { z } from "zod";
import { leerEntorno, nivelLog, urlPostgres, urlValkey } from "@l2/observability";

const EsquemaEntorno = z.object({
  L2_ENTORNO: z.enum(["desarrollo", "staging", "produccion"]),
  L2_DB_APP_URL: urlPostgres,
  L2_LOG_LEVEL: nivelLog,
  /** El local que sirve este worker: el mismo que el servidor web. */
  L2_TENANT_ID: z.uuid(),
  L2_BRANCH_ID: z.uuid(),
  /** De ella sale la clave que firma los tickets del canal (HKDF): la misma que la del servidor web. */
  L2_CLAVE_CIFRADO: z.base64().refine((v) => Buffer.from(v, "base64").length === 32, "32 bytes en base64"),
  /** Valkey: el adaptador de Socket.io (ADR-008) y el bus del restaurante. */
  L2_VALKEY_URL: urlValkey,
  /** Dónde escucha el canal en vivo. En producción, detrás del proxy, en la misma dirección que la web. */
  L2_TIEMPO_REAL_PUERTO: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Traer sola la tasa del BCV (F3-04, ADR-019). `no` sin salida a internet o en las pruebas. */
  L2_SINCRONIZAR_TASA: z.enum(["si", "no"]).default("si"),
});

export type EntornoWorker = z.infer<typeof EsquemaEntorno>;

export const entorno = (): EntornoWorker => leerEntorno(EsquemaEntorno);
