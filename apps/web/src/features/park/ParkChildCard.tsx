"use client";

import { CheckCircle2, TimerReset, TriangleAlert, OctagonAlert } from "lucide-react";
import {
  CountdownDisplay,
  Initial,
  MoneyDisplay,
  StatusCard,
  TimeBar,
  useServerClock,
  type Tone,
} from "@l2/ui";
import { formatDuration, type SessionStatus } from "@l2/domain-park";
import type { SessionCardModel } from "./view-model";

/**
 * Nivel 3 — funcionalidad (§9.4). Conoce el dominio del parque y por eso vive
 * aquí y no en `@l2/ui`.
 *
 * §8.5: debe leerse A DOS METROS. La jerarquía es deliberada — el cronómetro
 * es el elemento más grande porque es el dato que se consulta; el nombre va
 * segundo; la barra da el contexto sin necesidad de leer nada.
 */

const STATUS: Record<
  SessionStatus,
  { tone: Tone; label: string; icon: typeof CheckCircle2; urgent: boolean }
> = {
  ACTIVA: { tone: "ok", label: "En tiempo", icon: CheckCircle2, urgent: false },
  POR_VENCER: { tone: "warn", label: "Por vencer", icon: TimerReset, urgent: false },
  EN_GRACIA: { tone: "warn", label: "En gracia", icon: TriangleAlert, urgent: false },
  VENCIDA: { tone: "crit", label: "Tiempo cumplido", icon: OctagonAlert, urgent: true },
};

export function ParkChildCard({
  model,
  serverNow,
  selected,
  onSelect,
}: {
  model: SessionCardModel;
  serverNow: number;
  selected?: boolean;
  onSelect: (id: string) => void;
}) {
  // Un solo reloj por tarjeta: cifra y barra laten juntas.
  const now = useServerClock(serverNow);
  const status = STATUS[model.status];
  const Icon = status.icon;

  const elapsed = Math.max(0, now - model.startedAt);
  const total = model.totalMs;

  // Ratio para la barra. Es presentación, no reglas de negocio: el cobro del
  // excedente lo calcula `@l2/domain-park`, nunca este componente.
  const progress = total ? Math.min(1, elapsed / total) : 0;
  const overflow = total && elapsed > total ? Math.min(1, (elapsed - total) / total) : 0;

  return (
    <StatusCard
      tone={status.tone}
      statusLabel={status.label}
      statusIcon={<Icon size={12} aria-hidden="true" />}
      urgent={status.urgent}
      leading={<Initial name={model.childNickname ?? model.childName} tone={status.tone} />}
      title={model.childNickname ?? model.childName}
      subtitle={model.childNickname ? model.childName : model.wristbandCode}
      // `exactOptionalPropertyTypes` distingue «ausente» de «explícitamente
      // undefined»: una tarjeta está seleccionada o no lo está, no hay un
      // tercer estado.
      selected={selected ?? false}
      onClick={() => onSelect(model.id)}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="tnum font-mono text-[11px] text-ink-3">{model.wristbandCode}</span>
          {model.hasOverdueCharge ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-[11px] text-ink-2">Excedente</span>
              <MoneyDisplay
                value={model.overdueAmount}
                currency={model.overdueCurrency}
                size="sm"
                tone="negative"
              />
            </span>
          ) : (
            <span className="text-[11px] text-ink-3">
              {model.contractedMinutes ? `${model.contractedMinutes} min` : "Tiempo abierto"}
            </span>
          )}
        </div>
      }
    >
      <div className="flex items-end justify-between gap-2">
        <CountdownDisplay
          now={now}
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
        <span className="pb-1 text-[10px] font-medium tracking-[0.09em] text-ink-3 uppercase">
          {model.mode === "PREPAGO" ? "restante" : "acumulado"}
        </span>
      </div>

      {total ? (
        <TimeBar
          progress={progress}
          overflow={overflow}
          tone={status.tone}
          label="Consumido"
          value={`${Math.round(progress * 100)}%`}
        />
      ) : (
        // Postpago: no hay objetivo contra el que medir. Una barra llena diría
        // "se acabó el tiempo", que es justo lo contrario.
        <TimeBar progress={0} indeterminate label="Sin límite" value="se cobra al salir" />
      )}
    </StatusCard>
  );
}
