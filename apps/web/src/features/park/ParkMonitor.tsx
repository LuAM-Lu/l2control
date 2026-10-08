"use client";

import { useCallback, useMemo, useState } from "react";
import { Baby, OctagonAlert, TimerReset, Users, NotebookPen, Link2, WifiOff, TriangleAlert, ClipboardList, Plus, UtensilsCrossed, Play } from "lucide-react";
import { WristbandCodeSchema } from "@l2/contracts";
import { Container, EmptyState, ScannerField, Sheet, cn, formatMoneyVE, avisar, Button, useMediaQuery, useServerClock } from "@l2/ui";
import Link from "next/link";
import type { Route } from "next";
import { toMajor } from "@l2/domain-money";
import { can } from "@l2/domain-identity";
import { nombreDeCuenta, pendiente } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useOperacion } from "../operacion/OperacionProvider.tsx";
import { ParkChildCard } from "./ParkChildCard";
import { enPausa, nombreVisible, toMonitorModel } from "./view-model";
import { useSala } from "./SalaProvider.tsx";
import { nombrarEstancia, pausarEstancia } from "./parque.acciones";
import { RecargarTiempo } from "./RecargarTiempo.tsx";
import { EstanciasARevisar } from "./EstanciasARevisar.tsx";
import { useTarifario } from "./TarifarioProvider";
import { useHora, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { BotonCamara, LectorCamara } from "../lector/LectorCamara";
import { useActorEnSesion } from "../identity/sesion.ts";
import { PonerNombre } from "./PonerNombre.tsx";
import { VincularAMesa } from "./VincularAMesa.tsx";
import { vincularPulseras } from "../mesas/mesas.acciones.ts";
import { formatDuration } from "@l2/domain-park";

/**
 * Monitor de parque — F5-08.
 *
 * Nivel 3 (§9.4): conoce el dominio. Se lee a distancia, se opera con las
 * manos ocupadas, y el estado se comunica por color + icono + texto.
 *
 * La sala es del servidor (B4-2): cada niño, su familia y su cuenta llegan de la base con la hora del
 * servidor, y los ve igual cualquier equipo.
 */
const SALA_VACIA = { serverNow: 0, capacityLimit: 1, shiftLabel: "", rateValue: null, rateSource: null, rateConfirmed: false, cards: [] };

export function ParkMonitor() {
  const op = useOperacion();
  const { sala, sinConexion, refrescar } = useSala();
  const { tarifario } = useTarifario();
  const [recargando, setRecargando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const huerfanas = sala?.huerfanas ?? [];
  const model = useMemo(() => (sala ? toMonitorModel(sala) : SALA_VACIA), [sala]);
  const [selected, setSelected] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const actor = useActorEnSesion();
  const puedeVincular = actor !== null && can(actor, "parque.vincularMesa") !== "DENEGADO";
  const puedeCerrarHuerfanas = actor !== null && can(actor, "parque.cerrarHuerfana") === "PERMITIDO";

  const [poniendoNombre, setPoniendoNombre] = useState(false);
  const [vinculandoAMesa, setVinculandoAMesa] = useState(false);

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

  const { cuentas, adoptar: adoptarCuenta } = useCuentas();
  // En el teléfono de la monitora (V-2) la tarjeta completa ocupa la pantalla entera por niño: allí
  // siempre baldosas, una por renglón. En el panel, solo con la sala llena.
  const telefono = useMediaQuery("(max-width: 767px)");
  const compacta = telefono || ordered.length > 10;
  const hora = useHora();
  const { horasHuerfana } = useSucursal().ajustes;
  /** La cámara del teléfono como lector (V-2): pasar la pulsera abre la ficha del niño. */
  const [camara, setCamara] = useState(false);
  const ficha = selected ? (model.cards.find((c) => c.id === selected) ?? null) : null;
  const cuentaFicha = ficha ? (cuentas.find((c) => c.id === ficha.accountId) ?? null) : null;
  const familiaRegistrada = ficha?.guardianName ?? null;
  const estanciaFicha = ficha ? (sala?.sessions.find((s) => s.id === ficha.id) ?? null) : null;

  const mesaActual = ficha ? (cuentas.find((c) => c.kind === "MESA" && (c.status === "ABIERTA" || c.status === "POR_COBRAR") && c.sessionIds.includes(ficha.id)) ?? null) : null;

  /**
   * La pausa por comida (B4-7, M-27): una por visita, hasta el máximo de la sucursal. El estado se mira con el
   * reloj del servidor en cada pintado de la ficha; lo decide el servidor al pedirla.
   */
  const [pausando, setPausando] = useState(false);
  const ahoraFicha = useServerClock(model.serverNow);
  const pausaFicha = ficha?.pausa ?? null;
  async function pausar(accion: "PAUSAR" | "REANUDAR") {
    if (!ficha) return;
    setPausando(true);
    const r = await pausarEstancia({ idempotencyKey: crypto.randomUUID(), sessionId: ficha.id, accion }).catch(() => null);
    setPausando(false);
    if (!r) {
      avisar.error("Sin conexión con el servidor: la pausa no se registró.");
      return;
    }
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    avisar.ok(
      accion === "PAUSAR" ? `${nombreVisible(ficha)} en pausa: su tiempo no corre` : `${nombreVisible(ficha)}: su tiempo vuelve a correr`,
      accion === "PAUSAR" && r.valor.pausa ? { detalle: `Hasta ${r.valor.pausa.maxMin} minutos; después corre solo. Una pausa por visita.` } : undefined,
    );
    void refrescar();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Las cifras de sala van grandes y solas: se leen de un vistazo, en el teléfono de la
          monitora (V-2) o en el panel. El título «Monitor de parque» sobraba: la pestaña «Sala» de
          la barra ya dice dónde estás. En el teléfono, las tres en una fila. */}
      <header className="border-b border-line">
        <h1 className="sr-only">Monitor de parque</h1>
        <Container ancho="muro" className="flex flex-wrap items-start gap-x-14 gap-y-3 py-2.5 max-md:grid max-md:grid-cols-3 max-md:gap-x-3">
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
            etiquetaCorta="Cumplido"
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

      <Container as="main" ancho="muro" className="flex min-h-0 flex-1 flex-col py-4 max-md:py-3">
        <div className="mb-3 shrink-0">
          <div className="flex items-stretch gap-2">
            <ScannerField onScan={handleScan} validate={validarPulsera} className="min-w-0 flex-1" />
            <BotonCamara activa={camara} onCambiar={setCamara} />
          </div>
          {camara && <LectorCamara onCerrar={() => setCamara(false)} className="mt-3 h-[30dvh] max-h-72 md:h-56" />}
          {scanError && (
            <p role="status" className="mt-2 text-[13px] text-state-warn">
              {scanError}
            </p>
          )}
        </div>

        {huerfanas.length > 0 && (
          <button
            type="button"
            onClick={() => setRevisando(true)}
            className="mb-3 flex w-full shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-2.5 text-left text-[13px] text-state-warn"
          >
            <ClipboardList size={15} aria-hidden="true" />
            {huerfanas.length === 1 ? "1 estancia a revisar" : `${huerfanas.length} estancias a revisar`}: abiertas desde otro día o con más de {horasHuerfana} horas. No cuentan en el aforo.
            <span className="ml-auto font-semibold underline">Ver</span>
          </button>
        )}
        {sinConexion && sala && (
          <p role="status" className="mb-3 flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-2.5 text-[13px] text-state-warn">
            <WifiOff size={15} aria-hidden="true" />
            Sin conexión con el servidor: la sala puede estar atrasada. Se vuelve a intentar sola.
          </p>
        )}
        {!sala ? (
          <EmptyState
            icon={<TriangleAlert size={32} aria-hidden="true" />}
            title="No se pudo leer la sala"
            hint="El servidor no respondió o no hay tarifario publicado. Se vuelve a intentar sola; si sigue así, avisa a administración."
          />
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={<Baby size={32} aria-hidden="true" />}
            title="No hay niños en sala"
            hint="Al registrar una entrada, la estancia aparecerá aquí con su cronómetro, en cualquier equipo."
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
                  hora={hora}
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
        onCerrar={() => {
          setSelected(null);
          setPoniendoNombre(false);
          setVinculandoAMesa(false);
          setRecargando(false);
        }}
        titulo={ficha ? nombreVisible(ficha) : ""}
        {...(ficha
          ? {
              descripcion: `${ficha.childNickname && ficha.childName ? `${ficha.childName} · ` : ""}${ficha.wristbandCode} · entró ${hora(ficha.startedAt)}`,
            }
          : {})}
        pie={
          ficha && !poniendoNombre && !recargando && (
            <div className="flex flex-col gap-2 w-full">
              {/* Dos por fila: con cuatro en una, el texto se partía en tres líneas y los iconos no se veían. */}
              <div className="grid grid-cols-2 gap-2">
                {ficha.contractedMinutes !== null && (
                  <Button variant="neutral" className="w-full" onClick={() => setRecargando(true)}>
                    <Plus size={17} aria-hidden="true" />
                    Recargar tiempo
                  </Button>
                )}
                {pausaFicha === null ? (
                  <Button variant="neutral" className="w-full" disabled={pausando} onClick={() => void pausar("PAUSAR")}>
                    <UtensilsCrossed size={17} aria-hidden="true" />
                    Pausa por comida
                  </Button>
                ) : enPausa(pausaFicha, ahoraFicha) ? (
                  <Button variant="neutral" className="w-full" disabled={pausando} onClick={() => void pausar("REANUDAR")}>
                    <Play size={17} aria-hidden="true" />
                    Terminar la pausa
                  </Button>
                ) : null}
                <Button
                  variant="neutral"
                  className="w-full"
                  onClick={() => setPoniendoNombre(true)}
                >
                  <NotebookPen size={17} aria-hidden="true" />
                  {ficha.childName ? "Corregir el nombre" : "Poner nombre"}
                </Button>

                {puedeVincular && !mesaActual && (
                  <Button
                    variant="neutral"
                    className="w-full"
                    onClick={() => setVinculandoAMesa(true)}
                  >
                    <Link2 size={17} aria-hidden="true" />
                    Vincular a una mesa
                  </Button>
                )}
              </div>
              <Link
                href={`/salida?pulsera=${ficha.wristbandCode}` as Route}
                className="flex min-h-14 w-full items-center justify-center rounded-[var(--radius-control)] bg-brand px-5 text-base font-semibold text-on-brand no-underline transition-colors hover:bg-brand-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand mt-2"
              >
                Registrar su salida
              </Link>
            </div>
          )
        }
      >
        {ficha && poniendoNombre && (
          <PonerNombre
            sessionId={ficha.id}
            nombreActual={ficha.childName}
            apodoActual={ficha.childNickname}
            onGuardar={async (cmd) => {
              const r = await nombrarEstancia(cmd).catch(() => null);
              if (!r) avisar.error("Sin conexión con el servidor: el nombre no se guardó.");
              else if (!r.ok) avisar.error(r.mensaje);
              else {
                setPoniendoNombre(false);
                void refrescar();
              }
            }}
            onCancelar={() => setPoniendoNombre(false)}
          />
        )}
        {ficha && recargando && (
          <RecargarTiempo
            sessionId={ficha.id}
            paquetes={tarifario.packages}
            onCancelar={() => setRecargando(false)}
            onHecha={(cuenta) => {
              adoptarCuenta(cuenta);
              setRecargando(false);
              void refrescar();
            }}
          />
        )}
        {ficha && !poniendoNombre && !recargando && (
          <dl className="flex flex-col gap-3 text-[14px]">
            {mesaActual && (
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <dt className="text-ink-3">En la mesa</dt>
                <dd className="font-semibold text-ink">{mesaActual.tableLabel ?? "?"}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-3">Tiempo</dt>
              <dd className="text-ink">
                {ficha.packageName} · {ficha.contractedMinutes ? `${ficha.contractedMinutes} min` : "tiempo abierto"}
              </dd>
            </div>
            {(estanciaFicha?.recargas.length ?? 0) > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-3">Recargas</dt>
                <dd className="tnum text-right text-ink">
                  {estanciaFicha!.recargas.map((r) => `+${r.minutes} min`).join(" · ")}
                </dd>
              </div>
            )}
            {pausaFicha && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-3">Pausa por comida</dt>
                <dd className="tnum text-right text-ink">
                  {enPausa(pausaFicha, ahoraFicha)
                    ? `En curso · quedan ${formatDuration(pausaFicha.fin - ahoraFicha)}`
                    : `Usada · ${Math.max(1, Math.round((pausaFicha.fin - pausaFicha.inicio) / 60_000))} min`}
                </dd>
              </div>
            )}
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
            ) : familiaRegistrada ? (
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <dt className="text-ink-3">Representante</dt>
                <dd className="text-ink">{familiaRegistrada}</dd>
              </div>
            ) : (
              <p className="border-t border-line pt-3 text-[13px] text-state-warn">
                Esta estancia no tiene cuenta: su salida no se podrá cerrar hasta resolverlo.
              </p>
            )}
          </dl>
        )}
      </Sheet>

      <EstanciasARevisar
        abierto={revisando && huerfanas.length > 0}
        onCerrar={() => setRevisando(false)}
        huerfanas={huerfanas}
        puedeCerrar={puedeCerrarHuerfanas}
        hora={hora}
        onCerrada={() => void refrescar()}
      />

      {ficha && (
        <VincularAMesa
          abierto={vinculandoAMesa}
          onCerrar={() => setVinculandoAMesa(false)}
          sesionId={ficha.id}
          estado={op.estado}
          cuentas={cuentas}
          onVincular={async (cuenta, sessionIds) => {
            const r = await vincularPulseras({ idempotencyKey: crypto.randomUUID(), tableId: cuenta.tableId!, cuentaId: cuenta.id, sessionIds });
            if (!r.ok) {
              avisar.error(r.mensaje);
              return false;
            }
            adoptarCuenta(r.valor.mesa);
            for (const f of r.valor.familias) adoptarCuenta(f);
            avisar.ok(`${sessionIds.length === 1 ? "Niño vinculado" : "Niños vinculados"} · ${nombreDeCuenta(r.valor.mesa)}`, {
              detalle: "Su parque pasa a la cuenta de la mesa: la familia paga todo junto.",
            });
            return true;
          }}
        />
      )}
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
  etiquetaCorta,
  valor,
  sufijo,
  tono,
  icono,
  urgente = false,
  barra,
}: {
  etiqueta: string;
  /** Para el teléfono, donde las tres cifras van en una fila de 360 px y la larga se cortaba. */
  etiquetaCorta?: string;
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
        {etiquetaCorta ? (
          <>
            <span className="truncate md:hidden">{etiquetaCorta}</span>
            <span className="truncate max-md:hidden">{etiqueta}</span>
          </>
        ) : (
          <span className="truncate">{etiqueta}</span>
        )}
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
