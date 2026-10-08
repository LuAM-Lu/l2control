import { aplicacion } from "../../../src/servidor/aplicacion";
import { pcDeRespaldos } from "../../../src/features/sistema/respaldos.servidor";

/**
 * Para la PC del local (B7-4, M-26): los respaldos que siguen en el servidor, con su tamaño y su huella. La
 * PC baja los que no tiene y confirma cada uno en `/respaldos/acuse`.
 */
export async function GET(peticion: Request): Promise<Response> {
  const p = await pcDeRespaldos(peticion);
  if (p instanceof Response) return p;
  const r = await (await aplicacion()).respaldos.indice(p.pc);
  // Con su juego de caracteres: PowerShell 5.1 lee como Latin-1 un JSON que no lo dice, y un fijado lleva acentos (B7-6).
  return Response.json(r, { headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" } });
}
