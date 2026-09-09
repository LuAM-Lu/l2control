import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * ADR-010: EL CRONÓMETRO ES DEL SERVIDOR. Este componente NO decide cuánto
 * tiempo queda ni lleva su propio reloj: recibe el instante ya corregido por
 * `useServerClock` y solo lo dibuja.
 *
 * Que el reloj venga de fuera es deliberado: así la cifra y la barra de
 * progreso de una misma tarjeta avanzan con el mismo latido. Dos
 * temporizadores independientes se desincronizan y se nota.
 */
export function CountdownDisplay({
  /** Instante actual corregido contra el servidor. */
  now,
  /** Marca de tiempo contra la que se compara (vencimiento o inicio). */
  targetMs,
  /** `down` cuenta hacia atrás (prepago); `up` hacia adelante (postpago). */
  direction,
  format,
  className,
  size = "md",
}: {
  now: number;
  targetMs: number;
  direction: "up" | "down";
  format: (ms: number) => string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const delta = direction === "down" ? targetMs - now : now - targetMs;
  const overdue = direction === "down" && delta < 0;

  const SIZE = {
    sm: "text-2xl",
    md: "text-[2.75rem]",
    lg: "text-6xl",
  } as const;

  return (
    <span
      className={cn(
        "tnum font-display leading-none font-bold tracking-[-0.03em] tabular-nums",
        SIZE[size],
        className,
      )}
      aria-live="off"
    >
      {overdue && <span aria-label="vencido">−</span>}
      {format(Math.abs(delta))}
    </span>
  );
}
