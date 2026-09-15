"use client";

import { usePathname } from "next/navigation";
import { GuardiaAcceso } from "../identity/GuardiaAcceso.tsx";
import { useAjustes } from "../identity/accesos.ts";
import { actorDe, nombreDeRuta, puedeAbrirRuta } from "../identity/visibilidad.ts";

/**
 * Guardia de las estaciones: cada ruta pide la acción de su superficie
 * (`SURFACE_ACTION`). El acceso es la única pantalla sin guardia: es donde se
 * entra.
 */
export function GuardiaEstacion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Los ajustes de la sucursal cuentan también en la puerta de una estación.
  const ajustes = useAjustes();
  if (pathname === "/acceso") return <>{children}</>;
  return (
    <GuardiaAcceso
      destino={nombreDeRuta(pathname)}
      permitido={(o) => puedeAbrirRuta(actorDe(o, ajustes), pathname)}
    >
      {children}
    </GuardiaAcceso>
  );
}
