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
  await avisarSiFaltaInstalar();
  // La consulta automática al BCV vive en el worker desde B5-1 (ADR-025): este proceso solo sirve páginas.
}

/**
 * Con la base vacía (M-12), el servidor emite el código de instalación y lo escribe en su
 * registro: lo lee quien despliega y se lo da a quien instala (ADR-020, JORNADA §2 P1). Cada
 * arranque emite uno nuevo y el anterior deja de valer. Con el local ya instalado no hace nada.
 */
async function avisarSiFaltaInstalar(): Promise<void> {
  const e = entorno();
  const codigo = await (await aplicacion()).instalacion.emitirCodigo({ tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID }, Date.now());
  if (codigo === null) return;
  // Es el único secreto que se escribe en el registro, a propósito: de un solo uso, y deja de
  // valer al instalar o al reiniciar.
  log().warn(
    { codigoDeInstalacion: codigo, abrir: `${e.L2_URL_PUBLICA}/acceso` },
    "Este local está sin instalar. Abre el acceso, elige «Instalar L2 Control» y escribe este código",
  );
}
