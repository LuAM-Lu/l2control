"use client";

import { usePathname } from "next/navigation";
import { GuardiaAcceso } from "../identity/GuardiaAcceso.tsx";
import { actorDe, nombreDeRuta, puedeAbrirRuta } from "../identity/visibilidad.ts";

/**
 * Guardia de las estaciones: cada ruta pide la acción de su superficie
 * (`SURFACE_ACTION`). El acceso es la única pantalla sin guardia: es donde se
 * entra.
 */
export function GuardiaEstacion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/acceso") return <>{children}</>;
  return (
    <GuardiaAcceso destino={nombreDeRuta(pathname)} permitido={(o) => puedeAbrirRuta(actorDe(o), pathname)}>
      {children}
    </GuardiaAcceso>
  );
}
