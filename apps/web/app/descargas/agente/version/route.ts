import { VersionDelAgenteSchema } from "@l2/contracts";
import { agenteDeLaPeticion, ejecutableDelAgente } from "../../../../src/features/impresion/impresion.servidor";

/**
 * Para el agente de impresión instalado (T-8c, ADR-028 punto 5): qué versión publica este servidor, con su huella
 * SHA-256, y si administración pidió «Actualizar ahora» para él. Con su credencial (`Authorization: Bearer`): sin
 * sesión, porque es el programa de la laptop de caja, no una persona.
 */
export async function GET(peticion: Request): Promise<Response> {
  const a = await agenteDeLaPeticion(peticion);
  if (a instanceof Response) return a;
  const d = await ejecutableDelAgente();
  if (!d || !d.sha256) return new Response("El agente no está empaquetado en este servidor.", { status: 404 });
  const v = VersionDelAgenteSchema.safeParse({ version: d.version, sha256: d.sha256, pedida: a.pedida });
  // Una versión que no es «X.Y.Z» (sin empaquetar con su número) no se ofrece: fail-closed.
  if (!v.success) return new Response("La versión empaquetada no es válida.", { status: 404 });
  return Response.json(v.data, { headers: { "cache-control": "no-store" } });
}
