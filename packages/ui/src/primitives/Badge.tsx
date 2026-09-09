import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Nivel 1 — primitivo (§9.4).
 *
 * Los tonos de estado son RESERVADOS (§8.2): `ok`, `warn`, `crit` e `idle`
 * significan siempre lo mismo en todo el sistema. No se usan como color
 * decorativo ni como "serie 4" de un gráfico.
 */
export type Tone = "ok" | "warn" | "crit" | "idle" | "brand";

const TONE: Record<Tone, string> = {
  ok: "bg-state-ok-bg text-state-ok border-state-ok/35",
  warn: "bg-state-warn-bg text-state-warn border-state-warn/35",
  crit: "bg-state-crit-bg text-state-crit border-state-crit/35",
  idle: "bg-state-idle-bg text-ink-2 border-line",
  brand: "bg-brand/15 text-brand border-brand/35",
};

export function Badge({
  tone = "idle",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5",
        "text-xs font-semibold tracking-wide whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
