import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { useId } from "react";
import { cn } from "../cn";
import type { Surface } from "./Button";

const SURFACE_SIZE: Record<Surface, string> = {
  kds: "min-h-16 text-xl px-4",
  pos: "min-h-14 text-lg px-4",
  tablet: "min-h-12 text-base px-3.5",
  admin: "min-h-9 text-sm px-3",
};

/**
 * Nivel 1 — primitivo (§9.4).
 *
 * §8.7: **etiqueta visible siempre**. El texto de sugerencia como única
 * etiqueta es antipatrón: desaparece justo cuando el usuario escribe, que es
 * cuando necesita recordar qué campo es.
 *
 * El error va **junto al campo**, no en un resumen al final del formulario.
 */
export function Input({
  label,
  error,
  hint,
  surface = "pos",
  leading,
  className,
  id,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  surface?: Surface;
  leading?: ReactNode;
  /**
   * React 19 pasa `ref` como prop normal, sin `forwardRef`. Se declara
   * explícitamente porque `InputHTMLAttributes` no lo incluye.
   *
   * Lo necesita el registro de entrada (F5-02): al escanear una pulsera, el
   * foco tiene que saltar solo al nombre del niño recién añadido. Sin eso, el
   * operador toca la pantalla en cada niño y los 90 segundos se van.
   */
  ref?: Ref<HTMLInputElement>;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase"
      >
        {label}
      </label>

      <div
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-control)] border bg-surface",
          "transition-colors focus-within:border-brand",
          error ? "border-state-crit" : "border-line",
        )}
      >
        {leading && <span className="pl-3 text-ink-3">{leading}</span>}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full min-w-0 bg-transparent text-ink outline-none",
            "placeholder:text-ink-3",
            SURFACE_SIZE[surface],
            leading && "pl-0",
            className,
          )}
        />
      </div>

      {error ? (
        <p id={`${inputId}-err`} className="text-[12.5px] text-state-crit">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[12.5px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
