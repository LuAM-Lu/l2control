import { cn } from "../cn";

/**
 * Formatea un monto y moneda según la norma bancaria y comercial de Venezuela (BCV / SENIAT).
 *
 * - Para bolívares (VES / Bs.): Símbolo "Bs.", separador de miles con punto (.)
 *   y separador decimal con coma (,). Ejemplo: "18272.80" -> "18.272,80".
 * - Para dólares (USD): Símbolo "$", formato estándar limpio ("94.17").
 * - Para USDT / otras: Símbolo "USDT" u original.
 */
export function formatPartsMoneyVE(
  value: string,
  currency: string,
): { symbol: string; formatted: string } {
  const isVES = currency === "VES" || currency === "Bs." || currency === "Bs" || currency === "Bs.S";
  const isUSD = currency === "USD" || currency === "$";
  const symbol = isVES ? "Bs." : isUSD ? "$" : currency;

  const isNegative = value.startsWith("-");
  const clean = value.replace("-", "").trim();
  const [wholePart = "0", fracPart] = clean.split(".");

  if (isVES) {
    const wholeFormatted = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const fracFormatted = fracPart !== undefined ? fracPart.padEnd(2, "0") : "00";
    const formatted = `${isNegative ? "-" : ""}${wholeFormatted},${fracFormatted}`;
    return { symbol, formatted };
  }

  const wholeFormatted = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracFormatted = fracPart !== undefined ? fracPart.padEnd(2, "0") : "00";
  const formatted = `${isNegative ? "-" : ""}${wholeFormatted}.${fracFormatted}`;
  return { symbol, formatted };
}

/** Helper para mostrar moneda formateada como texto plano (ej. "Bs. 18.272,80" o "$ 94.17"). */
export function formatMoneyVE(value: string, currency: string): string {
  const { symbol, formatted } = formatPartsMoneyVE(value, currency);
  return `${symbol} ${formatted}`;
}

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
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  tone?: "default" | "muted" | "positive" | "negative";
  className?: string;
}) {
  const SIZE = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl",
    xl: "text-4xl",
    /* La cifra que manda en la pantalla: lo que falta por cobrar. Escala con
       la ventana porque en la estación fija hay sitio y en la tablet no. */
    hero: "text-[clamp(2.5rem,5.5vw,3.5rem)] leading-none",
  } as const;

  const TONE = {
    default: "text-ink",
    muted: "text-ink-2",
    positive: "text-state-ok",
    negative: "text-state-crit",
  } as const;

  const { symbol, formatted } = formatPartsMoneyVE(value, currency);

  return (
    <span className={cn("tnum inline-flex items-baseline gap-1", SIZE[size], TONE[tone], className)}>
      <span className="text-[0.7em] font-medium text-ink-3">{symbol}</span>
      <span className="font-semibold">{formatted}</span>
    </span>
  );
}
