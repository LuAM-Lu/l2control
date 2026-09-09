import { cn } from "../cn";
import type { Tone } from "../primitives/Badge";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Inicial en un cuadrado redondeado. En un parque infantil, doce nombres en
 * una rejilla se vuelven una lista de texto indistinguible; una inicial con
 * color da un punto de anclaje visual para encontrar a un niño concreto de
 * un vistazo.
 *
 * Cuadrado redondeado en vez de círculo a propósito: acompaña el radio del
 * resto de la interfaz y evita el aire de «lista de contactos».
 */
const SKIN: Record<Tone, string> = {
  ok: "bg-state-ok/15 text-state-ok",
  warn: "bg-state-warn/15 text-state-warn",
  crit: "bg-state-crit/20 text-state-crit",
  idle: "bg-surface-2 text-ink-2",
  brand: "bg-brand/15 text-brand",
};

export function Initial({
  name,
  tone = "idle",
  className,
}: {
  name: string;
  tone?: Tone;
  className?: string;
}) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-display grid size-10 shrink-0 place-content-center rounded-[0.6rem]",
        "text-lg font-bold",
        SKIN[tone],
        className,
      )}
    >
      {letter}
    </span>
  );
}
