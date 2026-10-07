"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@l2/ui";
import { alCambiarLaVersion, compararConElServidor, versionNueva } from "./puesta-al-dia.ts";

/**
 * Cada pantalla se pone al día sola con la versión del servidor (T-8b, ADR-028). Tras poner una versión,
 * el navegador sigue con el código de la anterior hasta que recarga, y sus acciones ya no casan con las
 * del servidor nuevo. Así que cada pantalla compara su versión (la que se compiló con ella) con la que
 * dice `/salud`, y si son distintas recarga **cuando está libre**: sin un diálogo abierto, sin un campo
 * con el cursor, sin un borrador sin enviar y sin tocarla en un rato. Si no está libre, lo dice abajo y
 * espera; quien la usa puede ponerla al día con un toque.
 *
 * Cuándo pregunta, sin sondeos: al volver el canal en vivo (lo pregunta el canal: una versión nueva
 * reinicia el worker), al volver a la pestaña y al primer toque, como mucho una vez por minuto. Las
 * pantallas sin sesión (el acceso) no tienen canal: les bastan los toques y la pestaña.
 */

/** Como mucho una pregunta por minuto por toques y pestaña. */
const PREGUNTAR_CADA_MS = 60_000;
/** Si `/salud` no contesta (el servidor se está poniendo), se vuelve a preguntar en un rato. */
const REINTENTO_MS = 15_000;
const REINTENTOS = 8;
/** Sin tocarla este rato, la pantalla está libre. */
const QUIETA_MS = 15_000;
/** Mientras espera a estar libre, cada cuánto lo mira. */
const MIRAR_MS = 3_000;

/** Los borradores sin enviar que hay ahora en la pantalla (`useSinGuardar`). */
let sinGuardar = 0;

/**
 * Lo que no está en el servidor todavía (el pedido que el mesero no envió, el plano sin publicar): mientras
 * `hay`, la pantalla no se recarga sola. Lo que vive en un diálogo no lo necesita: un diálogo abierto ya
 * cuenta como ocupada.
 */
export function useSinGuardar(hay: boolean): void {
  useEffect(() => {
    if (!hay) return;
    sinGuardar += 1;
    return () => {
      sinGuardar -= 1;
    };
  }, [hay]);
}

function libre(ultimoToque: number): boolean {
  if (sinGuardar > 0) return false;
  if (document.querySelector("dialog[open]")) return false;
  const foco = document.activeElement;
  if (foco instanceof HTMLElement && (foco.isContentEditable || foco.matches("input, textarea, select"))) return false;
  return document.visibilityState === "hidden" || Date.now() - ultimoToque >= QUIETA_MS;
}

export function PuestaAlDia() {
  const [nueva, setNueva] = useState<string | null>(versionNueva);
  // Solo se avisa si no se pudo recargar enseguida: si la pantalla está libre, recarga sin más.
  const [esperando, setEsperando] = useState(false);
  const ultimoToque = useRef(0);

  useEffect(() => alCambiarLaVersion(setNueva), []);

  // Cuándo preguntar, además del canal.
  useEffect(() => {
    let preguntada = 0;
    let reintento: number | undefined;
    let intentos = 0;

    async function preguntar(ya: boolean) {
      const ahora = Date.now();
      if (!ya && ahora - preguntada < PREGUNTAR_CADA_MS) return;
      preguntada = ahora;
      window.clearTimeout(reintento);
      if ((await compararConElServidor()) === "sin-respuesta") {
        // El servidor se está poniendo, o la red del local cayó: se pregunta otra vez en un rato.
        if (intentos++ < REINTENTOS) reintento = window.setTimeout(() => void preguntar(true), REINTENTO_MS);
      } else intentos = 0;
    }

    const alVolver = () => {
      if (document.visibilityState === "visible") void preguntar(false);
    };
    const alTocar = () => {
      ultimoToque.current = Date.now();
      void preguntar(false);
    };
    const alTeclear = () => {
      ultimoToque.current = Date.now();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("pointerdown", alTocar, { passive: true });
    window.addEventListener("keydown", alTeclear, { passive: true });
    return () => {
      window.clearTimeout(reintento);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("pointerdown", alTocar);
      window.removeEventListener("keydown", alTeclear);
    };
  }, []);

  // Con otra versión en el servidor, se recarga en cuanto la pantalla está libre.
  useEffect(() => {
    if (!nueva) return;
    const mirar = () => {
      if (libre(ultimoToque.current)) window.location.reload();
      else setEsperando(true);
    };
    mirar();
    const t = window.setInterval(mirar, MIRAR_MS);
    return () => window.clearInterval(t);
  }, [nueva]);

  if (!nueva || !esperando) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-3 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface py-2 pr-2 pl-4 text-[13px] text-ink shadow-card print:hidden"
    >
      <RefreshCw size={15} className="shrink-0 text-brand" aria-hidden="true" />
      <span className="min-w-0">
        Hay una versión nueva (v{nueva}). Esta pantalla se pone al día sola al terminar lo que estás haciendo.
      </span>
      <Button type="button" variant="neutral" surface="admin" className="shrink-0" onClick={() => window.location.reload()}>
        Poner al día
      </Button>
    </div>
  );
}
