import { VERSION } from "./version.ts";

/**
 * La versión del servidor frente a la de esta pantalla (T-8b, ADR-028): la que se compiló con ella contra la
 * que dice `/salud`. La comparten `PuestaAlDia`, que recarga la pantalla cuando está libre, y el canal en
 * vivo, que con otra versión deja de repintar: Next, al ver una página de otra compilación, la recargaría de
 * golpe, sin esperar a que se envíe un borrador.
 */
export type Comparacion = "igual" | "otra" | "sin-respuesta";

let otra: string | null = null;
const oyentes = new Set<(version: string | null) => void>();

function cambiar(version: string | null) {
  if (version === otra) return;
  otra = version;
  for (const o of oyentes) o(version);
}

/** Pregunta al servidor su versión. Sin respuesta (se está poniendo, o la red cayó), no se sabe nada. */
export async function compararConElServidor(): Promise<Comparacion> {
  let version: string | null;
  try {
    const r = await fetch("/salud", { cache: "no-store" });
    if (!r.ok) return "sin-respuesta";
    const cuerpo = (await r.json()) as { version?: unknown };
    version = typeof cuerpo.version === "string" && cuerpo.version !== "" ? cuerpo.version : null;
  } catch {
    return "sin-respuesta";
  }
  // Fuera de un build no hay número con qué comparar: basta con que conteste.
  if (!VERSION.numero || version === null || version === VERSION.numero) {
    cambiar(null);
    return "igual";
  }
  cambiar(version);
  return "otra";
}

/** La versión del servidor si es otra que la de esta pantalla; `null` si es la misma o no se sabe. */
export function versionNueva(): string | null {
  return otra;
}

/** Avisa cuando el servidor pasa a tener otra versión (o vuelve a la de esta pantalla). */
export function alCambiarLaVersion(oyente: (version: string | null) => void): () => void {
  oyentes.add(oyente);
  return () => void oyentes.delete(oyente);
}
