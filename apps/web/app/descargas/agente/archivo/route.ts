import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { agenteDeLaPeticion, ejecutableDelAgente } from "../../../../src/features/impresion/impresion.servidor";

/**
 * El ejecutable del agente, para el agente instalado que se actualiza solo (T-8c). Con su credencial, como
 * `/descargas/agente/version`. Su huella y su versión viajan en las cabeceras; el agente la comprueba igual contra la
 * que publicó la versión antes de instalar nada.
 */
export async function GET(peticion: Request): Promise<Response> {
  const a = await agenteDeLaPeticion(peticion);
  if (a instanceof Response) return a;
  const d = await ejecutableDelAgente();
  if (!d) return new Response("El agente no está empaquetado en este servidor.", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ d.exe)) as ReadableStream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(statSync(/*turbopackIgnore: true*/ d.exe).size),
      "cache-control": "no-store",
      "x-version": d.version,
      ...(d.sha256 ? { "x-sha256": d.sha256 } : {}),
    },
  });
}
