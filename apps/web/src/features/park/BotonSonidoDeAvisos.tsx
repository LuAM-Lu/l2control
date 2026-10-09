"use client";

import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@l2/ui";
import { useSilencioHasta, useSonidoDeAvisos } from "./sonidoDeAvisos.ts";

/**
 * El ajuste del equipo para el sonido de los avisos de pulseras por vencer (B4-15): suena o no suena. Si está callado un
 * rato («Silenciar» en un aviso), lo dice y un toque lo vuelve a encender.
 */
export function BotonSonidoDeAvisos({ className }: { className?: string }) {
  const [sonido, setSonido] = useSonidoDeAvisos();
  const [silencioHasta, silenciar] = useSilencioHasta();
  const callado = !sonido || Date.now() < silencioHasta;
  const etiqueta = !sonido
    ? "Los avisos de pulseras no suenan en este equipo: activar el sonido"
    : callado
      ? "Avisos de pulseras silenciados un rato: volver a activar el sonido"
      : "Los avisos de pulseras suenan en este equipo: quitar el sonido";
  return (
    <button
      type="button"
      aria-pressed={!callado}
      aria-label={etiqueta}
      title={etiqueta}
      onClick={() => {
        if (callado) {
          setSonido(true);
          silenciar(0);
        } else setSonido(false);
      }}
      className={cn(
        "grid size-12 shrink-0 place-content-center rounded-[0.45rem] transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        callado ? "text-state-warn" : "text-ink-3 hover:text-ink",
        className,
      )}
    >
      {callado ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
    </button>
  );
}
