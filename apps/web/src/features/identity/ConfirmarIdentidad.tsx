"use client";

import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldX } from "lucide-react";
import type { Rechazo } from "@l2/contracts";
import { Button, Container } from "@l2/ui";
import { usePedirElevacion } from "./ElevacionProvider";

/**
 * Lo que enseña una sección del panel cuando el servidor no le dio sus datos. Si lo que falta es
 * confirmar identidad (F2-04), ofrece hacerlo y vuelve a pedir la sección; si es otra cosa, lo
 * dice: un error oculto es un antipatrón explícito.
 */
export function SinDatos({ rechazo }: { rechazo: Rechazo }) {
  const pedirElevacion = usePedirElevacion();
  const router = useRouter();

  if (rechazo.motivo === "ELEVACION_REQUERIDA") {
    return (
      <Container ancho="panel" className="py-12">
        <div className="flex max-w-lg flex-col items-start gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <ShieldCheck size={22} className="text-ink-2" aria-hidden="true" />
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Confirma que eres tú</h1>
            <p className="mt-1 text-sm text-ink-2">{rechazo.mensaje}</p>
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

  return (
    <Container ancho="panel" className="py-12">
      <div role="alert" className="flex items-center gap-3 rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-5 text-sm text-ink">
        <ShieldX size={18} className="shrink-0 text-state-crit" aria-hidden="true" />
        {rechazo.mensaje}
      </div>
    </Container>
  );
}
