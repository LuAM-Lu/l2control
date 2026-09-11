"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4). Capas que se abren sobre la pantalla.
 *
 * Dos formas, cada una con su trabajo, siguiendo a NN/g, Material 3 y Apple:
 *
 *  · **`Sheet`** — hoja para una tarea acotada que acompaña al contexto: la
 *    ficha de un niño, el alta de un representante. En tablet y escritorio
 *    entra por el lado derecho; en móvil sube desde abajo, donde llega el
 *    pulgar.
 *  · **`Dialog`** — decisión corta que hay que terminar antes de seguir:
 *    confirmar un corte Z, el resultado de un cobro.
 *
 * Y una que NO es: ninguna de las dos sirve para la navegación principal. Un
 * flujo que vive dentro de modales rompe el camino del usuario y el botón de
 * volver (HIG). Entrada, salida y caja son pantallas; esto es lo que se abre
 * encima de ellas.
 *
 * POR QUÉ `<dialog>` NATIVO
 * Trae de fábrica lo que las librerías reimplementan: el foco queda atrapado
 * dentro, Escape cierra, el resto de la página queda inerte y la capa vive por
 * encima de todo sin pelear con `z-index`. Menos código, menos fallos.
 *
 * El pie queda fijo aunque el cuerpo se desplace: la acción principal nunca se
 * esconde bajo el pliegue, que es justo lo que este patrón existe para evitar.
 */

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  /** Acciones al pie, siempre visibles. */
  pie?: ReactNode;
  className?: string;
};

export function Sheet(props: Props) {
  return <Capa variante="hoja" {...props} />;
}

export function Dialog(props: Props) {
  return <Capa variante="dialogo" {...props} />;
}

function Capa({
  variante,
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  pie,
  className,
}: Props & { variante: "hoja" | "dialogo" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const descripcionId = useId();

  // El estado manda y el elemento lo sigue. No se escucha el fin de ninguna
  // animación para decidir si está abierto: una transición cancelada dejaría
  // la capa a medias (regla de las transiciones interrumpibles).
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    else if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={tituloId}
      aria-describedby={descripcion ? descripcionId : undefined}
      // Escape: se avisa al dueño del estado en lugar de cerrar por detrás de
      // React, que quedaría creyendo que sigue abierta.
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      // Tocar el velo cierra. El panel ocupa todo el elemento, así que un
      // toque dentro nunca tiene como destino el propio `<dialog>`.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className={cn(
        "m-0 max-h-none max-w-none border-0 bg-transparent p-0 text-ink",
        "backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
        variante === "hoja"
          ? "fixed inset-x-0 top-auto bottom-0 w-full md:inset-x-auto md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[min(30rem,100vw)]"
          : "fixed inset-0 m-auto h-fit w-[min(30rem,calc(100vw-2rem))]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col border border-line bg-surface shadow-lift",
          variante === "hoja"
            ? "l2-hoja max-h-[88dvh] rounded-t-[var(--radius-card)] md:h-full md:max-h-none md:rounded-none md:rounded-l-[var(--radius-card)]"
            : "l2-dialogo max-h-[85dvh] rounded-[var(--radius-card)]",
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="font-display text-lg leading-tight font-bold text-ink">
              {titulo}
            </h2>
            {descripcion && (
              <p id={descripcionId} className="mt-1 text-[13px] text-ink-2">
                {descripcion}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className={cn(
              "grid size-11 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3",
              "transition-colors duration-[var(--dur-rapida)] hover:bg-surface-2 hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            )}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {pie && <footer className="border-t border-line bg-base/30 px-5 py-3.5">{pie}</footer>}
      </div>
    </dialog>
  );
}
