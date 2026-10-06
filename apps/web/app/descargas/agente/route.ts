import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { aplicacion } from "../../../src/servidor/aplicacion";
import { entorno } from "../../../src/servidor/entorno";
import { contextoActual } from "../../../src/servidor/sesion";

/**
 * La descarga del agente de impresión para la laptop de caja (ADR-026). Solo con sesión de quien ve
 * las impresoras. El programa no lleva ninguna credencial: se vincula después con el código del panel.
 * Junto a él viaja su huella SHA-256 (cabecera `x-sha256`), la misma que enseña la pantalla.
 */
export async function GET(): Promise<Response> {
  const ctx = await contextoActual();
  if (!ctx) return new Response("Entra en el panel para descargarlo.", { status: 401 });
  const r = await (await aplicacion()).impresion.leer(ctx);
  if (!r.ok) return new Response(r.mensaje, { status: 403 });
  // La ruta la decide el entorno al arrancar: que `next build` no trace el proyecto entero buscándola.
  const exe = entorno().L2_AGENTE_EXE || resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "printer-agent", "dist", "l2-impresion.exe");
  if (!existsSync(/*turbopackIgnore: true*/ exe)) return new Response("El agente no está empaquetado en este servidor: pnpm agente:empaquetar.", { status: 404 });
  const huella = existsSync(/*turbopackIgnore: true*/ `${exe}.sha256`) ? readFileSync(/*turbopackIgnore: true*/ `${exe}.sha256`, "utf8").split(/\s+/)[0]! : "";
  return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ exe)) as ReadableStream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="l2-impresion.exe"',
      "content-length": String(statSync(/*turbopackIgnore: true*/ exe).size),
      "cache-control": "no-store",
      ...(huella ? { "x-sha256": huella } : {}),
    },
  });
}
