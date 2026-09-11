"use client";

import { useState } from "react";
import { Activity, Pause, Play, Square, X } from "lucide-react";
import { cn } from "@l2/ui";
import { describir } from "./describir.ts";
import { ESCENARIOS } from "./escenarios.ts";
import { useSimulacion } from "./SimulacionProvider.tsx";

/**
 * Mandos del simulador — F1-19.
 *
 * Una tarjeta flotante y NO modal: el objetivo es mirar las pantallas
 * mientras la tarde avanza, así que no puede taparlas ni bloquearlas.
 * Plegada es una píldora con la hora simulada; desplegada, elige escenario,
 * velocidad y cuenta lo último que pasó.
 */

const HORA = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Caracas",
});
const VELOCIDADES = [1, 10, 60] as const;

export function PanelSimulacion() {
  const sim = useSimulacion();
  const [abierto, setAbierto] = useState(false);

  if (process.env.NEXT_PUBLIC_SIMULADOR === "off") return null;

  const esc = sim.escenario;
  const progreso = esc
    ? Math.min(1, Math.max(0, (sim.simNow - Date.parse(esc.inicio)) / (esc.duracionMin * 60_000)))
    : 0;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          "fixed right-4 bottom-4 z-40 flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] shadow-lift",
          "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          sim.activa
            ? "border-brand/50 bg-surface text-ink"
            : "border-line bg-surface/90 text-ink-2 hover:text-ink",
        )}
      >
        <Activity size={15} aria-hidden="true" className={sim.activa ? "text-brand" : undefined} />
        {sim.activa ? (
          <span className="tnum">
            Simulación · {HORA.format(sim.simNow)} ×{sim.velocidad}
            {sim.pausado && " · en pausa"}
          </span>
        ) : (
          "Simulador"
        )}
      </button>
    );
  }

  return (
    <section
      aria-label="Simulador de operación"
      className="fixed right-4 bottom-4 z-40 flex max-h-[75dvh] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-card)] border border-line-strong bg-surface shadow-lift"
    >
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display flex items-center gap-2 text-[15px] font-bold text-ink">
            <Activity size={15} className="text-brand" aria-hidden="true" />
            Simulador de operación
          </h2>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Solo para demostración: nada de lo que muestra es real.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Plegar el simulador"
          className="grid size-11 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        {/* escenarios */}
        <ul className="flex flex-col gap-1.5" aria-label="Escenarios">
          {ESCENARIOS.map((e) => {
            const elegido = esc?.id === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => sim.iniciar(e.id)}
                  className={cn(
                    "flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                    "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    elegido ? "border-brand bg-brand/12" : "border-line bg-base hover:border-line-strong",
                  )}
                >
                  <span className="text-[13px] font-semibold text-ink">
                    <span className="font-mono text-[11px] text-ink-3">{e.id}</span> {e.nombre}
                  </span>
                  <span className="text-[11.5px] leading-snug text-ink-3">{e.descripcion}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {esc && (
          <>
            {/* reloj y mandos */}
            <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base/50 p-3">
              <div className="flex items-baseline justify-between">
                <span className="tnum font-display text-2xl font-bold text-ink">
                  {HORA.format(sim.simNow)}
                </span>
                <span className="text-[11.5px] text-ink-3">
                  {sim.control ? "esta pestaña lleva el reloj" : "siguiendo otra pestaña"}
                </span>
              </div>
              <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${Math.round(progreso * 100)}%` }}
                />
              </span>

              <div className="mt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={sim.alternarPausa}
                  disabled={!sim.control}
                  aria-label={sim.pausado ? "Reanudar" : "Pausar"}
                  className="grid size-11 cursor-pointer place-content-center rounded-[var(--radius-control)] border border-line bg-surface text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sim.pausado ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                </button>
                <div className="flex flex-1 gap-1" role="group" aria-label="Velocidad">
                  {VELOCIDADES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={sim.velocidad === v}
                      disabled={!sim.control}
                      onClick={() => sim.cambiarVelocidad(v)}
                      className={cn(
                        "tnum min-h-11 flex-1 cursor-pointer rounded-[var(--radius-control)] border text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        sim.velocidad === v
                          ? "border-brand bg-brand/12 font-semibold text-ink"
                          : "border-line bg-surface text-ink-2 hover:text-ink",
                      )}
                    >
                      ×{v}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={sim.detener}
                  aria-label="Detener la simulación"
                  className="grid size-11 cursor-pointer place-content-center rounded-[var(--radius-control)] border border-line bg-surface text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit"
                >
                  <Square size={15} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* registro */}
            <div>
              <h3 className="mb-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                Lo último que pasó
              </h3>
              {sim.estado.registro.length === 0 ? (
                <p className="text-[12.5px] text-ink-3">Todavía nada: la tarde acaba de empezar.</p>
              ) : (
                <ol className="flex flex-col gap-1" aria-live="polite">
                  {sim.estado.registro.slice(0, 7).map((ev) => (
                    <li key={ev.id} className="flex gap-2 text-[12.5px]">
                      <span className="tnum shrink-0 text-ink-3">{HORA.format(Date.parse(ev.at))}</span>
                      <span className="min-w-0 text-ink-2">{describir(ev, sim.estado)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Abre otras pantallas en otras pestañas: todas siguen la misma simulación.
        </p>
      </div>
    </section>
  );
}
