"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, CheckCircle2, Clock3, CloudDownload, Coins, DollarSign, History, Plus, ShieldCheck, Zap } from "lucide-react";
import { POR_PAGINA, type ExchangeRateDto, type FiltroTasas, type HeldReason, type PaginaDeTasasDto, type PorPagina, type RatePair, type RateSource } from "@l2/contracts";
import { addDays, calendarDay, coversDay, currentRate, needsDoubleCheck } from "@l2/domain-rates";
import type { Permission } from "@l2/domain-identity";
import { BarraDeFiltros, Button, CAMPO_DE_FILTRO, Cifra, Container, EmptyState, FiltroSegmentado, Input, Paginacion, Resumen, Sheet, avisar, cn } from "@l2/ui";
import { EncabezadoDePagina } from "../shell/MarcoDeSeccion.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { usePaginas } from "../shell/usePaginas.ts";
import { leerPaginaDeTasas } from "./tasas.acciones";
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

/** Por qué una traída del BCV no se aplicó sola (ADR-019), en palabras de quien la revisa. */
const RETENIDA: Readonly<Record<HeldReason, string>> = {
  PRIMERA: "es la primera del local",
  SALTO: "se aparta más del límite de la vigente",
  SOLO_TERCERO: "solo la dio DolarApi, no la web del BCV",
};

/** ¿Hace falta teclearla dos veces? Como el servidor; con un valor a medio escribir, todavía no. */
function pideVerificar(anterior: Parameters<typeof needsDoubleCheck>[0], value: string, umbral: number): boolean {
  try {
    return needsDoubleCheck(anterior, { value }, umbral);
  } catch {
    return false;
  }
}

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

type Consulta = Readonly<{ pagina: number; porPagina: PorPagina; filtro: FiltroTasas; par?: RatePair | undefined }>;

const FILTROS: readonly { id: FiltroTasas; nombre: string }[] = [
  { id: "TODAS", nombre: "Todas" },
  { id: "APLICADAS", nombre: "Aplicadas" },
  { id: "POR_CONFIRMAR", nombre: "Por confirmar" },
  { id: "NO_USADAS", nombre: "No usadas" },
];

const TH = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase whitespace-nowrap";
const TD = "px-3 py-2 align-middle";

