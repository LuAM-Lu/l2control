import "server-only";
import { entorno } from "./entorno";
import { aplicacion, log } from "./aplicacion";

/**
 * Lo que el servidor comprueba antes de atender la primera petición (desde
 * `instrumentation.ts`). Si algo falla, lanza y el servidor no arranca: mejor que arrancar a
 * medias y fallar en mitad de un cobro (fail-closed, §10.3).
 */
export async function arrancar(): Promise<void> {
  const e = entorno(); // valida; lanza EntornoInvalido con todos los problemas
  if (e.L2_FUENTE_DE_DATOS === "demo") {
    log().info({ fuente: "demo" }, "servidor web con datos de ejemplo");
    return;
  }
  // Abre la base y comprueba que el usuario no se salte la RLS.
  await aplicacion();
  log().info(
    { fuente: "servidor", entorno: e.L2_ENTORNO, tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID },
    "servidor web conectado a la base",
  );
}
