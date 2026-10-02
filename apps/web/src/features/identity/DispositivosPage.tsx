"use client";

import type { PaginaDeDispositivosDto, Resultado } from "@l2/contracts";
import { SinDatos } from "./ConfirmarIdentidad";
import { DispositivosScreen } from "./DispositivosScreen.tsx";
import { useOperador } from "./operador.ts";

/**
 * Dispositivos (F2-02, T-7). La primera página la manda el servidor; las siguientes las lee la
 * pantalla. Si la sesión no alcanza a verlos, se dice (un error oculto es un antipatrón explícito).
 */
export function DispositivosPage({ directorio }: { directorio: Resultado<PaginaDeDispositivosDto> }) {
  const operador = useOperador();
  if (!operador) return null;
  if (!directorio.ok) return <SinDatos rechazo={directorio} />;
  // Llegar aquí con la página ya dice que el servidor concedió usuarios.gestionar.
  return <DispositivosScreen inicial={directorio.valor} autor={{ id: operador.id, nombre: operador.nombre }} puedeGestionar />;
}
