import { cn } from "@l2/ui";

/**
 * El logo de L2 (la «L2» azul y verde de la suite), el mismo archivo que usa L2Lab. Es la marca del
 * producto, no la del local: va igual en los dos temas, sin recuadro detrás (trae su propio
 * contorno blanco, que lo despega del fondo oscuro y desaparece sobre el claro).
 *
 * Decorativo: siempre va junto al nombre «L2 Control» o del local, que es lo que se lee.
 * El alto lo pone quien lo usa (`h-9`, `h-14`…); el ancho sale de la proporción (192 × 167).
 */
export function LogoL2({ className }: { className?: string }) {
  return <img src="/logo-l2.png" alt="" width={192} height={167} decoding="async" className={cn("w-auto shrink-0 object-contain", className)} />;
}
