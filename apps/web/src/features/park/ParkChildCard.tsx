"use client";

import { CheckCircle2, TimerReset, AlertTriangle, OctagonAlert } from "lucide-react";
import { CountdownDisplay, MoneyDisplay, StatusCard, type Tone } from "@l2/ui";
import { formatDuration, type SessionStatus } from "@l2/domain-park";
import type { SessionCardModel } from "./view-model";

/**
 * Nivel 3 — funcionalidad (§9.4). Conoce el dominio del parque y por eso
 * vive aquí y no en `@l2/ui`.
 *
 * §8.5: debe leerse A DOS METROS. Nombre grande, cronómetro en cifras
 * tabulares, y el estado comunicado por color + icono + texto — nunca solo
 * por color.
 */

const STATUS: Record<
  SessionStatus,
  { tone: Tone; label: string; icon: typeof CheckCircle2; urgent: boolean }
> = {
  ACTIVA: { tone: "ok", label: "En tiempo", icon: CheckCircle2, urgent: false },
  POR_VENCER: { tone: "warn", label: "Por vencer", icon: TimerReset, urgent: false },
  EN_GRACIA: { tone: "warn", label: "En gracia", icon: AlertTriangle, urgent: false },
  VENCIDA: { tone: "crit", label: "Tiempo cumplido", icon: OctagonAlert, urgent: true },
};

export function ParkChildCard({
  model,
  serverNow,
  highlighted,
  onSelect,
}: {
  model: SessionCardModel;
  serverNow: number;
  highlighted?: boolean;
  onSelect: (id: string) => void;
}) {
  const status = STATUS[model.status];
  const Icon = status.icon;

  return (
    <StatusCard
      tone={status.tone}
      title={model.childNickname ?? model.childName}
      subtitle={model.childNickname ? model.childName : undefined}
      statusLabel={status.label}
      statusIcon={<Icon size={13} aria-hidden="true" />}
      urgent={status.urgent}
      onClick={() => onSelect(model.id)}
      className={highlighted ? "ring-2 ring-brand ring-offset-2 ring-offset-base" : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="tnum font-mono text-xs text-ink-3">{model.wristbandCode}</span>
          {model.hasOverdueCharge ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-ink-2">Excedente</span>
              <MoneyDisplay
                value={model.overdueAmount}
                currency={model.overdueCurrency}
                size="sm"
                tone="negative"
              />
            </span>
          ) : (
            <span className="text-xs text-ink-3">
              {model.contractedMinutes ? `Paquete ${model.contractedMinutes} min` : "Tiempo abierto"}
            </span>
          )}
        </div>
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <CountdownDisplay
          serverNow={serverNow}
          targetMs={model.targetMs}
          direction={model.direction}
          format={formatDuration}
          size="md"
          className={
            model.status === "VENCIDA"
              ? "text-state-crit"
              : model.status === "POR_VENCER" || model.status === "EN_GRACIA"
                ? "text-state-warn"
                : "text-ink"
          }
        />
        <span className="text-xs font-medium tracking-wide text-ink-3 uppercase">
          {model.mode === "PREPAGO" ? "restante" : "acumulado"}
        </span>
      </div>
    </StatusCard>
  );
}
