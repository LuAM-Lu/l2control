"use client";

import type { PricePackageDto } from "@l2/contracts";
import { cn, MoneyDisplay } from "@l2/ui";
import { toMajor } from "@l2/domain-money";
import { toMoney } from "./mappers.ts";

/**
 * Nivel 3 — funcionalidad (§9.4). Conoce lo que es un paquete de tarifa.
 *
 * Botones grandes en lugar de un desplegable, y no por gusto: un `<select>`
 * en una tablet abre una lista nativa, obliga a apuntar y añade dos toques.
 * Con cuatro tarifas, verlas todas y tocar una es más rápido — y los 90
 * segundos de F5-02 se ganan justo aquí.
 */
export function PackagePicker({
  packages,
  selectedId,
  onSelect,
  compact = false,
}: {
  packages: readonly PricePackageDto[];
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Paquete de tiempo"
      className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}
    >
      {packages.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(p.id)}
            className={cn(
              // §8.4: superficie POS, objetivo mínimo de 56 px.
              "flex min-h-14 cursor-pointer flex-col items-start justify-center gap-0.5",
              "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              active
                ? "border-brand bg-brand/12 text-ink"
                : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            <span className={cn("text-[13px] leading-tight font-semibold", active && "text-brand")}>
              {p.name}
            </span>
            <MoneyDisplay
              value={toMajor(toMoney(p.price))}
              currency={p.price.currency}
              size="sm"
              tone={active ? "default" : "muted"}
            />
          </button>
        );
      })}
    </div>
  );
}
