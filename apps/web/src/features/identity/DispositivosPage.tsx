"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldX } from "lucide-react";
import type { DevicesDirectoryDto, Resultado } from "@l2/contracts";
import { Button, Container } from "@l2/ui";
import { usePedirElevacion } from "./ElevacionProvider";
import { DispositivosProvider } from "./DispositivosProvider.tsx";
import { DispositivosScreen } from "./DispositivosScreen.tsx";
import { useOperador } from "./operador.ts";

/**
 * Dispositivos (F2-02). El directorio lo manda el servidor; si la sesión no alcanza a verlo,
 * se dice (un error oculto es un antipatrón explícito).
 */
export function DispositivosPage({ directorio }: { directorio: Resultado<DevicesDirectoryDto> }) {
  const operador = useOperador();
  const pedirElevacion = usePedirElevacion();
  const router = useRouter();
  if (!operador) return null;

  // Gestionar equipos es gestionar personas (F2-04): hasta confirmar identidad, ni se listan.
  if (!directorio.ok && directorio.motivo === "ELEVACION_REQUERIDA") {
    return (
      <Container ancho="panel" className="py-12">
        <div className="flex max-w-lg flex-col items-start gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <ShieldCheck size={22} className="text-ink-2" aria-hidden="true" />
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Confirma que eres tú</h1>
            <p className="mt-1 text-sm text-ink-2">{directorio.mensaje}</p>
          </div>
          <Button
            surface="admin"
            variant="primary"
            onClick={async () => {
              if (await pedirElevacion()) router.refresh();
            }}
          >
            Confirmar identidad
          </Button>
        </div>
      </Container>
    );
  }

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
