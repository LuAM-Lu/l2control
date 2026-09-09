import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4).
 *
 * Un solo sistema de anchos para todo el producto. Existe porque cada pantalla
 * se había elegido el suyo —1100, 1180, 1400, 1500, 1600— y eso se nota: al
 * saltar entre superficies el contenido «baila» de sitio aunque cada pantalla,
 * por separado, esté bien.
 *
 * Los cuatro anchos responden a cuatro trabajos, no a cuatro gustos. La
 * pregunta que decide cuál usar es **a qué distancia y en qué postura se lee**:
 *
 *  · `prosa`     — texto corrido. Se corta cerca de 68 caracteres porque una
 *                  línea más larga obliga a buscar el renglón siguiente.
 *  · `panel`     — back-office, sentado y de cerca. Inicio, informes, ajustes.
 *  · `operacion` — superficie de trabajo de pie: caja, entrada, salida, turno.
 *                  Son dos columnas —lo que se hace y lo que se cobra— y la
 *                  segunda no puede encogerse: a 1180 el ticket queda ilegible.
 *  · `muro`      — rejillas densas que se miran a dos metros (monitor de sala,
 *                  cocina). Recortarlas desperdicia media pantalla.
 *
 * El acolchado lateral escala con la ventana. Un `px-6` fijo deja el contenido
 * pegado al borde en un teléfono de 320 px y perdido en un monitor de 27".
 */
const ANCHO = {
  prosa: "max-w-[68ch]",
  panel: "max-w-[1180px]",
  operacion: "max-w-[1440px]",
  muro: "max-w-[1680px]",
  full: "max-w-none",
} as const;

export function Container({
  ancho = "panel",
  children,
  className,
  as: Tag = "div",
}: {
  ancho?: keyof typeof ANCHO;
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "header" | "main" | "footer" | "nav";
}) {
  return (
    <Tag className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", ANCHO[ancho], className)}>
      {children}
    </Tag>
  );
}
