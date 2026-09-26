import "server-only";
import { z } from "zod";
import { leerEntorno, nivelLog, urlPostgres } from "@l2/observability";

/**
 * El entorno del servidor web — B0-3 enganchado en B0-5. Se valida al arrancar
 * (`instrumentation.ts`): si falta algo, el servidor no arranca (§10.3).
 *
 * Dos modos:
 *   demo      datos de ejemplo de `src/demo`, sin base. Es lo que se enseña al cliente.
 *   servidor  PostgreSQL de verdad; exige la URL, el entorno y el local.
 *
 * Sin `L2_FUENTE_DE_DATOS`, en desarrollo se asume demo (así `pnpm dev` sigue funcionando
 * sin Docker); en producción NO hay valor por defecto y el servidor se niega a arrancar.
 */
const Demo = z.object({ L2_FUENTE_DE_DATOS: z.literal("demo") });

const Servidor = z.object({
  L2_FUENTE_DE_DATOS: z.literal("servidor"),
  L2_ENTORNO: z.enum(["desarrollo", "staging", "produccion"]),
  L2_DB_APP_URL: urlPostgres,
  L2_LOG_LEVEL: nivelLog,
  L2_TENANT_ID: z.uuid(),
  L2_BRANCH_ID: z.uuid(),
});

const EsquemaEntorno = z.discriminatedUnion("L2_FUENTE_DE_DATOS", [Demo, Servidor]);

export type EntornoWeb = z.infer<typeof EsquemaEntorno>;
export type EntornoServidor = z.infer<typeof Servidor>;
export type FuenteDeDatos = EntornoWeb["L2_FUENTE_DE_DATOS"];

let validado: EntornoWeb | undefined;

/** El entorno validado. La primera llamada valida; si algo falla, lanza `EntornoInvalido`. */
export function entorno(): EntornoWeb {
  if (!validado) {
    const fuente: Record<string, string | undefined> = { ...process.env };
    if (fuente.L2_FUENTE_DE_DATOS === undefined && process.env.NODE_ENV !== "production") {
      fuente.L2_FUENTE_DE_DATOS = "demo";
    }
    validado = leerEntorno(EsquemaEntorno, fuente);
  }
  return validado;
}
