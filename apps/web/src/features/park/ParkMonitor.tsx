"use client";

import { useCallback, useMemo, useState } from "react";
import { Baby, OctagonAlert, TimerReset, Users } from "lucide-react";
import { WristbandCodeSchema } from "@l2/contracts";
import { Container, EmptyState, ScannerField, cn } from "@l2/ui";
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
      {/* Las cifras de sala se leen a dos metros, así que van grandes y solas.
          El título «Monitor de parque» sobraba: la pestaña «Sala» de la barra
          ya dice dónde estás, y el título ocupaba el sitio de las cifras. */}
      <header className="border-b border-line">
        <h1 className="sr-only">Monitor de parque</h1>
        <Container ancho="muro" className="flex flex-wrap items-start gap-x-14 gap-y-3 py-3.5">
          <Contador
            etiqueta="En sala"
            valor={counts.total}
            sufijo={`de ${model.capacityLimit}`}
            tono={capacityTone}
            icono={<Users size={14} aria-hidden="true" />}
            barra={Math.round((counts.total / Math.max(1, model.capacityLimit)) * 100)}
          />
          <Contador
            etiqueta="Tiempo cumplido"
            valor={counts.expired}
            tono={counts.expired > 0 ? "crit" : "idle"}
            urgente={counts.expired > 0}
            icono={<OctagonAlert size={14} aria-hidden="true" />}
          />
          <Contador
            etiqueta="Por vencer"
            valor={counts.warning}
            tono={counts.warning > 0 ? "warn" : "idle"}
            icono={<TimerReset size={14} aria-hidden="true" />}
          />
        </Container>
      </header>

      <Container as="main" ancho="muro" className="flex-1 py-6">
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
      </Container>

      <Container as="footer" ancho="muro" className="pb-6">
        <p className="border-t border-line pt-4 text-xs text-ink-3">
          Prototipo de la fase 5 con datos de ejemplo derivados del contrato. El cronómetro se
          calcula contra el instante del servidor (ADR-010): cambiar el reloj de este dispositivo
          mueve lo que se ve, nunca lo que se cobra.
        </p>
      </Container>
    </div>
  );
}

const TONO_CIFRA = {
  ok: "text-state-ok",
  warn: "text-state-warn",
  crit: "text-state-crit",
  idle: "text-ink",
} as const;

/**
 * Contador de sala. Color + icono + texto, nunca solo color (§8.2): la
 * etiqueta toma el color del estado junto con su icono, y cuando el valor es
 * cero vuelve a neutro — un «0» en rojo sería una alarma falsa.
 */
function Contador({
  etiqueta,
  valor,
  sufijo,
  tono,
  icono,
  urgente = false,
  barra,
}: {
  etiqueta: string;
  valor: number;
  sufijo?: string;
  tono: keyof typeof TONO_CIFRA;
  icono: React.ReactNode;
  urgente?: boolean;
  barra?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.09em] uppercase",
          tono === "idle" ? "text-ink-3" : TONO_CIFRA[tono],
        )}
      >
        <span className="shrink-0">{icono}</span>
        <span className="truncate">{etiqueta}</span>
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={cn(
            "tnum font-display text-[clamp(2rem,3.4vw,2.75rem)] leading-none font-bold tracking-tight",
            TONO_CIFRA[tono],
            urgente && "l2-pulse",
          )}
        >
          {valor}
        </span>
        {sufijo && <span className="tnum text-[15px] text-ink-3">{sufijo}</span>}
      </span>
      {barra !== undefined && (
        <span
          aria-hidden="true"
          className="block h-1 w-full max-w-48 overflow-hidden rounded-full bg-surface-2"
        >
          <span
            className={cn(
              "block h-full rounded-full",
              barra >= 100 ? "bg-state-crit" : barra >= 90 ? "bg-state-warn" : "bg-state-ok",
            )}
            style={{ width: `${Math.min(barra, 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}
