"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock3, History, ShieldCheck } from "lucide-react";
import type { ExchangeRateDto, RatePair, RateSource } from "@l2/contracts";
import { addDays, calendarDay, currentRate, needsDoubleCheck } from "@l2/domain-rates";
import type { Permission } from "@l2/domain-identity";
import { Button, Container, Input, PageHeader, Sheet, avisar, cn } from "@l2/ui";
import { useDiaDeTasas, useTasas, useTasaVigente } from "./TasasProvider.tsx";
import { formatTasaVE } from "./tasa-format.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";

/** Días por delante que se ofrecen al capturar. El servidor impone el mismo límite. */
const DIAS_POR_ADELANTADO = 7;

/** Un día `AAAA-MM-DD` en palabras: «sáb 26 sept». Es fecha de calendario: se pinta en UTC. */
const FECHA = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function enPalabras(dia: string): string {
  const partes = FECHA.formatToParts(Date.parse(`${dia}T12:00:00.000Z`));
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value.replace(".", "") ?? "";
  // Sin los puntos de las abreviaturas, que en medio de una frase se leen como fin de frase.
  return `${de("weekday")} ${de("day")} ${de("month")}`;
}

const ORIGEN: Readonly<Record<RateSource, string>> = { BCV: "BCV", MANUAL: "Manual", COMERCIAL: "Comercial" };

/**
 * La tasa como se teclea en Venezuela, al formato del contrato. Con coma, la coma es el decimal
 * y los puntos son miles («1.234,56»); sin coma, el punto es el decimal («228.41»).
 */
