"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón. Un texto de un renglón que, si no cabe, se desliza despacio hasta su final y vuelve, con una pausa
 * en cada extremo (T-15, M-27, P-9), en vez de cortarse con puntos suspensivos. Si cabe, se queda quieto. Con
 * «reducir movimiento» no se mueve: se parte en renglones. El texto entero va también en `title`.
 *
 * Mide lo que sobra con un `ResizeObserver`: al cambiar el ancho de la columna (girar la tablet, plegar la cola) se
 * vuelve a medir, y un nombre que ya cabe deja de moverse.
 */
export function Marquesina({ children, className, titulo }: { children: ReactNode; className?: string; titulo?: string }) {
  const caja = useRef<HTMLSpanElement>(null);
  const texto = useRef<HTMLSpanElement>(null);
  const [sobra, setSobra] = useState(0);

  useEffect(() => {
    const c = caja.current;
    const t = texto.current;
    if (!c || !t) return;
    const medir = () => setSobra(Math.max(0, Math.ceil(t.scrollWidth - c.clientWidth)));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(c);
    return () => observador.disconnect();
  }, [children]);

  // Unos 12 px por segundo: se lee mientras se mueve. Nunca menos de 6 s la vuelta.
  const estilo = sobra > 0 ? ({ "--l2-desplazar": `-${sobra}px`, "--l2-marquesina-dur": `${Math.max(6, Math.round(sobra / 12) * 2)}s` } as CSSProperties) : undefined;
  return (
    <span
      ref={caja}
      title={titulo ?? (typeof children === "string" ? children : undefined)}
      className={cn("l2-marquesina-caja block min-w-0 overflow-hidden whitespace-nowrap", className)}
    >
      <span ref={texto} className={cn("inline-block", sobra > 0 && "l2-marquesina")} style={estilo}>
        {children}
      </span>
    </span>
  );
}
