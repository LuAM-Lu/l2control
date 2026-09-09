"use client";

import { useCallback, useMemo, useState } from "react";
import { Baby, OctagonAlert, TimerReset, Users } from "lucide-react";
import { WristbandCodeSchema } from "@l2/contracts";
import { EmptyState, ScannerField, StatTile } from "@l2/ui";
import { ParkChildCard } from "./ParkChildCard";
import type { MonitorModel } from "./view-model";

/**
 * Monitor de parque — F5-08.
 *
 * Nivel 3 (§9.4): conoce el dominio. Se lee a distancia, se opera con las
 * manos ocupadas, y el estado se comunica por color + icono + texto.
 */
export function ParkMonitor({ model }: { model: MonitorModel }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // F5-10: pasar la pulsera abre el perfil del niño, desde cualquier pantalla
  // del monitor y sin foco previo en un campo.
  const handleScan = useCallback(
    (code: string) => {
      const match = model.cards.find((c) => c.wristbandCode === code);
      setSelected(match ? match.id : null);
      setScanError(match ? null : `La pulsera ${code} no está activa en sala`);
    },
    [model.cards],
  );

  // La misma regla que usa el servidor: una sola definición (§9.7).
  const validarPulsera = useCallback(
    (code: string) => WristbandCodeSchema.safeParse(code).success,
    [],
  );

  const counts = useMemo(
    () => ({
      total: model.cards.length,
      expired: model.cards.filter((c) => c.status === "VENCIDA").length,
      warning: model.cards.filter((c) => c.status === "POR_VENCER" || c.status === "EN_GRACIA")
        .length,
    }),
    [model.cards],
  );

  const remaining = Math.max(0, model.capacityLimit - counts.total);
  const capacityTone = remaining === 0 ? "crit" : remaining <= 3 ? "warn" : "idle";

  // Lo que exige atención va arriba: vencidos primero, y dentro de cada
  // grupo, el que venció hace más tiempo.
  const ordered = useMemo(() => {
    const weight: Record<string, number> = { VENCIDA: 0, EN_GRACIA: 1, POR_VENCER: 2, ACTIVA: 3 };
    return [...model.cards].sort(
      (a, b) => (weight[a.status] ?? 9) - (weight[b.status] ?? 9) || a.targetMs - b.targetMs,
    );
  }, [model.cards]);

  return (
    <div className="flex flex-1 flex-col">
      {/* Barra permanente (§8.5): turno, aforo, estado y tasa vigente con su
          origen y su hora. El operador no debe tener que buscar nada de esto. */}
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-[1600px] px-6 py-4">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div>
              <h1 className="font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink">
                Monitor de parque
              </h1>
            </div>

            <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
              <StatTile
                label="En sala"
                value={counts.total}
                suffix={`/ ${model.capacityLimit}`}
                tone={capacityTone}
                icon={<Users size={11} aria-hidden="true" />}
              />
              <StatTile
                label="Cumplidos"
                value={counts.expired}
                tone={counts.expired > 0 ? "crit" : "idle"}
                urgent={counts.expired > 0}
                icon={<OctagonAlert size={11} aria-hidden="true" />}
              />
              <StatTile
                label="Por vencer"
                value={counts.warning}
                tone={counts.warning > 0 ? "warn" : "idle"}
                icon={<TimerReset size={11} aria-hidden="true" />}
              />

            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <div className="mb-6">
          <ScannerField onScan={handleScan} validate={validarPulsera} />
          {scanError && (
            <p role="status" className="mt-2 text-[13px] text-state-warn">
              {scanError}
            </p>
          )}
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            icon={<Baby size={32} aria-hidden="true" />}
            title="No hay niños en sala"
            hint="Al escanear una pulsera en la entrada, la estancia aparecerá aquí con su cronómetro."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] items-stretch gap-4">
            {ordered.map((card) => (
              <ParkChildCard
                key={card.id}
                model={card}
                serverNow={model.serverNow}
                selected={selected === card.id}
                onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1600px] px-6 pb-6">
        <p className="border-t border-line pt-4 text-xs text-ink-3">
          Prototipo de la fase 5 con datos de ejemplo derivados del contrato. El cronómetro se
          calcula contra el instante del servidor (ADR-010): cambiar el reloj de este dispositivo
          mueve lo que se ve, nunca lo que se cobra.
        </p>
      </footer>
    </div>
  );
}
