"use client";

import { CheckCircle2, HandHeart, TimerReset, TriangleAlert, OctagonAlert, UtensilsCrossed } from "lucide-react";
import {
  CountdownDisplay,
  Initial,
  Marquesina,
  MoneyDisplay,
  StatusCard,
  TimeBar,
  type Tone,
  cn,
} from "@l2/ui";
import { formatDuration, isWristbandless, type SessionStatus } from "@l2/domain-park";
import { enPausa, msEnPausa, nombreVisible, type SessionCardModel } from "./view-model";

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
  ahora,
  selected,
  onSelect,
  hora,
  densidad = "normal",
}: {
  model: SessionCardModel;
  /** La hora del servidor según el reloj de la sala (`useAhoraDeLaSala`, B4-13): todas las tarjetas laten con ella. */
  ahora: number;
  selected?: boolean;
  onSelect: (id: string) => void;
  /** Configurable por sucursal (F5-08b); 24 h por defecto. */
  /** La hora como la quiere el local (F5-08b): `useHora()` de la sucursal. */
  hora: (epochMs: number) => string;
  /**
   * Con la sala llena la tarjeta completa no cabe: treinta niños a 1366×768
   * piden una baldosa de una línea (§8.8). Lo esencial —quién, en qué estado
   * y cuánto le queda— sigue ahí; el detalle está a un toque, en la ficha.
   */
  densidad?: "normal" | "compacta";
}) {
  // El reloj es el de la sala: cifra, barra y estado laten juntos en todas las tarjetas.
  const now = ahora;
  // La pausa por comida (B4-7): mientras dura, el reloj no corre (el objetivo se corre lo que lleva en pausa)
  // y la tarjeta lo dice con su icono y lo que le queda. No es un color de estado: es una espera.
  const pausado = enPausa(model.pausa, now);
  const target = model.targetMs + msEnPausa(model.pausa, now);
  const enGracia = !pausado && model.status === "EN_GRACIA";
  const status = pausado
    ? { tone: "brand" as const, label: `En pausa · ${formatDuration(model.pausa!.fin - now)}`, icon: UtensilsCrossed, urgent: false }
    : enGracia
      ? // M-37: la gracia dice lo que le queda, y la tarjeta es ámbar sólido (por vencer queda en tinte).
        { ...STATUS.EN_GRACIA, label: `En gracia · ${formatDuration(Math.max(0, target + model.graceMs - now))}` }
      : STATUS[model.status];
  // Por vencer, un tinte; en gracia, el bloque ámbar sólido: tres escalones que se distinguen de un vistazo.
  const fondo = enGracia ? "border-state-warn bg-state-warn-bg" : !pausado && model.status === "POR_VENCER" ? "bg-state-warn-bg/25" : undefined;
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
          fondo,
          selected && "ring-2 ring-brand ring-offset-2 ring-offset-base",
        )}
      >
        <Icon
          size={16}
          aria-hidden="true"
          className={cn("shrink-0", ETIQUETA[status.tone], status.urgent && "l2-pulse")}
        />
        <span className="min-w-0 flex-1">
          <Marquesina className="font-display text-[15px] leading-tight font-bold text-ink">{nombreVisible(model)}</Marquesina>
          <span
            className={cn(
              // truncate: con una cuenta de horas (01:50:26) la cifra ensancha
              // y la etiqueta se partía en dos líneas.
              "block truncate text-[10.5px] font-semibold tracking-[0.08em] uppercase",
              ETIQUETA[status.tone],
            )}
          >
            {status.label}
          </span>
        </span>
        <CountdownDisplay
          now={now}
          targetMs={target}
          direction={model.direction}
          format={formatDuration}
          size="sm"
          className={colorCifra}
        />
      </button>
    );
  }

  const elapsed = Math.max(0, now - model.startedAt - msEnPausa(model.pausa, now));
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
      leading={<Initial name={nombreVisible(model)} tone={status.tone} />}
      title={nombreVisible(model)}
      // Sin nombre, el título ya es la pulsera (y el pie también): el subtítulo dice lo que falta en
      // vez de repetirla.
      subtitle={
        model.childNickname && model.childName
          ? model.childName
          : model.childName || model.childNickname
            ? model.wristbandCode
            : "Falta nombre"
      }
      // `exactOptionalPropertyTypes` distingue «ausente» de «explícitamente
      // undefined»: una tarjeta está seleccionada o no lo está, no hay un
      // tercer estado.
      selected={selected ?? false}
      onClick={() => onSelect(model.id)}
      {...(fondo ? { className: fondo } : {})}
      footer={
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-1.5 text-[11px] whitespace-nowrap text-ink-3">
            {/* El código de la pulsera es de un solo uso: identifica esta
                estancia, no al niño (§6.6). Sin pulsera (B4-8), se dice: a ese niño se le reconoce por su nombre. */}
            {isWristbandless(model.wristbandCode) ? (
              <span className="flex items-center gap-1 font-semibold text-brand" title={model.wristbandCode}>
                <HandHeart size={12} aria-hidden="true" />
                Sin pulsera
              </span>
            ) : (
              <span className="tnum font-mono">{model.wristbandCode}</span>
            )}
            <span aria-hidden="true">·</span>
            {/* Hora de entrada, discreta: responde «¿desde cuándo está?» sin
                competir con el cronómetro, que es el dato principal. */}
            <span className="tnum">entró {hora(model.startedAt)}</span>
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
      <div className="flex flex-wrap items-end justify-between gap-x-2 min-w-0">
        <CountdownDisplay
          now={now}
          targetMs={target}
          direction={model.direction}
          format={formatDuration}
          size="md"
          className={
            model.status === "VENCIDA"
              ? "text-state-crit min-w-0 shrink-0"
              : model.status === "POR_VENCER" || model.status === "EN_GRACIA"
                ? "text-state-warn min-w-0 shrink-0"
                : "text-ink min-w-0 shrink-0"
          }
        />
        <span className="pb-1 text-[10px] font-medium tracking-[0.09em] text-ink-3 uppercase min-w-0">
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
