"use client";

import { useEffect, useRef } from "react";

/**
 * Atajos de teclado para el equipo del mostrador — UX-MEJORAS §9, C5.
 *
 * TRES REGLAS QUE LOS HACEN SEGUROS
 *
 * 1. **Nunca mientras se escribe.** Si el foco está en un campo de texto, una
 *    lista desplegable o hay un diálogo abierto, las teclas son de ese campo.
 * 2. **El lector de pulseras no es una persona.** El lector «teclea» el código
 *    y pulsa Enter en ráfaga (menos de 45 ms entre teclas). Cada tecla espera
 *    60 ms antes de ejecutarse; si llega otra en ráfaga, se descartan todas.
 *    Así «AK-0142⏎» nunca elige un medio con la «A» ni añade un pago con el
 *    Enter. 60 ms no se notan al teclear.
 * 3. **Nada irreversible con una sola tecla.** Cerrar el cobro pide Ctrl+Enter.
 *
 * Solo sirve en equipos con teclado: en la tablet no hay teclas que pulsar, y
 * las pistas en pantalla se ocultan donde no hay puntero fino.
 */

const RAFAGA_MS = 45;
const ESPERA_MS = 60;

export type Tecla = Readonly<{ key: string; ctrl: boolean; alt: boolean; shift: boolean }>;

/** Devuelve `true` si el atajo existe y se ejecutó. */
export type Manejador = (t: Tecla) => boolean;

function estaEscribiendo(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
  return document.querySelector("dialog[open]") !== null;
}

/** Teclas que, si son atajo, no deben hacer además lo que hace el navegador. */
const PROPIAS = new Set(["/", "?", "Enter", "Backspace", "ArrowUp", "ArrowDown", "+"]);

/**
 * Eventos cuyo `preventDefault` hizo este mismo módulo. Hay varios oyentes a la
 * vez (la cola y el cobro): el primero no puede dejar al segundo sin la tecla.
 * Solo se ignora lo que canceló OTRO (un formulario, el lector de pulseras).
 */
const CANCELADOS_AQUI = new WeakSet<Event>();

export function useAtajos(manejador: Manejador, activo = true) {
  const ref = useRef(manejador);
  useEffect(() => {
    ref.current = manejador;
  });

  useEffect(() => {
    if (!activo) return;
    let cola: Tecla[] = [];
    let ultima = 0;
    let rafaga = false;
    let temporizador: number | null = null;

    const vaciar = () => {
      temporizador = null;
      const teclas = cola;
      const eraRafaga = rafaga;
      cola = [];
      rafaga = false;
      if (eraRafaga) return; // era el lector: no es asunto de los atajos
      for (const t of teclas) ref.current(t);
    };

    const alTeclear = (e: KeyboardEvent) => {
      if (e.repeat || (e.defaultPrevented && !CANCELADOS_AQUI.has(e)) || estaEscribiendo(e) || e.metaKey) return;
      const ahora = performance.now();
      if (cola.length > 0 && ahora - ultima < RAFAGA_MS) rafaga = true;
      ultima = ahora;

      const t: Tecla = { key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey };
      const imprimible = e.key.length === 1;
      if (!imprimible && !PROPIAS.has(e.key)) return;
      // Enter o espacio sobre un botón al que se llegó con Tab lo pulsan a él:
      // es lo que espera quien navega con teclado. Si el foco quedó ahí por un
      // clic (sin `:focus-visible`), Enter sigue siendo «añadir el pago»: si no,
      // tocar «Efectivo $», teclear 20 y pulsar Enter volvería a elegir el medio.
      const destino = e.target as HTMLElement | null;
      if ((e.key === "Enter" || e.key === " ") && !e.ctrlKey && destino?.closest?.("button, a, [role=button]")?.matches(":focus-visible")) {
        return;
      }
      // Ctrl/Alt con letras son del navegador (copiar, pestañas…), salvo Ctrl+Enter.
      if ((e.ctrlKey || e.altKey) && !(e.ctrlKey && e.key === "Enter")) return;
      if (PROPIAS.has(e.key)) {
        e.preventDefault();
        CANCELADOS_AQUI.add(e);
      }

      cola.push(t);
      if (temporizador !== null) window.clearTimeout(temporizador);
      temporizador = window.setTimeout(vaciar, ESPERA_MS);
    };

    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      if (temporizador !== null) window.clearTimeout(temporizador);
    };
  }, [activo]);
}

/** Letra de cada medio de pago: la inicial de lo que se dice en voz alta. */
export const TECLA_MEDIO: Readonly<Record<string, string>> = {
  EFECTIVO_USD: "E",
  EFECTIVO_VES: "B",
  PAGO_MOVIL: "P",
  PDV_DEBITO: "T",
  ZELLE: "Z",
  USDT: "U",
};

export const LISTA_ATAJOS: readonly { teclas: string; que: string }[] = [
  { teclas: "0 – 9", que: "Teclear el monto recibido" },
  { teclas: "⌫", que: "Borrar el último dígito" },
  { teclas: "Enter", que: "Añadir el pago tecleado" },
  { teclas: "+", que: "Cobrar exacto con el medio elegido" },
  { teclas: "Ctrl + Enter", que: "Cerrar el cobro (solo si está cubierto)" },
  { teclas: "E · B · P · T · Z · U", que: "Efectivo $ · Efectivo Bs · Pago Móvil · Tarjeta (punto) · Zelle · USDT" },
  { teclas: "↑ ↓", que: "Cuenta anterior o siguiente de la cola" },
  { teclas: "/", que: "Buscar en la cola" },
  { teclas: "N", que: "Nueva venta directa" },
  { teclas: "I", que: "Identificar al cliente de la factura" },
  { teclas: "R", que: "Ver el recibo del último cobro" },
  { teclas: "?", que: "Ver estos atajos" },
];
