"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button, avisar } from "@l2/ui";
import { EstadoDeImpresion, useCola } from "./ColaProvider.tsx";
import { imprimirCorte } from "./impresion.acciones";

/**
 * El ticket de un corte (JORNADA §5, C5 y R4): el Z lo manda solo a la impresora de recibos; aquí se ve
 * cómo va y se reimprime. Sin impresora, el corte ya está sellado y el ticket se imprime después.
 */
export function TicketDelCorte({ corteId }: { corteId: string }) {
  const { trabajos, releer } = useCola();
  const [enviando, setEnviando] = useState(false);
  const hay = trabajos.some((t) => t.corteId === corteId);
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line px-3 py-2">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Ticket del corte</span>
      {hay ? <EstadoDeImpresion corteId={corteId} /> : <p className="text-[12.5px] text-ink-2">Todavía no se mandó a imprimir.</p>}
      <Button
        surface="tablet"
        variant="neutral"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true);
          const r = await imprimirCorte({ corteId }).catch(() => null);
          setEnviando(false);
          if (!r) avisar.error("No se pudo hablar con el servidor.");
          else if (!r.ok) avisar.error(r.mensaje);
          else {
            avisar.info(hay ? "Copia del ticket enviada a la impresora" : "Ticket enviado a la impresora");
            void releer();
          }
        }}
      >
        <Printer size={15} aria-hidden="true" />
        {enviando ? "Enviando…" : hay ? "Reimprimir el ticket" : "Imprimir el ticket"}
      </Button>
    </div>
  );
}
