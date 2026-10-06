import { WebAuthnError, browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { Desafio, OpcionesDeFirma, OpcionesDeRegistro } from "@l2/application";
import type { Resultado } from "@l2/contracts";

/**
 * El puente con la llave de acceso del navegador (ADR-020): Windows Hello, el bloqueo del
 * teléfono o una llave física. Aquí no se decide nada: se le pasa al navegador el desafío que
 * emitió el servidor y se devuelve su respuesta, que el servidor comprueba entera. Lo único que
 * esta capa añade es decir en claro por qué no hubo respuesta.
 */

export type RespuestaDeLlave =
  | Readonly<{ ok: true; desafioId: string; respuesta: Record<string, unknown> }>
  | Readonly<{ ok: false; mensaje: string }>;

const SIN_SOPORTE = "Este navegador no admite llaves de acceso. Usa uno actualizado (Chrome, Edge o Safari).";

function porQueNo(e: unknown, registro: boolean): string {
  if (e instanceof WebAuthnError && e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "Esa llave de acceso ya está registrada. Usa otra.";
  }
  const nombre = e instanceof Error ? e.name : "";
  if (nombre === "NotAllowedError" || nombre === "AbortError") {
    return registro
      ? "No se registró la llave: se canceló o se agotó el tiempo. Inténtalo otra vez."
      : "No se usó la llave: se canceló o se agotó el tiempo. Inténtalo otra vez.";
  }
  if (nombre === "SecurityError") {
    return "La llave de acceso no vale desde esta dirección. Abre el sistema con su dirección de siempre.";
  }
  if (nombre === "InvalidStateError") {
    return registro ? "Este equipo ya tiene una llave de acceso para esta persona. Usa otra o entra con la que tienes." : "Esa llave de acceso no sirve aquí. Usa otra.";
  }
  // Windows sin Hello (sin PIN, huella ni cara), o un autenticador que no guarda llaves en sí mismo.
  if (nombre === "NotSupportedError" || nombre === "ConstraintError") {
    return "Este equipo no puede guardar una llave de acceso. En Windows, configura un PIN en Configuración → Cuentas → Opciones de inicio de sesión, o elige «Usar un teléfono» y créala en el teléfono.";
  }
  // Un error oculto es un antipatrón (CLAUDE.md): lo que no se reconoce se dice con su nombre.
  const motivo = nombre ? ` (${nombre})` : "";
  return registro ? `No se pudo registrar la llave de acceso en este equipo${motivo}.` : `No se pudo usar la llave de acceso en este equipo${motivo}.`;
}

/** ¿Este navegador puede usar llaves de acceso? Solo tiene sentido preguntarlo en el cliente. */
export function admiteLlaves(): boolean {
  return browserSupportsWebAuthn();
}

/** Pide al navegador que firme el desafío con una llave ya registrada. */
export async function firmarConLlave(pedir: () => Promise<Resultado<Desafio<OpcionesDeFirma>>>): Promise<RespuestaDeLlave> {
  if (!browserSupportsWebAuthn()) return { ok: false, mensaje: SIN_SOPORTE };
  const d = await pedir().catch(() => null);
  if (!d) return { ok: false, mensaje: "El servidor no respondió. Inténtalo de nuevo." };
  if (!d.ok) return { ok: false, mensaje: d.mensaje };
  try {
    const respuesta = await startAuthentication({ optionsJSON: d.valor.opciones });
    return { ok: true, desafioId: d.valor.desafioId, respuesta: respuesta as unknown as Record<string, unknown> };
  } catch (e) {
    return { ok: false, mensaje: porQueNo(e, false) };
  }
}

/** Pide al navegador que cree una llave nueva para el desafío de registro que ya emitió el servidor. */
export async function registrarLlave(desafio: Desafio<OpcionesDeRegistro>): Promise<RespuestaDeLlave> {
  if (!browserSupportsWebAuthn()) return { ok: false, mensaje: SIN_SOPORTE };
  try {
    const respuesta = await startRegistration({ optionsJSON: desafio.opciones });
    return { ok: true, desafioId: desafio.desafioId, respuesta: respuesta as unknown as Record<string, unknown> };
  } catch (e) {
    return { ok: false, mensaje: porQueNo(e, true) };
  }
}

/** Un nombre razonable para la llave que se registra desde este equipo: «Windows», «Android»… */
export function etiquetaSugerida(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Teléfono Android";
  if (/iPhone|iPad/i.test(ua)) return "iPhone o iPad";
  if (/Windows/i.test(ua)) return "Windows de este equipo";
  if (/Mac OS X/i.test(ua)) return "Mac de este equipo";
  return "Este equipo";
}
