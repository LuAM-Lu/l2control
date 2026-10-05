"use client";

import { useState } from "react";
import { CircleCheckBig, ClipboardCheck } from "lucide-react";
import type { CargaDePapelDto } from "@l2/contracts";
import { Button } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { EstadoDeCarga, RegistrosDePapel } from "./RegistrosDePapel.tsx";
import { RevisionDePapel } from "./RevisionDePapel.tsx";

/**
 * Lo que espera revisión en la sucursal — B3-7, JORNADA §5. Para supervisión y administración: cada carga
 * terminada con lo que trae, y su botón de revisar. Una que todavía se está cargando se ve, pero no se
 * revisa hasta que la cajera la termina.
 */
export function PorRevisar({ cargas, onHecho }: { cargas: readonly CargaDePapelDto[]; onHecho: () => void }) {
  const reloj = useReloj();
  const [revisando, setRevisando] = useState<CargaDePapelDto | null>(null);

  if (cargas.length === 0) {
    return (
      <section className="flex flex-col items-start gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-state-ok">
          <CircleCheckBig size={17} aria-hidden="true" />
          Nada por revisar: no hay cargas desde papel esperando.
        </p>
        <p className="text-[12.5px] text-ink-3">Cuando una cajera termine de cargar lo que anotó en papel, aparece aquí.</p>
      </section>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {cargas.map((c) => (
        <section key={c.id} aria-label={`Carga de ${c.punto}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 font-display text-[15px] font-bold text-ink">
                {c.punto}
                <EstadoDeCarga estado={c.estado} />
              </h2>
              <p className="tnum mt-0.5 text-[12.5px] text-ink-2">
                Cargó {c.abiertaPor} · corte de {reloj.diaYHora(Date.parse(c.desde))} a {reloj.hora(Date.parse(c.hasta))}
                {c.nota ? ` · ${c.nota}` : ""}
              </p>
            </div>
            <Button surface="tablet" variant="primary" className="gap-1.5" disabled={c.estado !== "CERRADA"} onClick={() => setRevisando(c)}>
              <ClipboardCheck size={15} aria-hidden="true" />
              {c.estado === "CERRADA" ? "Revisar" : "Todavía cargando"}
            </Button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink-2 hover:text-ink">
              {c.registros.length} {c.registros.length === 1 ? "registro" : "registros"}
            </summary>
            <RegistrosDePapel registros={c.registros} className="mt-1" />
          </details>
        </section>
      ))}
      <RevisionDePapel
        carga={revisando}
        onCerrar={() => setRevisando(null)}
        onHecho={() => {
          setRevisando(null);
          onHecho();
        }}
      />
    </div>
  );
}
