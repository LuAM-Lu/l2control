"use client";

import { ShieldX } from "lucide-react";
import type { DevicesDirectoryDto, Resultado } from "@l2/contracts";
import { Container } from "@l2/ui";
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

  if (!directorio.ok) {
    return (
      <Container ancho="panel" className="py-12">
        <div role="alert" className="flex items-center gap-3 rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-5 text-sm text-ink">
          <ShieldX size={18} className="shrink-0 text-state-crit" aria-hidden="true" />
          {directorio.mensaje}
        </div>
      </Container>
    );
  }

  return (
    <DispositivosProvider inicial={directorio.valor}>
      {/* Llegar aquí con el directorio ya dice que el servidor concedió usuarios.gestionar. */}
      <DispositivosScreen autor={{ id: operador.id, nombre: operador.nombre }} puedeGestionar />
    </DispositivosProvider>
  );
}
