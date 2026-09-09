"use client";

import { usePathname } from "next/navigation";

/**
 * Entrada de página al cambiar de superficie — §8.5.
 *
 * La `key` es la ruta: al navegar, React monta un elemento nuevo y la
 * animación de `.l2-entra` vuelve a correr. Es todo el mecanismo; no hay
 * estado, ni temporizadores, ni escuchas de `animationend`.
 *
 * Eso último es deliberado. Una transición se puede cancelar a mitad —el
 * usuario navega otra vez, la pestaña pasa a segundo plano, el sistema pide
 * menos movimiento— y el evento de fin nunca llega. Cualquier cosa que
 * dependa de él se queda esperando para siempre. Aquí, si la animación no
 * ocurre, la pantalla simplemente aparece: el estado base ya es el final.
 *
 * 200 ms y solo 6 px de desplazamiento: en caja se navega decenas de veces
 * por turno y una animación que se note es una animación que estorba.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="l2-entra flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
