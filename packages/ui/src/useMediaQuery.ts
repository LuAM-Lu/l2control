"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * ¿Coincide la consulta de medios? Para lo que el CSS no puede decidir: qué componente se monta (una
 * baldosa compacta en vez de la tarjeta completa, p. ej.), no cómo se pinta. Lo que sea solo estilo va
 * con las variantes de Tailwind (`max-md:`), que no esperan a la hidratación.
 *
 * En el servidor no hay pantalla: devuelve `false` y el primer pintado del cliente corrige.
 */
export function useMediaQuery(consulta: string): boolean {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    [consulta],
  );
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
