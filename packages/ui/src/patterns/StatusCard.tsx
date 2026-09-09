import type { ReactNode } from "react";
import { cn } from "../cn";
import type { Tone } from "../primitives/Badge";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Tarjeta operativa con estado codificado en la FORMA, no solo en el color:
 * banda superior a todo lo ancho + icono + texto. Un cocinero con daltonismo
 * (≈8 % de los hombres) debe operar igual de rápido — §8.2 lo trata como
 * requisito funcional, no como accesibilidad opcional.
 *
 * La banda va ARRIBA y ocupa todo el ancho, no en un costado: se lee a dos
 * metros y no compite por espacio con el nombre, que era el defecto de la
 * primera versión (el chip de estado se recortaba contra el borde).
 *
 * Se reutiliza en monitor de parque, KDS y plano de mesas: por eso vive en
 * `patterns` y no conoce ninguno de los tres dominios.
 */

const BAND: Record<Tone, string> = {
  ok: "bg-state-ok",
  warn: "bg-state-warn",
  crit: "bg-state-crit",
  idle: "bg-state-idle",
  brand: "bg-brand",
};

const LABEL: Record<Tone, string> = {
  ok: "text-state-ok",
  warn: "text-state-warn",
  crit: "text-state-crit",
  idle: "text-ink-2",
  brand: "text-brand",
};

const SHELL: Record<Tone, string> = {
  ok: "border-line bg-surface",
  warn: "border-state-warn/30 bg-state-warn-bg/40",
  crit: "border-state-crit/45 bg-state-crit-bg/50",
  idle: "border-line bg-surface",
  brand: "border-brand/30 bg-surface",
};

export function StatusCard({
  tone = "idle",
  statusLabel,
  statusIcon,
  urgent = false,
  leading,
  title,
  subtitle,
  children,
  footer,
  onClick,
  selected = false,
  className,
}: {
  tone?: Tone;
  statusLabel: string;
  statusIcon?: ReactNode;
  /** Pulso visual. Nunca es la única señal, y respeta prefers-reduced-motion. */
  urgent?: boolean;
  /** Ranura izquierda de la cabecera: avatar, inicial, número de mesa. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        // `h-full` + grid de filas hace que todas las tarjetas de una fila
        // midan lo mismo aunque un nombre ocupe dos líneas.
        "group grid h-full grid-rows-[auto_auto_1fr_auto] overflow-hidden text-left",
        "rounded-[var(--radius-card)] border shadow-card",
        "transition-[transform,box-shadow,border-color] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
        SHELL[tone],
        // La tarjeta se levanta solo si es clicable: el movimiento tiene que
        // significar «esto responde», no ser decoración.
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift",
        selected && "ring-2 ring-brand ring-offset-2 ring-offset-base",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className,
      )}
    >
      {/* Banda de estado: la señal que se lee a dos metros */}
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-full", BAND[tone], urgent && "l2-pulse")}
      />

      <div className="flex items-center gap-2.5 px-4 pt-3">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase",
            LABEL[tone],
            urgent && "l2-pulse",
          )}
        >
          {statusIcon}
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-start gap-3">
          {leading}
          <div className="min-w-0 flex-1">
            <h3 className="font-display truncate text-lg leading-tight font-bold text-ink">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-2">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>

      {footer && (
        <div className="border-t border-line/70 px-4 py-2.5">{footer}</div>
      )}
    </Wrapper>
  );
}
