"use client";

import { Dialog } from "@l2/ui";
import { LISTA_ATAJOS } from "./atajos.ts";

/** La chuleta de atajos de la caja: se abre con «?» o con el botón de la cola. */
export function AtajosDialog({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Atajos de teclado"
      descripcion="Para el equipo del mostrador. No funcionan mientras escribes en un campo."
    >
      <dl className="flex flex-col divide-y divide-line">
        {LISTA_ATAJOS.map((a) => (
          <div key={a.teclas} className="flex items-baseline justify-between gap-4 py-2">
            <dt>
              <kbd className="tnum rounded border border-line-strong border-b-2 bg-base px-1.5 py-0.5 font-mono text-[12px] whitespace-nowrap text-ink">
                {a.teclas}
              </kbd>
            </dt>
            <dd className="text-right text-[13px] text-ink-2">{a.que}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

/** Pista de tecla en un botón. Solo donde hay puntero fino (equipo con teclado y ratón). */
export function PistaTecla({ tecla }: { tecla: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="hidden rounded border border-current/30 px-1 font-mono text-[10px] leading-4 font-semibold opacity-70 pointer-fine:inline-block"
    >
      {tecla}
    </kbd>
  );
}
