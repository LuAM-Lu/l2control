"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4). Un recorrido guiado con foco («spotlight») — T-12.
 *
 * Oscurece la pantalla y deja ver solo el elemento del paso, con una tarjeta que dice qué es y para qué sirve.
 * No sabe de qué pantalla habla: recibe los pasos (un selector CSS, un título y un texto) y avisa al terminar o
 * al saltarlo. Quien lo usa decide cuándo se enseña y guarda que ya se vio.
 *
 * DECISIONES
 *  · Un paso cuyo elemento no está en pantalla (otro rol, una vista estrecha, una lista vacía) se salta solo: un
 *    foco sobre la nada confunde más que no enseñarlo.
 *  · Teclado completo: Intro o → avanza, ← vuelve, Esc lo cierra. El foco va a «Siguiente» en cada paso.
 *  · Sin animación si el equipo pide menos movimiento (tokens.css lo apaga para todo).
 *  · No bloquea para siempre: «Saltar» está en todos los pasos.
 */
export type PasoDeRecorrido = Readonly<{
  /** Selector CSS del elemento que se ilumina, p. ej. `[data-recorrido="entrada-lector"]`. */
  objetivo: string;
  titulo: string;
  texto: string;
}>;

type Caja = Readonly<{ top: number; left: number; width: number; height: number }>;

const MARGEN = 8;
const ANCHO_TARJETA = 340;

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

export function Recorrido({
  pasos,
  abierto,
  onTerminar,
  etiqueta = "Recorrido",
}: {
  pasos: readonly PasoDeRecorrido[];
  abierto: boolean;
  /** Al terminar o al saltarlo: `completo` dice si llegó al último paso. */
  onTerminar: (completo: boolean) => void;
  etiqueta?: string;
}) {
  // Solo los pasos cuyo elemento está en pantalla al abrir.
  const [presentes, setPresentes] = useState<readonly PasoDeRecorrido[]>([]);
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const siguiente = useRef<HTMLButtonElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [altoTarjeta, setAltoTarjeta] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    setPresentes(pasos.filter((p) => visible(document.querySelector(p.objetivo))));
    setI(0);
  }, [abierto, pasos]);

  const paso = presentes[i] ?? null;

  const medir = useCallback(() => {
    if (!paso) return setCaja(null);
    const el = document.querySelector(paso.objetivo);
    if (!visible(el)) return setCaja(null);
    const r = el.getBoundingClientRect();
    setCaja({ top: r.top - MARGEN, left: r.left - MARGEN, width: r.width + MARGEN * 2, height: r.height + MARGEN * 2 });
  }, [paso]);

  useLayoutEffect(() => {
    if (!abierto || !paso) return;
    const el = document.querySelector(paso.objetivo);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    medir();
    siguiente.current?.focus();
    setAltoTarjeta(tarjeta.current?.offsetHeight ?? 0);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [abierto, paso, medir]);

  const cerrar = useCallback((completo: boolean) => onTerminar(completo), [onTerminar]);
  const avanzar = useCallback(() => (i + 1 >= presentes.length ? cerrar(true) : setI(i + 1)), [i, presentes.length, cerrar]);
  const volver = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrar(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        avanzar();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        volver();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, avanzar, volver, cerrar]);

  // Sin pasos visibles no hay nada que enseñar: se da por visto.
  useEffect(() => {
    if (abierto && presentes.length === 0 && pasos.length > 0) {
      const t = window.setTimeout(() => {
        if (pasos.every((p) => !visible(document.querySelector(p.objetivo)))) cerrar(false);
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [abierto, presentes.length, pasos, cerrar]);

  if (!abierto || !paso || typeof document === "undefined") return null;

  // La tarjeta va debajo del elemento si cabe; si no, encima; si no cabe en ninguno (un elemento que ocupa casi
  // toda la pantalla), dentro de él, arriba. Siempre entera en la pantalla. Sin elemento, al centro.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ancho = Math.min(ANCHO_TARJETA, vw - 32);
  const alto = altoTarjeta || 210;
  let top = vh / 2 - alto / 2;
  if (caja) {
    const debajo = caja.top + caja.height + 12;
    const encima = caja.top - 12 - alto;
    top = debajo + alto <= vh - 16 ? debajo : encima >= 16 ? encima : caja.top + 16;
  }
  const posicion: React.CSSProperties = {
    width: ancho,
    left: caja ? Math.min(Math.max(16, caja.left), vw - ancho - 16) : (vw - ancho) / 2,
    top: Math.min(Math.max(16, top), Math.max(16, vh - alto - 16)),
  };

  // Se monta en la raíz de la aplicación (el proveedor de la ayuda): `fixed` cubre la pantalla sin portal.
  return (
    <div role="dialog" aria-modal="true" aria-label={etiqueta} className="fixed inset-0 z-[60]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true" onClick={() => cerrar(false)}>
        <defs>
          <mask id="l2-recorrido-hueco">
            <rect width="100%" height="100%" fill="white" />
            {caja && <rect x={caja.left} y={caja.top} width={caja.width} height={caja.height} rx={12} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="var(--color-velo)" mask="url(#l2-recorrido-hueco)" />
        {caja && (
          <rect
            x={caja.left}
            y={caja.top}
            width={caja.width}
            height={caja.height}
            rx={12}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={3}
            className="l2-recorrido-anillo"
          />
        )}
      </svg>
      <div
        ref={tarjeta}
        className={cn(
          "absolute flex flex-col gap-3 rounded-[var(--radius-card)] border border-line-strong bg-surface p-4 shadow-lift",
          "l2-recorrido-tarjeta",
        )}
        style={posicion}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tnum text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Paso {i + 1} de {presentes.length}
            </p>
            <h2 className="font-display mt-1 text-[17px] leading-tight font-bold text-ink">{paso.titulo}</h2>
          </div>
          <button
            type="button"
            onClick={() => cerrar(false)}
            aria-label="Saltar el recorrido"
            className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="text-[14px] leading-relaxed text-ink-2">{paso.texto}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => cerrar(false)}
            className="min-h-11 cursor-pointer rounded-[var(--radius-control)] px-2 text-[13px] text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            Saltar
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={volver}
                aria-label="Paso anterior"
                className="grid size-11 cursor-pointer place-content-center rounded-[var(--radius-control)] border border-line text-ink-2 hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                <ArrowLeft size={16} aria-hidden="true" />
              </button>
            )}
            <button
              ref={siguiente}
              type="button"
              onClick={avanzar}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] bg-brand px-4 text-[14px] font-semibold text-on-brand hover:bg-brand-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {i + 1 >= presentes.length ? "Entendido" : "Siguiente"}
              {i + 1 < presentes.length && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
