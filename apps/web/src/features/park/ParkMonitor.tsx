"use client";

import { useCallback, useMemo, useState } from "react";
import { Baby, OctagonAlert, TimerReset, Users } from "lucide-react";
import { WristbandCodeSchema } from "@l2/contracts";
import { Container, EmptyState, ScannerField, Sheet, cn, formatMoneyVE } from "@l2/ui";
import Link from "next/link";
import type { Route } from "next";
import { toMajor } from "@l2/domain-money";
import { pendiente } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { formatClock, DEFAULT_TIME_FORMAT } from "./time-format.ts";
import { monitorSimulado } from "../simulacion/monitor.ts";
import { useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import { ParkChildCard } from "./ParkChildCard";
import { nombreVisible, type MonitorModel } from "./view-model";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * Monitor de parque — F5-08.
 *
 * Nivel 3 (§9.4): conoce el dominio. Se lee a distancia, se opera con las
 * manos ocupadas, y el estado se comunica por color + icono + texto.
 */
export function ParkMonitor({ model: modeloServidor }: { model: MonitorModel }) {
  // F1-19: con una simulación en marcha, el monitor pinta la sala simulada con
  // el mismo traductor que usa para los datos del servidor.
  const sim = useSimulacion();
  const model = useMemo(() => monitorSimulado(sim) ?? modeloServidor, [sim, modeloServidor]);
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

  const { cuentas } = useCuentas();
  const compacta = ordered.length > 10;
  const { ajustes } = useSucursal();
  const ficha = selected ? (model.cards.find((c) => c.id === selected) ?? null) : null;
  const cuentaFicha = ficha
    ? (cuentas.find((c) => c.sessionIds.includes(ficha.id)) ?? null)
    : null;
  const familiaSimulada = ficha && sim.activa ? (sim.estado.familias[ficha.id] ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Las cifras de sala se leen a dos metros, así que van grandes y solas.
          El título «Monitor de parque» sobraba: la pestaña «Sala» de la barra
          ya dice dónde estás, y el título ocupaba el sitio de las cifras. */}
      <header className="border-b border-line">
        <h1 className="sr-only">Monitor de parque</h1>
        {sim.activa && (
          // Una pantalla con datos simulados lo dice: nadie debe confundirla
          // con la sala real.
          <p className="border-b border-brand/30 bg-brand/10 py-1 text-center text-[12px] font-semibold tracking-wide text-brand uppercase">
            Simulación · {model.shiftLabel.replace("Simulación · ", "")}
          </p>
        )}
        <Container ancho="muro" className="flex flex-wrap items-start gap-x-14 gap-y-3 py-2.5">
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

      <Container as="main" ancho="muro" className="flex min-h-0 flex-1 flex-col py-4">
        <div className="mb-3 shrink-0">
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
          // La rejilla se desplaza por dentro si hiciera falta; con la sala
          // llena pasa a baldosas compactas para que no haga falta (§8.8).
          <div className="-m-1 min-h-0 flex-1 overflow-y-auto p-1">
            <div
              className={cn(
                "grid items-stretch",
                compacta
                  ? "grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5"
                  : "grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-4 md:max-lg:portrait:grid-cols-3",
              )}
            >
              {ordered.map((card) => (
                <ParkChildCard
                  key={card.id}
                  model={card}
                  serverNow={model.serverNow}
                  selected={selected === card.id}
                  densidad={compacta ? "compacta" : "normal"}
                  timeFormat={ajustes.formatoHora}
                  onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
                />
              ))}
            </div>
          </div>
        )}
      </Container>

      {/* Ficha del niño: pasar su pulsera o tocar su tarjeta la abre (F5-10).
          Es una hoja y no una pantalla: el monitor sigue visible detrás, y
          desde aquí se baja un nivel, a su salida. */}
      <Sheet
        abierto={ficha !== null}
        onCerrar={() => setSelected(null)}
        titulo={ficha ? nombreVisible(ficha) : ""}
        {...(ficha
          ? {
              descripcion: `${ficha.childNickname && ficha.childName ? `${ficha.childName} · ` : ""}${ficha.wristbandCode} · entró ${formatClock(ficha.startedAt, DEFAULT_TIME_FORMAT)}`,
            }
          : {})}
        pie={
          ficha && (
            <Link
              href={`/salida?pulsera=${ficha.wristbandCode}` as Route}
              className="flex min-h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-brand px-5 text-base font-semibold text-on-brand no-underline transition-colors hover:bg-brand-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Registrar su salida
            </Link>
          )
        }
      >
        {ficha && (
          <dl className="flex flex-col gap-3 text-[14px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-3">Tiempo</dt>
              <dd className="text-ink">
                {ficha.contractedMinutes ? `${ficha.contractedMinutes} min contratados` : "Tiempo abierto"}
              </dd>
            </div>
            {ficha.hasOverdueCharge && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-state-warn">Excedente hasta ahora</dt>
                <dd className="tnum font-semibold text-state-crit">
                  {ficha.overdueCurrency} {ficha.overdueAmount}
                </dd>
              </div>
            )}
            {cuentaFicha ? (
              <>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                  <dt className="text-ink-3">Representante</dt>
                  <dd className="text-ink">{cuentaFicha.family}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Cómo paga</dt>
                  <dd className="text-ink">
                    {cuentaFicha.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Pendiente en su cuenta</dt>
                  <dd className="tnum text-ink">{formatMoneyVE(toMajor(pendiente(cuentaFicha)), "USD")}</dd>
                </div>
              </>
            ) : familiaSimulada ? (
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <dt className="text-ink-3">Representante</dt>
                <dd className="text-ink">{familiaSimulada} · simulado</dd>
              </div>
            ) : (
              <p className="border-t border-line pt-3 text-[13px] text-state-warn">
                Esta estancia no tiene cuenta: su salida no se podrá cerrar hasta resolverlo.
              </p>
            )}
          </dl>
        )}
      </Sheet>
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
