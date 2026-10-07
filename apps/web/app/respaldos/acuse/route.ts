import { aplicacion } from "../../../src/servidor/aplicacion";
import { pcDeRespaldos } from "../../../src/features/sistema/respaldos.servidor";

/**
 * Para la PC del local (B7-4, M-26): «lo bajé y su huella coincide». Desde ese momento el respaldo cuenta
 * como copia fuera del servidor, y el panel lo dice.
 */
export async function POST(peticion: Request): Promise<Response> {
  const p = await pcDeRespaldos(peticion);
  if (p instanceof Response) return p;
  let cuerpo: unknown;
  try {
    cuerpo = await peticion.json();
  } catch {
    return new Response("El acuse va en JSON: archivo y sha256.", { status: 400 });
  }
  const r = await (await aplicacion()).respaldos.acusar(p.pc, cuerpo);
  if (!r.ok) return Response.json({ ok: false, mensaje: r.mensaje }, { status: r.motivo === "INVALIDO" ? 400 : 409 });
  return Response.json({ ok: true, yaEstaba: r.valor.yaEstaba });
}
