"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "../cn";
import type { Surface } from "./Button";

/**
 * Nivel 1 — primitivo (§9.4).
 *
 * Contador con botones de menos y más, y el número editable en medio. No
 * conoce el dominio: cuenta cosas, no sabe que son billetes.
 *
 * Por qué las dos formas de entrada a la vez: para tres billetes de 100 se
 * pulsa «+» tres veces sin mirar el teclado; para treinta y siete de 1 se
 * teclea el número. Obligar a una sola de las dos castiga siempre a uno de
 * los dos casos, y en un arqueo aparecen los dos en la misma gaveta.
 *
 * §8.4: los botones miden lo que exige la superficie (48 px en tablet), y el
 * campo selecciona su contenido al enfocarlo para que teclear sustituya en
 * vez de concatenar — «3» seguido de «7» no debe dar «37» cuando se quería 7.
 */
const TAM: Record<Surface, { boton: string; campo: string }> = {
  kds: { boton: "size-16", campo: "h-16 w-20 text-2xl" },
  pos: { boton: "size-14", campo: "h-14 w-[4.5rem] text-xl" },
  tablet: { boton: "size-12", campo: "h-12 w-16 text-lg" },
  admin: { boton: "size-8", campo: "h-8 w-12 text-sm" },
};

export function Stepper({
  value,
  onChange,
  label,
  min = 0,
  max = 9999,
  surface = "tablet",
  disabled = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Nombre accesible del contador, ej. «Billetes de 100 USD». */
  label: string;
  min?: number;
  max?: number;
  surface?: Surface;
  disabled?: boolean;
  className?: string;
}) {
  const fijar = (n: number) => onChange(Math.min(max, Math.max(min, n)));

  const boton = cn(
    "grid shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)]",
    "border border-line bg-base text-ink-2",
    "transition-[color,border-color,transform] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
    "hover:border-line-strong hover:text-ink active:scale-[0.96]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    "disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100",
    TAM[surface].boton,
  );

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        aria-label={`Quitar uno · ${label}`}
        disabled={disabled || value <= min}
        onClick={() => fijar(value - 1)}
        className={boton}
      >
        <Minus size={16} aria-hidden="true" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        disabled={disabled}
        // El cero se muestra como vacío con «0» de sugerencia: así se distingue
        // de un vistazo qué filas se contaron y cuáles no.
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "");
          fijar(digitos === "" ? 0 : Number.parseInt(digitos, 10));
        }}
        className={cn(
          "tnum rounded-[var(--radius-control)] border border-line bg-base text-center font-semibold text-ink",
          "outline-none placeholder:text-ink-3 focus:border-brand",
          "transition-colors duration-[var(--dur-rapida)]",
          "disabled:opacity-35",
          TAM[surface].campo,
        )}
      />

      <button
        type="button"
        aria-label={`Añadir uno · ${label}`}
        disabled={disabled || value >= max}
        onClick={() => fijar(value + 1)}
        className={boton}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
