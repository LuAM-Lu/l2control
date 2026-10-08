import { aplicacion } from "../../../../src/servidor/aplicacion";
import { contextoActual } from "../../../../src/servidor/sesion";

/**
 * La captura de un reporte de problema (T-11). Solo con sesión, y solo para quien envió el reporte o atiende el
 * soporte (lo decide la aplicación). No se guarda en ninguna caché: es una foto de una pantalla del local.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await contextoActual();
  if (!ctx) return new Response("Entra por el acceso para ver la captura.", { status: 401 });
  const r = await (await aplicacion()).soporte.captura(ctx, (await params).id);
  if (!r.ok) return new Response(r.mensaje, { status: r.motivo === "NO_PERMITIDO" ? 403 : 404 });
  return new Response(Buffer.from(r.valor.bytes), {
    headers: {
      "content-type": r.valor.tipo,
      "content-length": String(r.valor.bytes.length),
      "content-disposition": "inline",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
