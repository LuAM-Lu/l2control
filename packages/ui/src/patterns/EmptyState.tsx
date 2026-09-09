import type { ReactNode } from "react";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * §8.6 lista "estados de error ocultos" como antipatrón explícito de esta
 * categoría de producto. Vacío y error se muestran, siempre, y el texto dice
 * qué hacer a continuación — no solo qué pasó.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-14 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-2">{hint}</p>}
      {action}
    </div>
  );
}
