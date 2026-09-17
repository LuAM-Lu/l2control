import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Estado de espera de una pantalla que se opera con lector. No conoce el
 * dominio: recibe el icono y los textos, no sabe qué es una pulsera.
 *
 * EL ESTADO VACÍO DE UNA PANTALLA DE LECTOR ES LA INSTRUCCIÓN
 * En entrada y salida, la pantalla pasa la mayor parte del tiempo esperando
 * la primera pulsera. La versión anterior dedicaba a ese momento una caja
 * pequeña arriba y dejaba el resto de la pantalla en negro — justo cuando el
 * operador, o alguien nuevo en el puesto, necesita saber qué hacer.
 *
 * Aquí la espera ocupa todo el hueco disponible (`flex-1`), dice la acción en
 * grande y enseña el recorrido completo en pasos. El anillo late con la misma
 * animación que el resto del sistema, y `prefers-reduced-motion` la apaga.
 *
 * En pantalla baja (`bajo:`, menos de 760 px de alto) se aprieta: a 1024×600
 * la versión grande no cabía junto al lector y obligaba a desplazar una
 * pantalla que está vacía (F-06).
 */
export function ScanPrompt({
  icon,
  titulo,
  detalle,
  pasos,
  className,
}: {
  icon: ReactNode;
  titulo: string;
  detalle?: string;
  /** Recorrido de la pantalla, en orden. Se muestra numerado. */
  pasos?: readonly string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[18rem] flex-1 flex-col items-center justify-center bajo:min-h-0",
        "rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50",
        "px-6 py-12 text-center bajo:py-6",
        className,
      )}
    >
      <span className="relative grid size-24 shrink-0 place-content-center bajo:size-16 rounded-full border border-brand/30 bg-brand/8 text-brand">
        <span
          aria-hidden="true"
          className="l2-pulse absolute -inset-2 rounded-full border-2 border-brand/20"
        />
        {icon}
      </span>

      <p className="font-display mt-7 text-2xl font-bold text-ink bajo:mt-4 bajo:text-xl">{titulo}</p>
      {detalle && (
        <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink-2">{detalle}</p>
      )}

      {pasos && pasos.length > 0 && (
        <ol className="mt-9 bajo:mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-3 text-[13px] text-ink-3">
          {pasos.map((p, i) => (
            <li key={p} className="flex items-center gap-2">
              <span className="tnum grid size-6 place-content-center rounded-full border border-line text-[11px] font-semibold text-ink-2">
                {i + 1}
              </span>
              {p}
              {i < pasos.length - 1 && (
                <span aria-hidden="true" className="ml-1 text-ink-3/50">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
