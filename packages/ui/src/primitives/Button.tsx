import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

/**
 * Nivel 1 — primitivo (§9.4).
 *
 * REGLA: no acepta colores literales, solo tokens. Y el tamaño se elige por
 * SUPERFICIE, no por gusto: los mínimos de §8.4 existen porque esto se usa
 * de pie, con prisa y a veces con guantes.
 */
export type Surface = "kds" | "pos" | "tablet" | "admin";

const SURFACE_SIZE: Record<Surface, string> = {
  kds: "min-h-16 min-w-16 px-6 text-xl",
  pos: "min-h-14 min-w-14 px-5 text-lg",
  tablet: "min-h-12 min-w-12 px-4 text-base",
  admin: "min-h-8 min-w-8 px-3 text-sm",
};

const VARIANT: Record<string, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-2 font-semibold",
  neutral: "bg-surface-2 text-ink hover:bg-line border border-line",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-state-crit text-ink hover:opacity-90 font-semibold",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  surface?: Surface;
  variant?: keyof typeof VARIANT;
  children: ReactNode;
};

export function Button({
  surface = "tablet",
  variant = "neutral",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)]",
        "transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-45",
        SURFACE_SIZE[surface],
        VARIANT[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
