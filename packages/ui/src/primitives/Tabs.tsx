"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";
import type { Surface } from "./Button";

/**
 * Nivel 1 — primitivo (§9.4). Pestañas.
 *
 * Existen para la divulgación progresiva de §8.8: contenido SECUNDARIO del
 * mismo objeto, a un toque, en lugar de apilado hacia abajo. El turno de caja
 * desbordaba 644 px porque ponía el arqueo, los puntos de cobro, los medios y
 * las excepciones uno debajo de otro; con pestañas, lo que se hace va al
 * frente y lo que se consulta, detrás.
 *
 * Lo que NO son: navegación entre pantallas. Eso es la barra de estación.
 *
 * Accesibles según el patrón de WAI-ARIA: flechas para moverse, Inicio y Fin
 * para los extremos, y solo la pestaña activa en el orden de tabulación. El
 * cambio de panel es un fundido, porque el contenido se sustituye en el mismo
 * sitio (Material: crossfade dentro del mismo contenedor).
 *
 * §8.4: cada pestaña mide lo que exige su superficie. Medían 44 px fijos, y
 * en el turno de caja —superficie POS, 56— quedaban por debajo (F-04 de la
 * auditoría del frontend).
 */
const ALTO: Record<Surface, string> = {
  kds: "min-h-16 text-base",
  pos: "min-h-14 text-[14px]",
  tablet: "min-h-12 text-[13.5px]",
  admin: "min-h-8 text-[13px]",
};

export type Pestana = {
  id: string;
  etiqueta: string;
  /** Cifra al lado de la etiqueta, ej. las excepciones del turno. */
  contador?: number;
  contenido: ReactNode;
};

export function Tabs({
  pestanas,
  activa,
  onCambiar,
  etiqueta,
  surface = "tablet",
  className,
}: {
  pestanas: readonly Pestana[];
  activa: string;
  onCambiar: (id: string) => void;
  /** Nombre accesible del grupo de pestañas. */
  etiqueta: string;
  /** Superficie donde se usa: decide el objetivo táctil (§8.4). */
  surface?: Surface;
  className?: string;
}) {
  const base = useId();
  const botones = useRef(new Map<string, HTMLButtonElement | null>());
  const indice = Math.max(
    0,
    pestanas.findIndex((p) => p.id === activa),
  );
  const actual = pestanas[indice];

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const n = pestanas.length;
    const destinoIndice =
      e.key === "ArrowRight"
        ? (indice + 1) % n
        : e.key === "ArrowLeft"
          ? (indice - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    const destino = destinoIndice >= 0 ? pestanas[destinoIndice] : undefined;
    if (!destino) return;
    e.preventDefault();
    onCambiar(destino.id);
    botones.current.get(destino.id)?.focus();
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        role="tablist"
        aria-label={etiqueta}
        onKeyDown={teclado}
        className="flex shrink-0 gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-surface/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pestanas.map((p) => {
          const seleccionada = p.id === actual?.id;
          return (
            <button
              key={p.id}
              ref={(el) => {
                botones.current.set(p.id, el);
              }}
              type="button"
              role="tab"
              id={`${base}-t-${p.id}`}
              aria-selected={seleccionada}
              aria-controls={`${base}-p-${p.id}`}
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => onCambiar(p.id)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-[0.4rem] px-4 whitespace-nowrap",
                ALTO[surface],
                "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                seleccionada
                  ? "bg-surface-2 font-semibold text-ink shadow-sm"
                  : "text-ink-2 hover:text-ink",
              )}
            >
              {p.etiqueta}
              {p.contador !== undefined && (
                <span className="tnum rounded-full bg-base px-1.5 text-[11px] font-medium text-ink-3">
                  {p.contador}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {actual && (
        <div
          key={actual.id}
          role="tabpanel"
          id={`${base}-p-${actual.id}`}
          aria-labelledby={`${base}-t-${actual.id}`}
          tabIndex={0}
          className="l2-pagina-lateral mt-3 min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {actual.contenido}
        </div>
      )}
    </div>
  );
}
