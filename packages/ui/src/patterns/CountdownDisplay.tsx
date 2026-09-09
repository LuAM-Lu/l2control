"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * ADR-010: EL CRONÓMETRO ES DEL SERVIDOR. Este componente NO decide cuánto
 * tiempo queda. Recibe el instante autoritativo del servidor y el desfase
 * medido contra el reloj local, y solo INTERPOLA visualmente entre latidos
 * para que el número no salte.
 *
 * Cambiar el reloj de la tablet mueve lo que se ve, nunca lo que se cobra:
 * la liquidación siempre la calcula el servidor.
 */
export function CountdownDisplay({
  /** Instante de referencia del servidor, en epoch ms. */
  serverNow,
  /** Marca de tiempo del servidor a la que se compara (inicio o vencimiento). */
  targetMs,
  /** `down` cuenta hacia atrás (prepago); `up` hacia adelante (postpago). */
  direction,
  format,
  className,
  size = "md",
}: {
  serverNow: number;
  targetMs: number;
  direction: "up" | "down";
  format: (ms: number) => string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  // Desfase entre el reloj del servidor y el de este dispositivo, medido una
  // sola vez al montar. A partir de ahí solo avanzamos localmente.
  const [offset] = useState(() => serverNow - Date.now());
  const [tick, setTick] = useState(() => serverNow);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [offset]);

  const delta = direction === "down" ? targetMs - tick : tick - targetMs;
  const overdue = direction === "down" && delta < 0;

  const SIZE = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-6xl",
  } as const;

  return (
    <span
      className={cn("tnum font-semibold tabular-nums", SIZE[size], className)}
      // El tiempo cambia solo: se anuncia con cortesía, sin interrumpir.
      aria-live="off"
    >
      {overdue && "−"}
      {format(Math.abs(delta))}
    </span>
  );
}
