"use client";

import { Delete } from "lucide-react";
import { cn } from "../cn";
import type { Surface } from "../primitives/Button";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Teclado numérico táctil para montos y PIN. No conoce el dominio: recibe el
 * valor y emite el cambio.
 *
 * §8.4: en superficie POS el objetivo mínimo es 56 px, y aquí se usa más
 * grande a propósito — se teclea de pie, con prisa y sin mirar. Un teclado
 * que obliga a apuntar es un teclado que produce errores.
 */
const SIZE: Record<Surface, string> = {
  kds: "min-h-20 text-3xl",
  pos: "min-h-16 text-2xl",
  tablet: "min-h-14 text-xl",
  admin: "min-h-11 text-base",
};

export function NumericKeypad({
  value,
  onChange,
  maxLength,
  surface = "pos",
  disabled = false,
  onSubmit,
  submitLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  surface?: Surface;
  disabled?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
  className?: string;
}) {
  const push = (d: string) => {
    if (disabled) return;
    if (maxLength !== undefined && value.length >= maxLength) return;
    onChange(value + d);
  };

  const back = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const tecla = cn(
    "flex cursor-pointer items-center justify-center rounded-[var(--radius-control)]",
    "border border-line bg-surface font-semibold text-ink transition-colors",
    "hover:border-line-strong hover:bg-surface-2 active:scale-[0.98]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:cursor-not-allowed disabled:opacity-40",
    SIZE[surface],
  );

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => push(d)} className={tecla}>
          {d}
        </button>
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={back}
        aria-label="Borrar el último dígito"
        className={cn(tecla, "text-ink-2")}
      >
        <Delete size={22} aria-hidden="true" />
      </button>

      <button type="button" disabled={disabled} onClick={() => push("0")} className={tecla}>
        0
      </button>

      {onSubmit ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onSubmit}
          className={cn(
            tecla,
            "border-brand bg-brand text-on-brand hover:bg-brand-2 text-base",
            // Apagada, la tecla de marca se vuelve neutra en vez de quedar naranja a
            // medias: igual que Button, para que «todavía no» no parezca «roto».
            "disabled:border-line disabled:bg-surface-2 disabled:text-ink-3 disabled:opacity-100",
          )}
        >
          {submitLabel ?? "OK"}
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}
