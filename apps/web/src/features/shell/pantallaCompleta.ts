/**
 * Pantalla completa en las estaciones de la app instalada — F1-21, PLAN-FRONTEND.
 *
 * Escrito por la obrera Gemini y revisado por la maestra (2026-09-16).
 *
 * Solo se pide con la app INSTALADA: en un navegador de escritorio, que una
 * página se ponga a pantalla completa al entrar es una sorpresa, no una ayuda.
 * Y solo desde un gesto (el clic de «Entrar» o el botón de la barra), porque la
 * Fullscreen API exige activación del usuario. Si el navegador lo niega, se
 * sigue sin pantalla completa: nunca se lanza un error por esto.
 */
import { SUPERFICIE_DE_RUTA } from "../identity/visibilidad.ts";

export function esAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
}

/**
 * Las estaciones son las rutas que tienen superficie. La lista vive en
 * `visibilidad.ts` y no se repite aquí: dos listas de lo mismo acaban
 * discrepando (N-02 de la auditoría de navegación).
 */
export function esRutaDeEstacion(ruta: string): boolean {
  return Object.hasOwn(SUPERFICIE_DE_RUTA, ruta);
}

export function pedirPantallaCompleta(): void {
  if (!esAppInstalada() || !document.fullscreenEnabled || document.fullscreenElement) return;

  document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {
    // Si el navegador lo niega (ej. falta interacción del usuario), se sigue sin pantalla completa.
  });
}

export function salirDePantallaCompleta(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}
