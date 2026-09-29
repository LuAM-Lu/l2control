import "server-only";
import { entorno } from "./entorno";
import { aplicacion, log } from "./aplicacion";
import { VERSION } from "../features/shell/version";

/**
 * Lo que el servidor comprueba antes de atender la primera petición (desde
 * `instrumentation.ts`). Si algo falla, lanza y el servidor no arranca: mejor que arrancar a
 * medias y fallar en mitad de un cobro (fail-closed, §10.3).
 */
export async function arrancar(): Promise<void> {
  const e = entorno(); // valida; lanza EntornoInvalido con todos los problemas
  // Abre la base y comprueba que el usuario no se salte la RLS.
  await aplicacion();
  log().info(
    {
      version: VERSION.numero || null,
      etapa: VERSION.etapa || null,
      entorno: e.L2_ENTORNO,
      tenantId: e.L2_TENANT_ID,
      branchId: e.L2_BRANCH_ID,
    },
    "servidor web conectado a la base",
  );
  // La consulta automática al BCV vive en el worker desde B5-1 (ADR-025): este proceso solo sirve páginas.
}
