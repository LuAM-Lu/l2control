"use client";

import { useSyncExternalStore } from "react";

/**
 * El sonido de los avisos de pulseras por vencer (B4-15), por equipo: si suena y hasta cuándo está callado. Es una
 * preferencia del equipo, no un dato del negocio: vive en su navegador y, si no se puede leer, suena (que no avisar
 * por un almacenamiento bloqueado sería peor).
 */

const CLAVE_SONIDO = "l2_avisos_sonido";
const CLAVE_SILENCIO = "l2_avisos_silencio_hasta";
const EVENTO = "l2-avisos-sonido";

/** Cuánto se calla un equipo con «Silenciar». */
export const SILENCIO_MS = 15 * 60_000;

function leer(clave: string): string | null {
  try {
    // lint-permitido: sin-simulacion — preferencia del equipo (sonido de los avisos), no un dato del negocio
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string | null) {
  try {
    // lint-permitido: sin-simulacion — preferencia del equipo (sonido de los avisos), no un dato del negocio
    if (valor === null) window.localStorage.removeItem(clave);
    // lint-permitido: sin-simulacion — preferencia del equipo (sonido de los avisos), no un dato del negocio
    else window.localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento, la preferencia dura lo que la pantalla.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** Si este equipo hace sonar los avisos (de fábrica, sí). */
export function useSonidoDeAvisos(): [boolean, (v: boolean) => void] {
  const valor = useSyncExternalStore(
    suscribir,
    () => leer(CLAVE_SONIDO) !== "no",
    () => true,
  );
  return [valor, (v) => escribir(CLAVE_SONIDO, v ? null : "no")];
}

/** Hasta cuándo está callado (ms), o 0. */
export function useSilencioHasta(): [number, (hasta: number) => void] {
  const valor = useSyncExternalStore(
    suscribir,
    () => Number(leer(CLAVE_SILENCIO) ?? 0) || 0,
    () => 0,
  );
  return [valor, (hasta) => escribir(CLAVE_SILENCIO, hasta > 0 ? String(hasta) : null)];
}

let contexto: AudioContext | null = null;

/**
 * El navegador solo deja sonar después de un toque: se prepara con el primero y queda listo, aunque luego el equipo se
 * bloquee.
 */
export function prepararSonido() {
  if (typeof window === "undefined") return;
  const preparar = () => {
    try {
      contexto ??= new AudioContext();
      void contexto.resume();
    } catch {
      contexto = null;
    }
  };
  window.addEventListener("pointerdown", preparar, { passive: true });
  window.addEventListener("keydown", preparar);
  return () => {
    window.removeEventListener("pointerdown", preparar);
    window.removeEventListener("keydown", preparar);
  };
}

/** Dos tonos cortos (y uno más grave y largo cuando se cumple el tiempo), y vibra en Android. */
export function sonar(urgente: boolean) {
  try {
    navigator.vibrate?.(urgente ? [300, 120, 300, 120, 300] : [200, 100, 200]);
  } catch {
    // Un navegador sin vibración no avisa menos: suena y se ve.
  }
  if (!contexto) return;
  const tonos = urgente ? [660, 520, 660] : [880, 1100];
  tonos.forEach((hz, i) => {
    const t = contexto!.currentTime + i * 0.22;
    const osc = contexto!.createOscillator();
    const vol = contexto!.createGain();
    osc.frequency.value = hz;
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(vol).connect(contexto!.destination);
    osc.start(t);
    osc.stop(t + 0.21);
  });
}