function normalizar(texto: string): string {
  const t = texto.trim().replace(/\s/g, "");
  return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
}

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function TasasScreen({
  permiso,
  autorizadores,
}: {
  /** Lo que la matriz da a quien opera para `tasa.confirmar` (supervisión: con autorización). */
  permiso: Permission;
  autorizadores: { id: string; nombre: string }[];
}) {
  const { historial, capturar } = useTasas();
  const hoy = useDiaDeTasas();
  const { ajustes } = useSucursal();
  const hora = (iso: string) => formatClock(Date.parse(iso), ajustes.formatoHora);
  const puede = permiso !== "DENEGADO";

  const [pair, setPair] = useState<RatePair>("USD/VES");
  const [source, setSource] = useState<RateSource>("BCV");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [errorValor, setErrorValor] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState<ExchangeRateDto | null>(null);

  const dias = useMemo(
    () => (hoy ? Array.from({ length: DIAS_POR_ADELANTADO + 1 }, (_, i) => addDays(hoy, i)) : []),
    [hoy],
  );
  const diaElegido = dia ?? hoy;

  const handleCapturar = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = normalizar(valor);
    if (!value) {
      setErrorValor("Escribe el valor de la tasa");
      return;
    }
    if (!diaElegido) return;
    setEnviando(true);
    try {
      const r = await capturar({ pair, source, value, effectiveDate: diaElegido });
      if (r.ok) {
        avisar.ok(`Tasa capturada para el ${enPalabras(diaElegido)}: falta confirmarla`);
        setValor("");
        setErrorValor(undefined);
      } else {
        const campo = r.problemas?.find((p) => p.path[0] === "value");
        if (campo) setErrorValor("Solo dígitos, con coma o punto para los decimales, y distinta de cero");
        else avisar.error(r.mensaje);
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. La tasa no se capturó.");
    } finally {
      setEnviando(false);
    }
  };

  const historialOrdenado = useMemo(
    () => [...historial.tasas].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)),
    [historial.tasas],
  );

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Caja" }, { texto: "Tasas de cambio" }]}
        titulo="Tasas de cambio"
        descripcion="La caja cobra solo con la tasa del día, confirmada. Sin ella no se cobra en bolívares: nunca con la de ayer ni con un valor por defecto."
        meta={
          hoy && (
            <span className="tnum text-[12.5px] text-ink-3">Hoy es {enPalabras(hoy)} (hora de Venezuela)</span>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section aria-label="Tasas del día" className="flex min-w-0 flex-col gap-4">
          <TarjetaVigente pair="USD/VES" hoy={hoy} hora={hora} />
          <TarjetaVigente pair="USDT/VES" hoy={hoy} hora={hora} />

          {puede && (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
              <h2 className="font-display mb-4 text-[14px] font-bold text-ink">Capturar una tasa</h2>
              <form onSubmit={handleCapturar} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="tasas-par" className={ETIQUETA}>
                      Par
                    </label>
                    <select
                      id="tasas-par"
                      className={CAMPO}
                      value={pair}
                      onChange={(e) => setPair(e.target.value as RatePair)}
                    >
                      <option value="USD/VES">USD / VES</option>
                      <option value="USDT/VES">USDT / VES</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="tasas-origen" className={ETIQUETA}>
                      Origen
                    </label>
                    <select
                      id="tasas-origen"
                      className={CAMPO}
                      value={source}
                      onChange={(e) => setSource(e.target.value as RateSource)}
                    >
                      {(Object.keys(ORIGEN) as RateSource[]).map((s) => (
                        <option key={s} value={s}>
                          {ORIGEN[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="tasas-dia" className={ETIQUETA}>
                    Vale para
                  </label>
                  <select
                    id="tasas-dia"
                    className={CAMPO}
                    value={diaElegido ?? ""}
                    onChange={(e) => setDia(e.target.value)}
                    disabled={!hoy}
                  >
                    {dias.map((d, i) => (
                      <option key={d} value={d}>
                        {i === 0 ? "Hoy" : i === 1 ? "Mañana" : ""}
                        {i < 2 ? ", " : ""}
                        {enPalabras(d)}
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  surface="admin"
                  label="Bolívares por unidad"
                  placeholder="228,41"
                  inputMode="decimal"
                  autoComplete="off"
                  value={valor}
                  error={errorValor}
                  hint="Tal como la publica la fuente, con todos sus decimales."
                  onChange={(e) => {
                    setValor(e.target.value);
                    setErrorValor(undefined);
                  }}
                />

                <Button type="submit" variant="primary" surface="admin" className="mt-1 w-full" disabled={enviando || !hoy}>
                  {enviando ? "Capturando…" : "Capturar"}
                </Button>
                <p className="text-[12px] text-ink-3">
                  Entra sin confirmar. Hasta que alguien la confirme, la caja no la usa.
                </p>
              </form>
            </div>
          )}
        </section>

        <section aria-label="Historial" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-ink-2" aria-hidden="true" />
            <h2 className="font-display text-[15px] font-bold text-ink">Historial</h2>
          </div>

          {historialOrdenado.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              Todavía no se ha capturado ninguna tasa en este local.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {historialOrdenado.map((t) => {
                const vencida = !t.confirmed && hoy !== null && t.effectiveDate < hoy;
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "flex flex-col justify-between gap-3 rounded-[var(--radius-card)] border bg-surface p-4 shadow-card sm:flex-row sm:items-center",
                      t.confirmed || vencida ? "border-line" : "border-brand/40 bg-surface-2",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display tnum text-base font-bold text-ink">
                          Bs. {formatTasaVE(t.value)}
                        </span>
                        <span className="rounded bg-line/30 px-1.5 py-0.5 text-[12px] font-medium text-ink-2">{t.pair}</span>
                        <span className="rounded bg-line/30 px-1.5 py-0.5 text-[12px] font-medium text-ink-2">
                          {ORIGEN[t.source]}
                        </span>
                        <span className="tnum text-[12.5px] font-medium text-ink-2">
                          para el {enPalabras(t.effectiveDate)}
                          {t.effectiveDate === hoy ? " (hoy)" : ""}
                        </span>
                      </div>

                      <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
                        Capturada el {enPalabras(calendarDay(t.capturedAt, historial.zonaHoraria))} a las {hora(t.capturedAt)}
                        {t.capturedBy ? (
                          <>
                            {" "}
                            por <span className="font-medium text-ink-2">{t.capturedBy}</span>
                          </>
                        ) : null}
                      </p>

                      {t.confirmed ? (
                        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-state-ok">
                          <CheckCircle2 size={14} aria-hidden="true" />
                          <span>
                            Confirmada por {t.confirmedBy}
                            {t.confirmedAt ? ` a las ${hora(t.confirmedAt)}` : ""}
                            {t.authorizedBy ? `, con autorización de ${t.authorizedBy}` : ""}
                          </span>
                        </p>
                      ) : vencida ? (
                        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                          <Clock3 size={14} aria-hidden="true" />
                          <span>Su día pasó sin confirmarla: no se usó para cobrar</span>
                        </p>
                      ) : (
                        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-state-warn">
                          <AlertTriangle size={14} aria-hidden="true" />
                          <span>Pendiente por confirmar</span>
                        </p>
                      )}
                    </div>

                    {!t.confirmed && !vencida && puede && (
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
                );
              })}
            </ul>
          )}

          <p className="mt-2 text-center text-[12.5px] text-ink-3">
            Una tasa no se edita ni se borra. Si hay un error, se captura otra y se confirma esa.
          </p>
        </section>
      </div>

      {confirmando && (
        <HojaConfirmar
          key={confirmando.id}
          tasa={confirmando}
          conAutorizacion={permiso === "REQUIERE_AUTORIZACION"}
          autorizadores={autorizadores}
          onCerrar={() => setConfirmando(null)}
        />
      )}
    </Container>
  );
}

function TarjetaVigente({ pair, hoy, hora }: { pair: RatePair; hoy: string | null; hora: (iso: string) => string }) {
  const { historial } = useTasas();
  const { tasa } = useTasaVigente(pair);
  const pendienteDeHoy = historial.tasas.some((t) => t.pair === pair && !t.confirmed && t.effectiveDate === hoy);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <h2 className="font-display mb-3 text-[14px] font-bold text-ink">{pair.replace("/", " / ")}</h2>
      {tasa ? (
        <div>
          <p className="tnum mb-1 text-3xl font-bold text-ink">Bs. {formatTasaVE(tasa.value)}</p>
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            <CheckCircle2 size={14} className="text-state-ok" aria-hidden="true" />
            {ORIGEN[tasa.source]} · capturada a las {hora(tasa.capturedAt)}
          </p>
        </div>
      ) : pair === "USDT/VES" ? (
        // El USDT no bloquea nada: hoy se cobra a la par del dólar, así que la falta de tasa
        // propia es un dato, no una alarma.
        <p className="rounded-[var(--radius-control)] border border-line px-3 py-2.5 text-[13px] text-ink-2">
          Sin tasa propia hoy. El USDT se cobra <span className="font-medium text-ink">a la par del dólar</span> (DEC-1, a
          la espera del contador): capturarla aquí no cambia el cobro.
        </p>
      ) : (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-[13px] font-medium text-state-crit"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Sin tasa del día confirmada: la caja no cobra en bolívares.{" "}
            {pendienteDeHoy ? "Hay una pendiente: confírmala en el historial." : "Captura la de hoy y confírmala."}
          </span>
        </div>
      )}
    </div>
  );
}

function HojaConfirmar({
  tasa,
  conAutorizacion,
  autorizadores,
  onCerrar,
}: {
  tasa: ExchangeRateDto;
  conAutorizacion: boolean;
  autorizadores: { id: string; nombre: string }[];
  onCerrar: () => void;
}) {
  const { historial, confirmar } = useTasas();
  const ahora = useAhoraLocal();
  const [verificado, setVerificado] = useState("");
  const [autorizadorId, setAutorizadorId] = useState<string | null>(
    autorizadores.length === 1 ? autorizadores[0]!.id : null,
  );
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Si hace falta teclear el valor otra vez lo decide el dominio; el servidor comprueba lo mismo.
  const anterior = ahora ? currentRate(historial.tasas, tasa.pair, new Date(ahora).toISOString()) : null;
  const requiere = needsDoubleCheck(anterior, tasa, historial.umbralVariacionBasisPoints);

  const enviar = async () => {
    setError(null);
    if (requiere && !verificado.trim()) return setError("Teclea el valor otra vez para confirmar.");
    if (conAutorizacion) {
      if (!autorizadorId) return setError("Elige quién autoriza.");
      if (!/^\d{4}$/.test(pin)) return setError("Escribe el PIN de 4 dígitos de quien autoriza.");
      if (motivo.trim().length < 3) return setError("Escribe el motivo de la autorización.");
    }
    setEnviando(true);
    try {
      const r = await confirmar(
        { rateId: tasa.id, ...(requiere ? { valorVerificado: normalizar(verificado) } : {}) },
        conAutorizacion ? { autorizadorId, pin, motivo: motivo.trim() } : undefined,
      );
      if (r.ok) {
        avisar.ok(`Tasa confirmada para el ${enPalabras(tasa.effectiveDate)}`);
        onCerrar();
      } else {
        setError(r.mensaje);
        setPin("");
      }
    } catch {
      setError("No se pudo hablar con el servidor. La tasa sigue sin confirmar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Confirmar tasa de cambio"
      descripcion={
        requiere
          ? "Se aparta mucho de la anterior, o es la primera del par. Por seguridad, teclea el valor otra vez."
          : `Desde que la confirmes, la caja cobra con ella el ${enPalabras(tasa.effectiveDate)}.`
      }
      pie={
        <div className="flex gap-2">
          <Button surface="tablet" variant="ghost" onClick={onCerrar} className="flex-1">
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" onClick={enviar} disabled={enviando} className="flex-1 gap-1.5">
            <Check size={16} aria-hidden="true" />
            {enviando ? "Confirmando…" : "Confirmar"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="rounded-[var(--radius-card)] bg-state-crit-bg/40 p-3 text-[13px] font-medium text-state-crit">
            {error}
          </p>
        )}

        <div className="rounded-[var(--radius-control)] border border-line p-4">
          <p className="mb-1 text-[12px] font-bold tracking-wider text-ink-3 uppercase">
            {tasa.pair} · para el {enPalabras(tasa.effectiveDate)}
          </p>
          <p className="tnum text-2xl font-bold text-ink">Bs. {formatTasaVE(tasa.value)}</p>
          {anterior && (
            <p className="tnum mt-1 text-[12.5px] text-ink-3">La anterior confirmada: Bs. {formatTasaVE(anterior.value)}</p>
          )}
        </div>

        {requiere && (
          <Input
            surface="tablet"
            label="Teclea el valor de nuevo"
            placeholder="228,41"
            inputMode="decimal"
            autoComplete="off"
            value={verificado}
            onChange={(e) => {
              setVerificado(e.target.value);
              setError(null);
            }}
          />
        )}

        {conAutorizacion && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <ShieldCheck size={15} aria-hidden="true" />
              Supervisión confirma la tasa con la autorización de administración.
            </p>
            {autorizadores.length === 0 ? (
              <p className="text-[13px] text-state-warn">Nadie en esta sucursal puede autorizarlo ahora.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Quién autoriza</span>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quién autoriza">
                  {autorizadores.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={autorizadorId === a.id}
                      onClick={() => setAutorizadorId(a.id)}
                      className={cn(
                        "min-h-11 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        autorizadorId === a.id
                          ? "border-brand bg-brand/12 font-semibold text-ink"
                          : "border-line bg-base text-ink-2 hover:text-ink",
                      )}
                    >
                      {a.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Input
              surface="tablet"
              label="PIN de quien autoriza"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tasa-motivo" className={ETIQUETA}>
                Motivo
              </label>
              <textarea
                id="tasa-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por qué confirma supervisión"
                className="w-full resize-none rounded-[var(--radius-control)] border border-line bg-base px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand"
              />
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
