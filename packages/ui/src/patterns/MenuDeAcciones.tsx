"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "../cn";
import type { Surface } from "../primitives/Button";

/**
 * Nivel 2 — patrón (§9.4). «Más»: las acciones que no caben con su texto en una fila, en un menú (B3-29, M-40).
 *
 * Cada acción dice qué hace con su texto (no solo un icono): en la laptop de 1366 px los botones de la cabecera de una
 * cuenta no cabían y quedaban como iconos sueltos. Se abre con un toque, se cierra al elegir, al tocar fuera o con Esc; las
 * flechas recorren las acciones. Sin acciones, no se pinta. No sabe de qué son las acciones: las recibe.
 */
export type AccionDelMenu = Readonly<{
  id: string;
  texto: string;
  icono: ReactNode;
  onElegir: () => void;
  /** Lo que se hace con cuidado (dejar una deuda, anular): en rojo al pasar. */
  peligro?: boolean;
  /** La tecla que la hace, si la tiene. */
  tecla?: string;
}>;

const ALTO: Record<Surface, string> = { kds: "min-h-16", pos: "min-h-14", tablet: "min-h-12", admin: "min-h-8" };

export function MenuDeAcciones({
  acciones,
  etiqueta = "Más",
  surface = "pos",
  className,
  hacia = "abajo",
  aLoAncho = false,
  neutral = false,
}: {
  acciones: readonly AccionDelMenu[];
  etiqueta?: string;
  surface?: Surface;
  className?: string;
  /** Hacia dónde se abre: abajo (de fábrica) o arriba, si el botón va al pie de la pantalla. */
  hacia?: "abajo" | "arriba";
  /** El botón ocupa todo su sitio (en una fila de botones iguales). */
  aLoAncho?: boolean;
  /** Con el fondo de un botón `neutral`, en una fila de ellos. */
  neutral?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const id = useId();

  // Tocar fuera lo cierra; Esc también, y devuelve el foco al botón.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  if (acciones.length === 0) return null;
  const items = () => [...(caja.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
  return (
    <div
      ref={caja}
      className={cn("relative", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && abierto) {
          // Dentro de una capa (un `<dialog>`), Escape cierra solo el menú: sin `preventDefault`, el navegador cierra
          // también la capa.
          e.preventDefault();
          e.stopPropagation();
          setAbierto(false);
          caja.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();
        }
        if (!abierto || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
        e.preventDefault();
        const lista = items();
        const i = lista.indexOf(document.activeElement as HTMLButtonElement);
        const siguiente = e.key === "ArrowDown" ? (i + 1) % lista.length : (i - 1 + lista.length) % lista.length;
        lista[siguiente]?.focus();
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={`${id}-menu`}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          ALTO[surface],
          aLoAncho && "w-full justify-center",
          abierto
            ? "border-brand bg-brand/15 text-ink"
            : neutral
              ? "border-line bg-surface-2 text-ink hover:bg-line"
              : "border-line bg-base text-ink-2 hover:border-brand/50 hover:text-ink",
        )}
      >
        <MoreHorizontal className="size-(--icono-texto) shrink-0" aria-hidden="true" />
        {etiqueta}
        <ChevronDown className="size-(--icono-etiqueta) shrink-0 opacity-70" aria-hidden="true" />
      </button>
      {abierto && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label={etiqueta}
          className={cn(
            "absolute right-0 z-40 flex w-64 flex-col gap-0.5 rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-lift",
            hacia === "arriba" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {acciones.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              {...(a.tecla ? { "aria-keyshortcuts": a.tecla } : {})}
              onClick={() => {
                setAbierto(false);
                a.onElegir();
              }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-[0.4rem] px-3 text-left text-sm text-ink-2 focus-visible:outline-2 focus-visible:outline-brand",
                ALTO[surface === "pos" ? "tablet" : surface],
                a.peligro ? "hover:bg-state-crit-bg hover:text-state-crit" : "hover:bg-surface-2 hover:text-ink",
              )}
            >
              <span className="grid size-(--icono-texto) shrink-0 place-content-center" aria-hidden="true">
                {a.icono}
              </span>
              <span className="min-w-0 flex-1">{a.texto}</span>
              {a.tecla && <kbd className="rounded border border-line bg-base px-1.5 font-sans text-etiqueta text-ink-3">{a.tecla}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
