import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ArchivoDeRespaldoSchema } from "@l2/contracts";
import { aplicacion } from "../../../../src/servidor/aplicacion";
import { pcDeRespaldos } from "../../../../src/features/sistema/respaldos.servidor";

/**
 * Para la PC del local (B7-4, M-26): un respaldo cifrado. Solo uno que la base conoce y que sigue en el
 * servidor, por su nombre exacto (nada de rutas: el nombre pasa por su contrato). Viaja con su huella en
 * `x-sha256`; la PC la comprueba antes de darlo por bajado.
 */
export async function GET(peticion: Request, { params }: { params: Promise<{ archivo: string }> }): Promise<Response> {
  const p = await pcDeRespaldos(peticion);
  if (p instanceof Response) return p;
  const nombre = ArchivoDeRespaldoSchema.safeParse((await params).archivo);
  if (!nombre.success) return new Response("No es un respaldo.", { status: 400 });
  const copia = await (await aplicacion()).respaldos.copia(p.pc, nombre.data);
  const ruta = join(/*turbopackIgnore: true*/ p.dir, nombre.data);
  if (!copia || !existsSync(/*turbopackIgnore: true*/ ruta)) return new Response("Ese respaldo ya no está en el servidor.", { status: 404 });
  // El tamaño del disco tiene que ser el de la base: un archivo a medias no se sirve.
  if (statSync(/*turbopackIgnore: true*/ ruta).size !== copia.bytes) return new Response("Ese respaldo no está completo en el servidor.", { status: 409 });
  return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ ruta)) as ReadableStream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${copia.archivo}"`,
      "content-length": String(copia.bytes),
      "cache-control": "no-store",
      "x-sha256": copia.sha256,
    },
  });
}
