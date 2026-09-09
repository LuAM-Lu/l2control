"use client";

import { useCallback, useMemo, useState } from "react";
import { Baby, OctagonAlert, TimerReset, Users } from "lucide-react";
import { ConnectionBadge, EmptyState, ScannerField, StatTile } from "@l2/ui";
import { ParkChildCard } from "./ParkChildCard";
import type { SessionCardModel } from "./view-model";

/**
 * Monitor de parque — F5-08.
 *
 * Nivel 3 (§9.4): conoce el dominio. Se lee a distancia, se opera con las
 * manos ocupadas, y el estado se comunica por color + icono + texto.
 */
export function ParkMonitor({
  models,
  serverNow,
  capacityLimit,
  rateValue,
  rateCapturedAt,
  shiftLabel,
}: {
  models: readonly SessionCardModel[];
  serverNow: number;
  capacityLimit: number;
  rateValue: string;
  rateCapturedAt: string;
  shiftLabel: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // F5-10: pasar la pulsera abre el perfil del niño, desde cualquier pantalla
  // del monitor y sin foco previo en un campo.
  const handleScan = useCallback(
    (code: string) => {
      const match = models.find((m) => m.wristbandCode.toUpperCase() === code.toUpperCase());
      setSelected(match ? match.id : null);
    },
    [models],
  );

  const counts = useMemo(
    () => ({
      total: models.length,
      expired: models.filter((m) => m.status === "VENCIDA").length,
      warning: models.filter((m) => m.status === "POR_VENCER" || m.status === "EN_GRACIA").length,
    }),
    [models],
  );

  const remaining = Math.max(0, capacityLimit - counts.total);
  const capacityTone = remaining === 0 ? "crit" : remaining <= 3 ? "warn" : "idle";

  // Lo que exige atención va arriba: vencidos primero, y dentro de cada
  // grupo, el que venció hace más tiempo.
  const ordered = useMemo(() => {
    const weight: Record<string, number> = { VENCIDA: 0, EN_GRACIA: 1, POR_VENCER: 2, ACTIVA: 3 };
    return [...models].sort(
      (a, b) => (weight[a.status] ?? 9) - (weight[b.status] ?? 9) || a.targetMs - b.targetMs,
    );
  }, [models]);

  return (
    <div className="flex min-h-dvh flex-col bg-base">
      {/* Barra permanente (§8.5): turno, aforo, estado y tasa vigente con su
          origen y su hora. El operador no debe tener que buscar nada de esto. */}
      <header className="sticky top-0 z-10 border-b border-line bg-base/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1600px] px-6 py-4">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div>
              <h1 className="font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink">
                Monitor de parque
              </h1>
              <p className="mt-1.5 flex items-center gap-2 text-[13px] text-ink-3">
                <span>Abby Kingdom</span>
                <span aria-hidden="true">·</span>
                <span>{shiftLabel}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
              <StatTile
                label="En sala"
                value={counts.total}
                suffix={`/ ${capacityLimit}`}
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

              <div className="h-9 w-px self-center bg-line" aria-hidden="true" />

              {/* ADR-005: la tasa vigente, su origen y su hora, siempre a la
                  vista. El operador debe poder ver con qué tasa está cobrando
                  sin ir a buscarla. */}
              <StatTile label={`Tasa BCV · ${rateCapturedAt}`} value={rateValue} suffix="Bs" />

              <div className="self-center pb-1">
                <ConnectionBadge level="N0" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <div className="mb-6">
          <ScannerField onScan={handleScan} />
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            icon={<Baby size={32} aria-hidden="true" />}
            title="No hay niños en sala"
            hint="Al escanear una pulsera en la entrada, la estancia aparecerá aquí con su cronómetro."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] items-stretch gap-4">
            {ordered.map((model) => (
              <ParkChildCard
                key={model.id}
                model={model}
                serverNow={serverNow}
                selected={selected === model.id}
                onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1600px] px-6 pb-6">
        <p className="border-t border-line pt-4 text-xs text-ink-3">
          Prototipo de la fase 5 con datos de ejemplo. El cronómetro se calcula contra el instante del
          servidor (ADR-010): cambiar el reloj de este dispositivo mueve lo que se ve, nunca lo que se
          cobra.
        </p>
      </footer>
    </div>
  );
}
