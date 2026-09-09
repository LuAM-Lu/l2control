"use client";

import { useCallback, useMemo, useState } from "react";
import { Baby, Users } from "lucide-react";
import { Badge, ConnectionBadge, EmptyState, ScannerField } from "@l2/ui";
import { ParkChildCard } from "./ParkChildCard";
import type { SessionCardModel } from "./view-model";

/**
 * Monitor de parque — F5-08.
 *
 * Nivel 3 (§9.4): conoce el dominio. Se lee a distancia, se opera con las
 * manos ocupadas y el estado se comunica por color + icono + texto.
 */
export function ParkMonitor({
  models,
  serverNow,
  capacityLimit,
  rateValue,
  rateCapturedAt,
}: {
  models: readonly SessionCardModel[];
  serverNow: number;
  capacityLimit: number;
  rateValue: string;
  rateCapturedAt: string;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // F5-10: pasar la pulsera abre el perfil del niño, desde cualquier
  // pantalla del monitor y sin foco previo en un campo.
  const handleScan = useCallback(
    (code: string) => {
      const match = models.find((m) => m.wristbandCode.toUpperCase() === code.toUpperCase());
      setHighlighted(match ? match.id : null);
    },
    [models],
  );

  const counts = useMemo(() => {
    return {
      total: models.length,
      expired: models.filter((m) => m.status === "VENCIDA").length,
      warning: models.filter((m) => m.status === "POR_VENCER" || m.status === "EN_GRACIA").length,
    };
  }, [models]);

  const remaining = Math.max(0, capacityLimit - counts.total);
  const capacityTone = remaining === 0 ? "crit" : remaining <= 3 ? "warn" : "idle";

  // Los vencidos primero: lo que exige atención va arriba.
  const ordered = useMemo(() => {
    const weight: Record<string, number> = { VENCIDA: 0, EN_GRACIA: 1, POR_VENCER: 2, ACTIVA: 3 };
    return [...models].sort(
      (a, b) => (weight[a.status] ?? 9) - (weight[b.status] ?? 9) || a.targetMs - b.targetMs,
    );
  }, [models]);

  return (
    <div className="min-h-dvh bg-base">
      {/* Barra permanente (§8.5): turno, tasa vigente con origen y hora, y
          estado de conexión. El operador no debe tener que buscar nada de esto. */}
      <header className="sticky top-0 z-10 border-b border-line bg-base/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl font-bold text-ink">Monitor de parque</h1>
            <span className="text-sm text-ink-3">Abby Kingdom</span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <Badge tone={capacityTone} icon={<Users size={13} aria-hidden="true" />}>
              <span className="tnum">
                Aforo {counts.total}/{capacityLimit}
              </span>
            </Badge>

            {counts.expired > 0 && (
              <Badge tone="crit">
                <span className="tnum">{counts.expired} con tiempo cumplido</span>
              </Badge>
            )}
            {counts.warning > 0 && (
              <Badge tone="warn">
                <span className="tnum">{counts.warning} por vencer</span>
              </Badge>
            )}

            {/* ADR-005: la tasa vigente, su origen y su hora, siempre visibles.
                El operador debe poder ver con qué tasa está cobrando. */}
            <Badge tone="idle">
              <span className="tnum">Bs {rateValue}</span>
              <span className="font-normal text-ink-3">· BCV {rateCapturedAt}</span>
            </Badge>

            <ConnectionBadge level="N0" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
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
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {ordered.map((model) => (
              <ParkChildCard
                key={model.id}
                model={model}
                serverNow={serverNow}
                highlighted={highlighted === model.id}
                onSelect={setHighlighted}
              />
            ))}
          </div>
        )}

        <p className="mt-8 border-t border-line pt-4 text-xs text-ink-3">
          Prototipo de la fase 5 con datos de ejemplo. El cronómetro se calcula contra el instante del
          servidor (ADR-010): cambiar el reloj de este dispositivo mueve lo que se ve, nunca lo que se
          cobra.
        </p>
      </main>
    </div>
  );
}
