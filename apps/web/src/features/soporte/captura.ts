"use client";

import { toJpeg } from "html-to-image";
import { CAPTURA_MAX_BYTES, type CapturaDto } from "@l2/contracts";

/**
 * La captura de la pantalla para un reporte (T-11, M-27, P-4): lo que se ve ahora, en JPEG.
 *
 * Nunca datos de cobro ni PIN (PLAN §7.6): se dejan fuera los campos de contraseña y de PIN y todo lo marcado con
 * `data-privado` (las referencias de un pago y sus datos). La toma el navegador dibujando la página: no pide permiso
 * para grabar la pantalla ni sale nada de él hasta que la persona envía el reporte. Si no se puede (un navegador sin
 * soporte), el reporte va sin captura y se dice.
 */

/** Lo que nunca sale en una captura. */
function esPrivado(nodo: HTMLElement): boolean {
  if (nodo.dataset?.privado !== undefined) return true;
  if (nodo instanceof HTMLInputElement && (nodo.type === "password" || nodo.autocomplete === "one-time-code")) return true;
  return false;
}

/** El base64 que cabe en el reporte: el JPEG ocupa 4/3 en base64. */
const MAX_BASE64 = Math.floor((CAPTURA_MAX_BYTES * 4) / 3);

export async function capturarPantalla(): Promise<CapturaDto | null> {
  if (typeof document === "undefined") return null;
  const fondo = getComputedStyle(document.body).backgroundColor;
  // Primero con buena calidad; si no cabe, más pequeña. Una pantalla de 1366×768 cabe a la primera.
  for (const [calidad, escala] of [
    [0.72, 1],
    [0.55, 0.75],
    [0.45, 0.5],
  ] as const) {
    try {
      const url = await toJpeg(document.body, {
        quality: calidad,
        pixelRatio: escala,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: fondo,
        filter: (nodo) => !(nodo instanceof HTMLElement && esPrivado(nodo)),
      });
      const base64 = url.slice(url.indexOf(",") + 1);
      if (base64.length <= MAX_BASE64) return { tipo: "image/jpeg", base64 };
    } catch {
      return null;
    }
  }
  return null;
}
