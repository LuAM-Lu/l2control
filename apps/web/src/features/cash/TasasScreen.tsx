"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, History, AlertTriangle } from "lucide-react";
import { useTasas, useTasaVigente } from "./TasasProvider.tsx";
import { formatTasaVE } from "./tasa-format.ts";
import { useAhoraLocal } from "../simulacion/SimulacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { currentRate, needsDoubleCheck } from "@l2/domain-rates";
import {
  Container,
  PageHeader,
  Button,
  Input,
  Sheet,
  cn,
  avisar,
} from "@l2/ui";
import {
  type RatePair,
  type RateSource,
  type ExchangeRateDto,
} from "@l2/contracts";

const formatDate = (iso: string) => {
  const t = new Date(Date.parse(iso));
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Caracas",
  }).format(t);
};

export function TasasScreen({
  puedeConfirmar,
  actorName,
}: {
  puedeConfirmar: boolean;
  actorName: string;
}) {
  const { historial, aplicar } = useTasas();
  const { tasa: tasaUSD } = useTasaVigente("USD/VES");
  const { tasa: tasaUSDT } = useTasaVigente("USDT/VES");
  // 12 h o 24 h lo fija la sucursal, no esta pantalla (F5-08b).
  const { ajustes } = useSucursal();
  const hora = (iso: string) =>
    formatClock(Date.parse(iso), ajustes.formatoHora);

  const [pair, setPair] = useState<RatePair>("USD/VES");
  const [source, setSource] = useState<RateSource>("BCV");
  const [value, setValue] = useState("");

  const [confirmando, setConfirmando] = useState<ExchangeRateDto | null>(null);

  const handleCapturar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      avisar.aviso("Escribe el valor de la tasa antes de capturarla");
      return;
    }

    const err = aplicar({
      kind: "CAPTURAR",
      pair,
      source,
      value: value.trim(),
      capturedBy: actorName,
    });

    if (err) {
      avisar.error(err);
    } else {
      avisar.ok("Tasa capturada, pendiente por confirmar");
      setValue("");
    }
  };

  const historialOrdenado = useMemo(() => {
    return [...historial.tasas].sort((a, b) => {
      return Date.parse(b.capturedAt) - Date.parse(a.capturedAt);
    });
  }, [historial.tasas]);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Caja" },
          { texto: "Tasas de cambio" },
        ]}
        titulo="Tasas de cambio"
        descripcion="Administración de tasas del día. Sin tasa confirmada no se puede cobrar en la moneda correspondiente."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section
          aria-label="Tasas vigentes"
          className="flex min-w-0 flex-col gap-5"
        >
          {/* TASA USD */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h3 className="font-display mb-3 text-[14px] font-bold text-ink">
              USD / VES
            </h3>
            {tasaUSD ? (
              <div>
                <div className="tnum text-3xl font-bold text-ink mb-1">
                  Bs. {formatTasaVE(tasaUSD.value)}
                </div>
                <div className="text-[12.5px] text-ink-2">
                  {tasaUSD.source} · capturada a las {hora(tasaUSD.capturedAt)}
                </div>
              </div>
            ) : (
              <div className="rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-[13px] font-medium text-state-crit flex items-center gap-2">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>No hay tasa confirmada. No se puede cobrar en USD.</span>
              </div>
            )}
          </div>

          {/* TASA USDT */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h3 className="font-display mb-3 text-[14px] font-bold text-ink">
              USDT / VES
            </h3>
            {tasaUSDT ? (
              <div>
                <div className="tnum text-3xl font-bold text-ink mb-1">
                  Bs. {formatTasaVE(tasaUSDT.value)}
                </div>
                <div className="text-[12.5px] text-ink-2">
                  {tasaUSDT.source} · capturada a las{" "}
                  {hora(tasaUSDT.capturedAt)}
                </div>
              </div>
            ) : (
              // El USDT no bloquea nada: hoy se cobra a la par del dólar, así
              // que la falta de tasa propia es un dato, no una alarma.
              <div className="rounded-[var(--radius-control)] border border-line px-3 py-2.5 text-[13px] text-ink-2">
                Sin tasa propia. Hoy el USDT se cobra{" "}
                <span className="font-medium text-ink">a la par del dólar</span>{" "}
                (DEC-1, a la espera del contador): capturarla aquí no cambia el
                cobro.
              </div>
            )}
          </div>

          {/* FORMULARIO DE CAPTURA */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h3 className="font-display mb-4 text-[14px] font-bold text-ink">
              Capturar tasa del día
            </h3>
            <form onSubmit={handleCapturar} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink-2">
                  Par
                </label>
                <select
                  className="flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
                  value={pair}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setPair(e.target.value as RatePair)
                  }
                >
                  <option value="USD/VES">USD / VES</option>
                  <option value="USDT/VES">USDT / VES</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink-2">
                  Origen
                </label>
                <select
                  className="flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
                  value={source}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSource(e.target.value as RateSource)
                  }
                >
                  <option value="BCV">BCV</option>
                  <option value="MANUAL">MANUAL</option>
                  <option value="COMERCIAL">COMERCIAL</option>
                </select>
              </div>

              <Input
                surface="admin"
                label="Valor"
                placeholder="Ej. 228.41"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />

              <Button
                type="submit"
                variant="primary"
                surface="admin"
                className="mt-2 w-full"
              >
                Capturar
              </Button>
            </form>
          </div>
        </section>

        <section aria-label="Historial" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2 mb-2">
            <History size={16} className="text-ink-2" />
            <h3 className="font-display text-[15px] font-bold text-ink">
              Historial
            </h3>
          </div>

          <ul className="flex flex-col gap-2">
            {historialOrdenado.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--radius-card)] border bg-surface p-4 shadow-card",
                  t.confirmed ? "border-line" : "border-brand/40 bg-surface-2",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-bold text-ink tnum">
                      Bs. {formatTasaVE(t.value)}
                    </span>
                    <span className="text-[12px] font-medium text-ink-2 bg-line/30 px-1.5 py-0.5 rounded">
                      {t.pair}
                    </span>
                    <span className="text-[12px] font-medium text-ink-2 bg-line/30 px-1.5 py-0.5 rounded">
                      {t.source}
                    </span>
                  </div>

                  <div className="mt-1.5 text-[12.5px] text-ink-3">
                    Capturada el {formatDate(t.capturedAt)} a las{" "}
                    {hora(t.capturedAt)}
                    {/* Sin firma no se inventa una: se calla. */}
                    {t.capturedBy ? (
                      <>
                        {" "}
                        por{" "}
                        <span className="font-medium text-ink-2">
                          {t.capturedBy}
                        </span>
                      </>
                    ) : null}
                  </div>

                  {t.confirmed ? (
                    <div className="mt-1 text-[12.5px] text-state-ok flex items-center gap-1.5">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>
                        Confirmada por {t.confirmedBy}
                        {t.confirmedAt ? ` a las ${hora(t.confirmedAt)}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[12.5px] text-state-warn font-medium flex items-center gap-1.5">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span>Pendiente por confirmar</span>
                    </div>
                  )}
                </div>

                {!t.confirmed && puedeConfirmar && (
                  <Button
                    type="button"
                    variant="primary"
                    surface="admin"
                    className="shrink-0"
                    onClick={() => setConfirmando(t)}
                  >
                    Confirmar
                  </Button>
                )}
              </li>
            ))}
          </ul>

          <p className="text-[12.5px] text-ink-3 text-center mt-4">
            No se puede editar ni borrar una tasa. Si hay un error, capture una
            nueva.
          </p>
        </section>
      </div>

      {confirmando && (
        <HojaConfirmar
          tasa={confirmando}
          onCerrar={() => setConfirmando(null)}
          onGuardar={(val) => {
            const err = aplicar({
              kind: "CONFIRMAR",
              rateId: confirmando.id,
              confirmadaPor: actorName,
              valorVerificado: val,
            });
            if (err) return err;
            avisar.ok("Tasa confirmada y vigente");
            setConfirmando(null);
            return null;
          }}
        />
      )}
    </Container>
  );
}

function HojaConfirmar({
  tasa,
  onCerrar,
  onGuardar,
}: {
  tasa: ExchangeRateDto;
  onCerrar: () => void;
  onGuardar: (valor?: string) => string | null;
}) {
  const { historial } = useTasas();
  const ahora = useAhoraLocal();
  const [valorVerificado, setValorVerificado] = useState("");
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  // Quién decide si hace falta teclear el valor otra vez es el dominio, no
  // esta hoja: el proveedor comprueba lo mismo antes de aplicar el mando.
  const vigente = currentRate(
    historial.tasas,
    tasa.pair,
    new Date(ahora).toISOString(),
  );
  const requiere = needsDoubleCheck(
    vigente,
    tasa,
    historial.umbralVariacionBasisPoints,
  );

  const handleGuardar = () => {
    const error = onGuardar(requiere ? valorVerificado.trim() : undefined);
    if (error) {
      setErrorGlobal(error);
    }
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Confirmar tasa de cambio"
      descripcion={
        requiere
          ? "Esta tasa se aparta demasiado de la anterior o no hay registro previo. Por seguridad, teclea el valor otra vez para confirmar."
          : `Confirma que ${tasa.value} es el valor correcto para ${tasa.pair}.`
      }
      pie={
        <div className="flex gap-2">
          <Button
            surface="tablet"
            variant="ghost"
            onClick={onCerrar}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            surface="tablet"
            variant="primary"
            onClick={handleGuardar}
            className="flex-1 gap-1.5"
          >
            <Check size={16} />
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {errorGlobal && (
          <div className="rounded-[var(--radius-card)] bg-state-crit-bg/40 p-3 text-[13px] font-medium text-state-crit">
            {errorGlobal}
          </div>
        )}

        <div className="rounded-[var(--radius-control)] border border-line p-4">
          <div className="text-[12px] text-ink-3 uppercase font-bold tracking-wider mb-1">
            Valor a confirmar
          </div>
          <div className="tnum text-2xl font-bold text-ink">
            Bs. {formatTasaVE(tasa.value)}
          </div>
        </div>

        {requiere && (
          <Input
            surface="tablet"
            label="Teclea el valor de nuevo"
            placeholder="Ej. 228.41"
            value={valorVerificado}
            onChange={(e) => {
              setValorVerificado(e.target.value);
              setErrorGlobal(null);
            }}
          />
        )}
      </div>
    </Sheet>
  );
}
