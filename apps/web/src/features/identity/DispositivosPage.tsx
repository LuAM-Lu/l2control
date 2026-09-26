"use client";

import type { DevicesDirectoryDto, Resultado } from "@l2/contracts";
import { SinDatos } from "./ConfirmarIdentidad";
import { DispositivosProvider } from "./DispositivosProvider.tsx";
import { DispositivosScreen } from "./DispositivosScreen.tsx";
import { useOperador } from "./operador.ts";

/**
 * Dispositivos (F2-02). El directorio lo manda el servidor; si la sesión no alcanza a verlo,
 * se dice (un error oculto es un antipatrón explícito).
 */
export function DispositivosPage({ directorio }: { directorio: Resultado<DevicesDirectoryDto> }) {
  const operador = useOperador();
  if (!operador) return null;

  if (!directorio.ok) return <SinDatos rechazo={directorio} />;

  return (
    <DispositivosProvider inicial={directorio.valor}>
      {/* Llegar aquí con el directorio ya dice que el servidor concedió usuarios.gestionar. */}
      <DispositivosScreen autor={{ id: operador.id, nombre: operador.nombre }} puedeGestionar />
    </DispositivosProvider>
  );
}
