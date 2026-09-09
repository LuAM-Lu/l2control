import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4). Única vía autorizada para mostrar dinero (F3-12).
 *
 * FRONTERA DELIBERADA: recibe `value` YA formateado en unidades mayores por
 * `@l2/domain-money.toMajor()`, y no el tipo `Money`. Así `@l2/ui` sigue sin
 * conocer el dominio (§9.2) y la aritmética permanece en un solo sitio.
 *
 * El lint del proyecto falla ante un `toFixed(2)` fuera de este paquete:
 * formatear dinero a mano es cómo se pierden céntimos (§9.7).
 */
export function MoneyDisplay({
  value,
  currency,
  size = "md",
  tone = "default",
  className,
}: {
  /** Unidades mayores ya formateadas, ej. "17.50". */
  value: string;
  currency: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: "default" | "muted" | "positive" | "negative";
  className?: string;
}) {
  const SIZE = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl",
    xl: "text-4xl",
  } as const;

  const TONE = {
    default: "text-ink",
    muted: "text-ink-2",
    positive: "text-state-ok",
    negative: "text-state-crit",
  } as const;

  return (
    <span className={cn("tnum inline-flex items-baseline gap-1", SIZE[size], TONE[tone], className)}>
      <span className="text-[0.7em] font-medium text-ink-3">{currency}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
