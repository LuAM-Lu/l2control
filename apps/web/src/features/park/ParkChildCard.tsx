"use client";

import { CheckCircle2, TimerReset, TriangleAlert, OctagonAlert } from "lucide-react";
import {
  CountdownDisplay,
  Initial,
  MoneyDisplay,
  StatusCard,
  TimeBar,
  type Tone,
  useServerClock,
  cn,
} from "@l2/ui";
import { formatDuration, type SessionStatus } from "@l2/domain-park";
import type { SessionCardModel } from "./view-model";
import { formatClock, DEFAULT_TIME_FORMAT, type TimeFormat } from "./time-format.ts";

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
  timeFormat = DEFAULT_TIME_FORMAT,
  densidad = "normal",
}: {
  model: SessionCardModel;
  serverNow: number;
  selected?: boolean;
  onSelect: (id: string) => void;
  /** Configurable por sucursal (F5-08b); 24 h por defecto. */
  timeFormat?: TimeFormat;
  /**
   * Con la sala llena la tarjeta completa no cabe: treinta niños a 1366×768
   * piden una baldosa de una línea (§8.8). Lo esencial —quién, en qué estado
   * y cuánto le queda— sigue ahí; el detalle está a un toque, en la ficha.
   */
  densidad?: "normal" | "compacta";
}) {
  // Un solo reloj por tarjeta: cifra y barra laten juntas.
  const now = useServerClock(serverNow);
  const status = STATUS[model.status];
  const Icon = status.icon;

  const colorCifra =
    model.status === "VENCIDA"
      ? "text-state-crit"
      : model.status === "POR_VENCER" || model.status === "EN_GRACIA"
        ? "text-state-warn"
        : "text-ink";

  if (densidad === "compacta") {
    return (
      <button
        type="button"
        onClick={() => onSelect(model.id)}
        aria-pressed={selected ?? false}
        className={cn(
          "flex h-full w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-[var(--radius-card)]",
          "border border-l-4 px-3 py-2.5 text-left shadow-card",
          "transition-[transform,border-color] duration-[var(--dur-normal)] ease-[var(--ease-salida)] hover:-translate-y-0.5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          BALDOSA[status.tone],
          selected && "ring-2 ring-brand ring-offset-2 ring-offset-base",
        )}
      >
        <Icon
          size={16}
          aria-hidden="true"
          className={cn("shrink-0", ETIQUETA[status.tone], status.urgent && "l2-pulse")}
        />
        <span className="min-w-0 flex-1">
          <span className="font-display block truncate text-[15px] leading-tight font-bold text-ink">
            {model.childNickname ?? model.childName}
          </span>
          <span
            className={cn(
              "block text-[10.5px] font-semibold tracking-[0.08em] uppercase",
              ETIQUETA[status.tone],
            )}
          >
            {status.label}
          </span>
        </span>
        <CountdownDisplay
          now={now}
          targetMs={model.targetMs}
          direction={model.direction}
          format={formatDuration}
          size="sm"
          className={colorCifra}
        />
      </button>
    );
  }

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
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-1.5 text-[11px] whitespace-nowrap text-ink-3">
            {/* El código de la pulsera es de un solo uso: identifica esta
                estancia, no al niño (§6.6). */}
            <span className="tnum font-mono">{model.wristbandCode}</span>
            <span aria-hidden="true">·</span>
            {/* Hora de entrada, discreta: responde «¿desde cuándo está?» sin
                competir con el cronómetro, que es el dato principal. */}
            <span className="tnum">entró {formatClock(model.startedAt, timeFormat)}</span>
          </span>
          {model.hasOverdueCharge ? (
            <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-[11px] text-ink-2">Excedente</span>
              <MoneyDisplay
                value={model.overdueAmount}
                currency={model.overdueCurrency}
                size="sm"
                tone="negative"
              />
            </span>
          ) : (
            <span className="shrink-0 text-[11px] whitespace-nowrap text-ink-3">
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

/** Baldosa compacta: el estado va en el borde izquierdo y en el fondo. */
const BALDOSA: Record<Tone, string> = {
  ok: "border-line border-l-state-ok bg-surface",
  warn: "border-state-warn/40 border-l-state-warn bg-state-warn-bg/40",
  crit: "border-state-crit/50 border-l-state-crit bg-state-crit-bg/50",
  idle: "border-line border-l-state-idle bg-surface",
  brand: "border-brand/30 border-l-brand bg-surface",
};

const ETIQUETA: Record<Tone, string> = {
  ok: "text-state-ok",
  warn: "text-state-warn",
  crit: "text-state-crit",
  idle: "text-ink-2",
  brand: "text-brand",
};