export function TasasScreen({
  permiso,
  autorizadores,
  inicial,
}: {
  /** Lo que la matriz da a quien opera para `tasa.confirmar` (supervisión: con autorización). */
  permiso: Permission;
  autorizadores: { id: string; nombre: string }[];
  /** La primera página del historial, leída en el servidor. */
  inicial: PaginaDeTasasDto;
}) {
  const { historial, capturar, traer } = useTasas();
  const lista = usePaginas<Consulta, PaginaDeTasasDto>((q) => leerPaginaDeTasas(q), inicial, { pagina: 1, porPagina: 20, filtro: "TODAS" });
  // Una tasa nueva (la del BCV, la de otra estación): el historial se vuelve a leer solo.
  useAlCambiar(["tasas"], () => void lista.releer());
  const [cargando, setCargando] = useState(false);
  const usd = useTasaVigente("USD/VES").tasa;
  const usdt = useTasaVigente("USDT/VES").tasa;
  const [trayendo, setTrayendo] = useState(false);

  /** Trae la del BCV (F3-04) y cuenta lo que pasó, fuente por fuente si alguna falló. */
  const traerDelBcv = async () => {
    setTrayendo(true);
    try {
      const r = await traer();
      if (!r.ok) return avisar.error(r.mensaje);
      const caidas = r.valor.fuentes.filter((f) => !f.ok);
      for (const t of [...r.valor.capturadas, ...r.valor.aplicadas]) {
        const que = `Bs. ${formatTasaVE(t.value)} para el ${enPalabras(t.effectiveDate)}`;
        if (t.automatic) avisar.ok(`Aplicada sola: ${que}.`);
        else avisar.aviso(`Traída del BCV: ${que}. No se aplicó sola${t.heldBack ? `: ${RETENIDA[t.heldBack]}` : ""}. Revísala.`);
      }
      if (r.valor.capturadas.length === 0 && r.valor.aplicadas.length === 0 && r.valor.avisos.length === 0) {
        avisar.info(
          r.valor.yaEstaban.length > 0
            ? "El BCV no ha publicado nada nuevo: lo que publica ya está en el historial."
            : "El BCV no tiene publicada ninguna tasa que rija hoy o en los próximos días.",
        );
      }
      for (const a of r.valor.avisos) avisar.aviso(a);
      void lista.releer();
      if (caidas.length > 0) avisar.info(`No respondió: ${caidas.map((f) => f.detalle).join(" ")}`);
    } catch {
      avisar.error("No se pudo hablar con el servidor. Carga la tasa a mano.");
    } finally {
      setTrayendo(false);
    }
  };
  const hoy = useDiaDeTasas();
  const { ajustes } = useSucursal();
  const hora = (iso: string) => formatClock(Date.parse(iso), ajustes.formatoHora, ajustes.zonaHoraria);
  const puede = permiso !== "DENEGADO";

  const [pair, setPair] = useState<RatePair>("USD/VES");
  const [source, setSource] = useState<RateSource>("BCV");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [errorValor, setErrorValor] = useState<string | undefined>();
  const [verificado, setVerificado] = useState("");
  const [errorVerificado, setErrorVerificado] = useState<string | undefined>();
  /** El servidor pidió teclearla dos veces aunque aquí no se viera venir (otra estación cambió la vigente). */
  const [servidorPideVerificar, setServidorPideVerificar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState<ExchangeRateDto | null>(null);
  const ahora = useAhoraLocal();

  /** Administración la aplica al guardarla (ADR-019 §5); supervisión la deja pendiente de su 🔐. */
  const aplica = permiso === "PERMITIDO";
  const anterior = ahora ? currentRate(historial.tasas, pair, new Date(ahora).toISOString()) : null;
  const verificar =
    aplica && (servidorPideVerificar || pideVerificar(anterior, normalizar(valor), historial.umbralVariacionBasisPoints));

  const dias = useMemo(
    () => (hoy ? Array.from({ length: DIAS_POR_ADELANTADO + 1 }, (_, i) => addDays(hoy, i)) : []),
    [hoy],
  );
  /** Fechas valor pasadas que todavía rigen hoy: el fin de semana, la del viernes. */
  const pasadasVigentes = useMemo(
    () => (hoy ? [1, 2, 3, 4, 5].map((i) => addDays(hoy, -i)).filter((d) => coversDay(d, hoy, historial.feriados)) : []),
    [hoy, historial.feriados],
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
    if (verificar && !verificado.trim()) {
      setErrorVerificado("Teclea el valor otra vez");
      return;
    }
    setEnviando(true);
    try {
      const r = await capturar({
        pair,
        source,
        value,
        effectiveDate: diaElegido,
        ...(verificar ? { valorVerificado: normalizar(verificado) } : {}),
      });
      if (r.ok) {
        avisar.ok(
          r.valor.confirmed
            ? `Tasa aplicada para el ${enPalabras(diaElegido)}: desde ese día la caja cobra con ella`
            : `Tasa capturada para el ${enPalabras(diaElegido)}: falta confirmarla con autorización`,
        );
        setValor("");
        setVerificado("");
        setErrorValor(undefined);
        setErrorVerificado(undefined);
        setServidorPideVerificar(false);
        setCargando(false);
        void lista.releer();
      } else {
        const campo = r.problemas?.find((p) => p.path[0] === "value");
        const otraVez = r.problemas?.find((p) => p.path[0] === "valorVerificado");
        if (campo) setErrorValor("Solo dígitos, con coma o punto para los decimales, y distinta de cero");
        else if (otraVez) {
          setServidorPideVerificar(true);
          setVerificado("");
          setErrorVerificado(otraVez.message === "No coincide" ? "No coincide con el valor de arriba" : "Teclea el valor otra vez");
        } else avisar.error(r.mensaje);
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. La tasa no se capturó.");
    } finally {
      setEnviando(false);
    }
  };

  const { datos, consulta, cambiar, releer } = lista;
  const conteos = datos?.conteos ?? { TODAS: 0, APLICADAS: 0, POR_CONFIRMAR: 0, NO_USADAS: 0 };
  const tasas = datos?.tasas ?? [];
  const hayFiltros = consulta.filtro !== "TODAS" || consulta.par !== undefined;
  // La próxima ya aplicada para un día que viene (la de mañana, publicada por el BCV la tarde antes).
  const proxima = useMemo(
    () =>
      hoy
        ? [...historial.tasas]
            .filter((t) => t.pair === "USD/VES" && t.confirmed && t.effectiveDate > hoy)
            .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0] ?? null
        : null,
    [historial.tasas, hoy],
  );
  const vencida = (t: ExchangeRateDto) => !t.confirmed && hoy !== null && t.effectiveDate < hoy && !coversDay(t.effectiveDate, hoy, historial.feriados);
  const enQueQuedo = (t: ExchangeRateDto) =>
    t.confirmed && t.automatic ? (
      <span className="flex items-center gap-1.5 text-state-ok">
        <Zap size={13} aria-hidden="true" /> Aplicada sola{t.confirmedAt ? ` a las ${hora(t.confirmedAt)}` : ""}
      </span>
    ) : t.confirmed ? (
      <span className="flex min-w-0 items-center gap-1.5 text-state-ok">
        <CheckCircle2 size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">
          Confirmada por {t.confirmedBy}
          {t.authorizedBy ? ` (autorizó ${t.authorizedBy})` : ""}
        </span>
      </span>
    ) : vencida(t) ? (
      <span className="flex items-center gap-1.5 text-ink-3">
        <Clock3 size={13} aria-hidden="true" /> No se usó: su día pasó sin confirmarla
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-state-warn">
        <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">{t.heldBack ? `No se aplicó sola: ${RETENIDA[t.heldBack]}` : "Por confirmar"}</span>
      </span>
    );
  const confirmarBoton = (t: ExchangeRateDto, surface: "admin" | "tablet") =>
    !t.confirmed && !vencida(t) && puede ? (
      <Button type="button" variant="primary" surface={surface} onClick={() => setConfirmando(t)}>
        Confirmar
      </Button>
    ) : null;

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <EncabezadoDePagina
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Tasas de cambio" }]}
        titulo="Tasas de cambio"
        descripcion="La caja cobra con la tasa de la fecha valor de hoy (la del viernes cubre el fin de semana). La del BCV se aplica sola y llega a todas las pantallas; sin tasa vigente no se cobra en bolívares."
        meta={
          hoy && (
            <span className="tnum text-[12.5px] text-ink-3">
              Hoy es {enPalabras(hoy)} (hora de Venezuela)
              {historial.feriados.includes(hoy) ? " · feriado bancario: rige la tasa del día hábil anterior" : ""}
            </span>
          )
        }
        acciones={
          puede ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => void traerDelBcv()} disabled={trayendo}>
                <CloudDownload size={15} aria-hidden="true" />
                {trayendo ? "Consultando el BCV…" : "Traer del BCV"}
              </Button>
              <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setCargando(true)}>
                <Plus size={15} aria-hidden="true" />
                Cargar a mano
              </Button>
            </div>
          ) : undefined
        }
      />

      {historial.alertas.length > 0 && (
        <section aria-label="Alertas de la tasa" className="mb-3 flex shrink-0 flex-col gap-2">
          {historial.alertas.map((a) => {
            const tasa = a.rateId ? historial.tasas.find((t) => t.id === a.rateId) : undefined;
            return (
              <div
                key={`${a.tipo}:${a.rateId ?? a.mensaje}`}
                role={a.tono === "crit" ? "alert" : "status"}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--radius-control)] border px-3 py-2 sm:flex-row sm:items-center",
                  a.tono === "crit" ? "border-state-crit/40 bg-state-crit-bg" : "border-state-warn/40 bg-state-warn-bg",
                )}
              >
                <p className={cn("flex flex-1 items-start gap-2 text-[13px] font-medium", a.tono === "crit" ? "text-state-crit" : "text-state-warn")}>
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    {a.mensaje}
                    {tasa ? <span className="tnum"> (Bs. {formatTasaVE(tasa.value)})</span> : null}
                  </span>
                </p>
                {tasa && puede && (
                  <Button type="button" variant="primary" surface="admin" className="shrink-0" onClick={() => setConfirmando(tasa)}>
                    Revisar y confirmar
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <Resumen etiqueta="Resumen de las tasas">
        <Cifra
          etiqueta="USD / VES · hoy"
          icono={<DollarSign aria-hidden="true" />}
          tono={usd ? "idle" : "crit"}
          valor={usd ? `Bs. ${formatTasaVE(usd.value)}` : "Sin tasa vigente"}
          pie={usd ? `${ORIGEN[usd.source]} · capturada a las ${hora(usd.capturedAt)}` : "La caja no cobra en bolívares: tráela o cárgala"}
          activo={consulta.par === "USD/VES"}
          onClick={() => cambiar({ par: consulta.par === "USD/VES" ? undefined : "USD/VES" })}
        />
        <Cifra
          etiqueta="USDT / VES · hoy"
          icono={<Coins aria-hidden="true" />}
          valor={usdt ? `Bs. ${formatTasaVE(usdt.value)}` : "A la par del dólar"}
          pie={usdt ? `${ORIGEN[usdt.source]} · capturada a las ${hora(usdt.capturedAt)}` : "Sin tasa propia: se cobra como el dólar (DEC-1)"}
          activo={consulta.par === "USDT/VES"}
          onClick={() => cambiar({ par: consulta.par === "USDT/VES" ? undefined : "USDT/VES" })}
        />
        <Cifra
          etiqueta="Próxima"
          icono={<CalendarClock aria-hidden="true" />}
          valor={proxima ? `Bs. ${formatTasaVE(proxima.value)}` : "Ninguna todavía"}
          pie={proxima ? `USD / VES para el ${enPalabras(proxima.effectiveDate)}` : "La del BCV llega sola cuando la publica"}
        />
        <Cifra
          etiqueta="Por confirmar"
          icono={<ShieldCheck aria-hidden="true" />}
          tono={conteos.POR_CONFIRMAR > 0 ? "warn" : "idle"}
          valor={String(conteos.POR_CONFIRMAR)}
          pie={conteos.POR_CONFIRMAR > 0 ? "Sin confirmar no se cobra con ellas" : "Nada esperando confirmación"}
          activo={consulta.filtro === "POR_CONFIRMAR"}
          onClick={() => cambiar({ filtro: "POR_CONFIRMAR" })}
        />
      </Resumen>

      <section aria-label="Historial" className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <BarraDeFiltros
          hayFiltros={hayFiltros}
          onLimpiar={() => cambiar({ filtro: "TODAS", par: undefined })}
          cuenta={hayFiltros && datos ? `${datos.total} tasas` : undefined}
        >
          <FiltroSegmentado
            etiqueta="En qué quedó"
            valor={consulta.filtro}
            onCambiar={(filtro) => cambiar({ filtro })}
            opciones={FILTROS.map((f) => ({ ...f, cuenta: conteos[f.id], alerta: f.id === "POR_CONFIRMAR" }))}
          />
          <select aria-label="Par" className={CAMPO_DE_FILTRO} value={consulta.par ?? ""} onChange={(e) => cambiar({ par: (e.target.value || undefined) as RatePair | undefined })}>
            <option value="">Los dos pares</option>
            <option value="USD/VES">USD / VES</option>
            <option value="USDT/VES">USDT / VES</option>
          </select>
        </BarraDeFiltros>

        <div aria-busy={lista.cargando} className={cn("flex min-h-0 flex-1 flex-col transition-opacity", lista.cargando && "opacity-60")}>
          {lista.error ? (
            <div role="alert" className="rounded-[var(--radius-card)] border border-state-crit/35 bg-state-crit-bg px-4 py-6 text-center text-[13px]">
              <p className="font-semibold text-state-crit">{lista.error}</p>
              <Button type="button" variant="neutral" surface="admin" className="mt-3" onClick={() => void releer()}>
                Volver a intentar
              </Button>
            </div>
          ) : tasas.length === 0 ? (
            <EmptyState
              icon={<History size={20} />}
              title={hayFiltros ? "Ninguna tasa con estos filtros" : "Todavía no hay tasas en este local"}
              hint={hayFiltros ? "Cambia o limpia los filtros." : "Tráela del BCV o cárgala a mano."}
            />
          ) : (
            <>
              <div className="hidden min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card lg:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr>
                      <th className={TH}>Tasa</th>
                      <th className={TH}>Par</th>
                      <th className={TH}>Para el</th>
                      <th className={cn(TH, "w-full")}>En qué quedó</th>
                      <th className={TH}>Capturada</th>
                      <th className={TH}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasas.map((t) => (
                      <tr key={t.id} className={cn("border-t border-line", vencida(t) && "text-ink-3")}>
                        <td className={cn(TD, "tnum font-bold whitespace-nowrap text-ink")}>Bs. {formatTasaVE(t.value)}</td>
                        <td className={cn(TD, "whitespace-nowrap text-ink-2")}>
                          {t.pair} · {ORIGEN[t.source]}
                        </td>
                        <td className={cn(TD, "tnum whitespace-nowrap")}>
                          {enPalabras(t.effectiveDate)}
                          {t.effectiveDate === hoy ? " (hoy)" : ""}
                        </td>
                        <td className={cn(TD, "max-w-0")}>{enQueQuedo(t)}</td>
                        <td className={cn(TD, "tnum whitespace-nowrap text-ink-2")}>
                          {enPalabras(calendarDay(t.capturedAt, historial.zonaHoraria))} {hora(t.capturedAt)}
                          {t.capturedBy ? <span className="text-ink-3"> · {t.capturedBy}</span> : null}
                        </td>
                        <td className={cn(TD, "py-1 text-right")}>{confirmarBoton(t, "admin")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto lg:hidden">
                {tasas.map((t) => (
                  <li key={t.id} className="shrink-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tnum font-display text-[16px] font-bold text-ink">Bs. {formatTasaVE(t.value)}</span>
                      <span className="tnum text-[12.5px] text-ink-2">
                        para el {enPalabras(t.effectiveDate)}
                        {t.effectiveDate === hoy ? " (hoy)" : ""}
                      </span>
                    </div>
                    <p className="tnum mt-0.5 text-[12px] text-ink-3">
                      {t.pair} · {ORIGEN[t.source]} · {enPalabras(calendarDay(t.capturedAt, historial.zonaHoraria))} {hora(t.capturedAt)}
                      {t.capturedBy ? ` · ${t.capturedBy}` : ""}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                      {enQueQuedo(t)}
                      {confirmarBoton(t, "tablet")}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {!lista.error && datos && datos.total > 0 && (
          <Paginacion
            etiqueta="Páginas del historial de tasas"
            pagina={consulta.pagina}
            porPagina={consulta.porPagina}
            opciones={POR_PAGINA}
            total={datos.total}
            cargando={lista.cargando}
            onCambiar={(c) => cambiar(c)}
          />
        )}
        <p className="shrink-0 text-[12.5px] text-ink-3">Una tasa no se edita ni se borra. Si hay un error, se captura otra y se confirma esa.</p>
      </section>

      <Sheet
        abierto={cargando}
        onCerrar={() => setCargando(false)}
        titulo="Cargar una tasa a mano"
        descripcion={
          aplica
            ? "Se aplica al guardarla: desde su fecha valor, la caja cobra con ella."
            : "Queda pendiente: se confirma con la autorización de administración."
        }
      >
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
                    {pasadasVigentes.map((d) => (
                      <option key={d} value={d}>
                        {enPalabras(d)} (aún rige hoy)
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

                {verificar && (
                  <Input
                    surface="admin"
                    label="Teclea el valor de nuevo"
                    placeholder="228,41"
                    inputMode="decimal"
                    autoComplete="off"
                    value={verificado}
                    error={errorVerificado}
                    hint={
                      anterior
                        ? `Se aparta más del ${historial.umbralVariacionBasisPoints / 100} % de la vigente (Bs. ${formatTasaVE(anterior.value)}).`
                        : "Es la primera del par: no hay otra con la que compararla."
                    }
                    onChange={(e) => {
                      setVerificado(e.target.value);
                      setErrorVerificado(undefined);
                    }}
                  />
                )}

                <Button type="submit" variant="primary" surface="admin" className="mt-1 w-full" disabled={enviando || !hoy}>
                  {enviando ? "Guardando…" : aplica ? "Guardar y aplicar" : "Capturar"}
                </Button>
                <p className="text-[12px] text-ink-3">
                  {aplica
                    ? "Se aplica al guardarla: desde su fecha valor, la caja cobra con ella."
                    : "Queda pendiente: se confirma con la autorización de administración."}
                </p>
              </form>
      </Sheet>

      {confirmando && (
        <HojaConfirmar
          key={confirmando.id}
          tasa={confirmando}
          conAutorizacion={permiso === "REQUIERE_AUTORIZACION"}
          autorizadores={autorizadores}
          onCerrar={() => {
            setConfirmando(null);
            void releer();
          }}
        />
      )}
    </Container>
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
        tasa.heldBack
          ? `No se aplicó sola: ${RETENIDA[tasa.heldBack]}. Compárala con la que publica el BCV antes de confirmarla.`
          : requiere
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
          {/* La pantalla la enseña con dos decimales; la completa, para compararla con lo que publica el BCV. */}
          {(tasa.value.split(".")[1]?.replace(/0+$/, "").length ?? 0) > 2 && (
            <p className="tnum mt-0.5 text-[12.5px] text-ink-3">Con todos sus decimales: {tasa.value.replace(/0+$/, "").replace(".", ",")}</p>
          )}
          {anterior && (
            <p className="tnum mt-1 text-[12.5px] text-ink-3">La anterior confirmada: Bs. {formatTasaVE(anterior.value)}</p>
          )}
        </div>

        {requiere && (
          <Input
            surface="tablet"
            label="Teclea el valor de nuevo"
            placeholder="0,00"
            hint={`Como lo ves: ${formatTasaVE(tasa.value)}, o con todos sus decimales.`}
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
                          ? "border-brand bg-brand/20 font-semibold text-ink"
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
