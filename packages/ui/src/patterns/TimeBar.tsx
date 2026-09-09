import { cn } from "../cn";
import type { Tone } from "../primitives/Badge";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * La pieza que faltaba: en un sistema cuyo producto ES EL TIEMPO, el tiempo
 * tiene que verse, no solo leerse. Una cifra dice «quedan 5 minutos»; la
 * barra dice «esto está a punto de acabarse» sin tener que leer nada, que es
 * lo que necesita alguien mirando doce tarjetas a la vez desde lejos.
 *
 * El excedente se dibuja como una zona aparte a la derecha, para que
 * «vencido hace un minuto» y «vencido hace media hora» no se vean igual.
 */
const FILL: Record<Tone, string> = {
  ok: "bg-state-ok",
  warn: "bg-state-warn",
  crit: "bg-state-crit",
  idle: "bg-state-idle",
  brand: "bg-brand",
};

export function TimeBar({
  /** Fracción de tiempo consumida, 0 a 1. Se recorta a ese rango. */
  progress,
  /** Fracción excedida más allá del 100 %, 0 a 1 (1 = otro tanto de más). */
  overflow = 0,
  /**
   * Sin objetivo contra el que medir (postpago, pase libre). Se dibuja una
   * pista rayada en lugar de una barra: llenarla al 100 % diría "se acabó el
   * tiempo", que es exactamente lo contrario de lo que ocurre.
   */
  indeterminate = false,
  tone = "ok",
  label,
  value,
  className,
}: {
  progress: number;
  overflow?: number;
  indeterminate?: boolean;
  tone?: Tone;
  label?: string;
  value?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  const overPct = Math.min(100, Math.max(0, overflow * 100));

  if (indeterminate) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div
          aria-hidden="true"
          className="h-1.5 w-full rounded-full opacity-60"
          style={{
            backgroundImage:
              "repeating-linear-gradient(115deg, var(--color-line-strong) 0 4px, transparent 4px 9px)",
          }}
        />
        {(label || value) && (
          <div className="flex items-baseline justify-between gap-2">
            {label && (
              <span className="text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
                {label}
              </span>
            )}
            {value && <span className="tnum text-[11px] text-ink-2">{value}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Tiempo consumido"}
      >
        <span
          className={cn("h-full rounded-full transition-[width] duration-700", FILL[tone])}
          style={{ width: `${pct}%` }}
        />
        {overPct > 0 && (
          <span
            className="h-full bg-state-crit/45"
            style={{ width: `${overPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      {(label || value) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <span className="text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
              {label}
            </span>
          )}
          {value && <span className="tnum text-[11px] text-ink-2">{value}</span>}
        </div>
      )}
    </div>
  );
}
