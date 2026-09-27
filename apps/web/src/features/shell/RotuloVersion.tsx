import { cn } from "@l2/ui";
import { rotuloDeVersion } from "./version.ts";

/**
 * «v0.14.0 · Etapa 2 · Dinero» en letra pequeña (M-10): lo que se dicta por teléfono cuando algo
 * falla, y lo que dice de un vistazo cuánto va de la ruta. No es un estado: va en tinta tenue.
 */
export function RotuloVersion({ className }: { className?: string }) {
  return (
    <p className={cn("tnum text-[12px] text-ink-3", className)} data-version="">
      {rotuloDeVersion()}
    </p>
  );
}
