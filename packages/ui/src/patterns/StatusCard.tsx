import type { ReactNode } from "react";
import { cn } from "../cn";
import { Badge, type Tone } from "../primitives/Badge";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Tarjeta con estado codificado en la FORMA, no solo en el color: banda
 * lateral + icono + texto. Un cocinero con daltonismo (≈8 % de los hombres)
 * debe poder operar igual de rápido — §8.2 lo trata como requisito
 * funcional, no como accesibilidad opcional.
 *
 * Se reutiliza en monitor de parque, KDS y plano de mesas: por eso vive en
 * `patterns` y no conoce ninguno de los tres dominios.
 */
const STRIPE: Record<Tone, string> = {
  ok: "bg-state-ok",
  warn: "bg-state-warn",
  crit: "bg-state-crit",
  idle: "bg-state-idle",
  brand: "bg-brand",
};

export function StatusCard({
  tone = "idle",
  title,
  subtitle,
  statusLabel,
  statusIcon,
  urgent = false,
  children,
  footer,
  onClick,
  className,
}: {
  tone?: Tone;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusIcon?: ReactNode;
  /** Pulso visual. Nunca es la única señal, y respeta prefers-reduced-motion. */
  urgent?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "relative flex w-full flex-col overflow-hidden text-left",
        "rounded-[var(--radius-card)] border border-line bg-surface",
        onClick && "cursor-pointer transition-colors hover:bg-surface-2",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className,
      )}
    >
      {/* Banda de estado: la señal que se lee a dos metros */}
      <span
        aria-hidden="true"
        className={cn("absolute top-0 bottom-0 left-0 w-1.5", STRIPE[tone], urgent && "l2-pulse")}
      />

      <div className="flex flex-col gap-3 py-4 pr-4 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display truncate text-xl leading-tight font-bold text-ink">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 truncate text-sm text-ink-2">{subtitle}</p>}
          </div>
          <Badge tone={tone} icon={statusIcon} className={cn(urgent && "l2-pulse")}>
            {statusLabel}
          </Badge>
        </div>

        {children}

        {footer && <div className="border-t border-line pt-3">{footer}</div>}
      </div>
    </Wrapper>
  );
}
