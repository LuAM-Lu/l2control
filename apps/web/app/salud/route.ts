import { aplicacion } from "../../src/servidor/aplicacion";
import { entorno } from "../../src/servidor/entorno";
import { VERSION } from "../../src/features/shell/version";

/**
 * La salud del servidor web (T-8a, ADR-028), como `/salud` del worker. La pregunta el despliegue tras
 * poner una versión nueva: si no responde 200 con la versión que se esperaba, vuelve a la anterior.
 * Sin sesión, porque la pregunta una máquina; por eso no dice nada del negocio: la versión y si la
 * base contesta.
 */
export async function GET(): Promise<Response> {
  const base = await (await aplicacion()).salud.comprobar(entorno().L2_TENANT_ID);
  return Response.json(
    { ok: base, version: VERSION.numero || null, base },
    { status: base ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
