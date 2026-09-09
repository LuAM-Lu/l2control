import type { ReactNode } from "react";
import { cn } from "../cn";
import type { Tone } from "../primitives/Badge";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Cifra de cabecera. Sustituye a la fila de chips apretados de la primera
 * versión: en una barra permanente lo que importa se lee de un vistazo, y un
 * chip de 11 px no se lee de un vistazo.
 *
 * §8.6: se lidera con cifras solo cuando esas cifras SON el punto de la
 * pantalla. En el monitor de parque lo son: cuántos hay, cuántos vencidos.
 */
const VALUE: Record<Tone, string> = {
  ok: "text-state-ok",
  warn: "text-state-warn",
  crit: "text-state-crit",
  idle: "text-ink",
  brand: "text-brand",
};

export function StatTile({
  label,
  value,
  suffix,
  tone = "idle",
  icon,
  urgent = false,
  className,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  tone?: Tone;
  icon?: ReactNode;
  urgent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-[76px] flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.09em] text-ink-3 uppercase">
        {icon}
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            "tnum font-display text-2xl leading-none font-bold tracking-tight",
            VALUE[tone],
            urgent && "l2-pulse",
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-xs text-ink-3">{suffix}</span>}
      </span>
    </div>
  );
}
