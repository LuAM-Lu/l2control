"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Eye, FilterX, Inbox, RotateCcw, TriangleAlert } from "lucide-react";
import {
  POR_PAGINA_HISTORIAL,
  type FiltroHistorial,
  type HistorialDeImpresionDto,
  type ImpresoraDto,
  type TipoTrabajo,
  type TrabajoDeImpresionDto,
} from "@l2/contracts";
import { Button, Dialog, EmptyState, avisar, cn } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { ESTADO_DE_TRABAJO, useCola } from "./ColaProvider.tsx";
import { leerHistorial } from "./impresion.acciones";

/**
 * La cola y el historial de impresión, por páginas (nunca una lista sin fin): qué se mandó a imprimir,
 * dónde, quién y cómo fue. Se filtra por estado, impresora y tipo; lo que no salió o espera se reintenta
 * o se descarta (uno, o todos los que no salieron). Descartar no borra: queda aquí, con quién lo hizo.
 */

export type ConsultaHistorial = Readonly<{
  pagina: number;
  porPagina: (typeof POR_PAGINA_HISTORIAL)[number];
  filtro: FiltroHistorial;
  impresoraId?: string | undefined;
  tipo?: TipoTrabajo | undefined;
}>;

export const CONSULTA_INICIAL: ConsultaHistorial = { pagina: 1, porPagina: 20, filtro: "TODOS" };

/** El historial que se ve y cómo cambiarlo. Se vuelve a leer con cada cambio de filtro o página. */
export function useHistorial(inicial: HistorialDeImpresionDto | null) {
  const [datos, setDatos] = useState<HistorialDeImpresionDto | null>(inicial);
  const [consulta, setConsulta] = useState<ConsultaHistorial>(CONSULTA_INICIAL);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(inicial ? null : "No se pudo leer el historial.");
  // Solo cuenta la última lectura: si se cambia de página dos veces seguidas, gana la segunda.
  const turno = useRef(0);
  const actual = useRef(consulta);
  actual.current = consulta;

  const leer = useCallback(async (q: ConsultaHistorial) => {
    const mio = ++turno.current;
    setCargando(true);
    const r = await leerHistorial(q).catch(() => null);
    if (mio !== turno.current) return;
    setCargando(false);
    if (!r) setError("Sin conexión con el servidor.");
    else if (!r.ok) setError(r.mensaje);
    else {
      setError(null);
      setDatos(r.valor);
      // El servidor ajusta la página si ya no existe (se descartó lo último de ella).
      if (r.valor.pagina !== q.pagina) setConsulta((c) => ({ ...c, pagina: r.valor.pagina }));
    }
  }, []);

  const cambiar = useCallback(
    (cambio: Partial<ConsultaHistorial>) => {
      // Cambiar un filtro vuelve a la primera página; cambiar de página, no.
      const q = { ...actual.current, ...("pagina" in cambio ? {} : { pagina: 1 }), ...cambio };
      setConsulta(q);
      void leer(q);
    },
    [leer],
  );
  const releer = useCallback(() => leer(actual.current), [leer]);

  return { datos, consulta, cargando, error, cambiar, releer } as const;
}
export type Historial = ReturnType<typeof useHistorial>;

const FILTROS: readonly { id: FiltroHistorial; nombre: string }[] = [
  { id: "TODOS", nombre: "Todo" },
  { id: "FALLIDOS", nombre: "No salieron" },
  { id: "EN_COLA", nombre: "En cola" },
  { id: "IMPRESOS", nombre: "Impresos" },
  { id: "DESCARTADOS", nombre: "Descartados" },
];

const TIPOS: readonly { id: TipoTrabajo; nombre: string }[] = [
  { id: "RECIBO", nombre: "Recibos" },
  { id: "CORTE", nombre: "Cortes" },
  { id: "COMANDA", nombre: "Comandas" },
  { id: "PRUEBA", nombre: "Pruebas" },
];

const CAMPO =
  "min-h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const TH = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase whitespace-nowrap";
const TD = "px-3 py-2 align-middle";

/** El motivo de un trabajo en una línea: por qué no salió, qué espera o quién lo descartó. */
function detalle(t: TrabajoDeImpresionDto): string {
  if (t.estado === "DESCARTADO") return `Lo descartó ${t.descartadoPor ?? "alguien"}`;
  if (t.estado === "FALLIDO") return t.error ?? "No salió";
  if (t.estado === "PENDIENTE") return t.error ? `Reintentando: ${t.error}` : "Esperando al agente de la caja";
  if (t.estado === "ENVIADO") return "En manos del agente";
  return t.intentos > 1 ? `Salió al ${t.intentos}.º intento` : "";
}

const sePuedeDescartar = (t: TrabajoDeImpresionDto) => t.estado === "FALLIDO" || t.estado === "PENDIENTE";

export function HistorialDeImpresion({ historial, impresoras }: { historial: Historial; impresoras: readonly ImpresoraDto[] }) {
  const { datos, consulta, cargando, error, cambiar, releer } = historial;
  const { reintentar, descartar } = useCola();
  const reloj = useReloj();
  const [viendo, setViendo] = useState<TrabajoDeImpresionDto | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmarTodos, setConfirmarTodos] = useState(false);

  // La vista previa abierta sigue al trabajo si cambia (el agente lo confirmó mientras se miraba).
  useEffect(() => {
    if (!viendo || !datos) return;
    const fresco = datos.trabajos.find((t) => t.id === viendo.id);
    if (fresco && fresco.estado !== viendo.estado) setViendo(fresco);
  }, [datos, viendo]);

  async function accion(t: TrabajoDeImpresionDto, que: "reintentar" | "descartar") {
    setOcupado(t.id);
    const r = que === "reintentar" ? await reintentar(t.id) : await descartar({ kind: "TRABAJOS", trabajoIds: [t.id] });
    setOcupado(null);
    if (!r.ok) avisar.error(r.mensaje);
    else avisar.info(que === "reintentar" ? `${t.titulo}: otra vez en cola` : `${t.titulo}: descartado`);
    void releer();
  }

  async function descartarTodos() {
    setOcupado("todos");
    const r = await descartar({ kind: "FALLIDOS", impresoraId: consulta.impresoraId, tipo: consulta.tipo });
    setOcupado(null);
    setConfirmarTodos(false);
    if (!r.ok) avisar.error(r.mensaje);
    else avisar.ok(r.valor.descartados === 1 ? "1 descartado" : `${r.valor.descartados} descartados`);
    void releer();
  }

  const conteos = datos?.conteos;
  const fallidos = conteos?.FALLIDOS ?? 0;
  const conFiltros = consulta.filtro !== "TODOS" || consulta.impresoraId !== undefined || consulta.tipo !== undefined;
  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / consulta.porPagina));
  const desde = total === 0 ? 0 : (consulta.pagina - 1) * consulta.porPagina + 1;
  const hasta = Math.min(total, consulta.pagina * consulta.porPagina);
  const trabajos = datos?.trabajos ?? [];
  const nombreDe = (t: TrabajoDeImpresionDto) => `${t.titulo}${t.copia ? " (copia)" : ""}`;

  const acciones = (t: TrabajoDeImpresionDto, surface: "admin" | "tablet") => (
    <div className="flex shrink-0 items-center justify-end gap-1">
      {surface === "admin" && (
        <Button type="button" variant="ghost" surface={surface} aria-label={`Ver ${nombreDe(t)}`} title="Ver el ticket" onClick={() => setViendo(t)}>
          <Eye size={14} aria-hidden="true" />
        </Button>
      )}
      {t.estado === "FALLIDO" && (
        <Button type="button" variant="neutral" surface={surface} disabled={ocupado === t.id} onClick={() => void accion(t, "reintentar")}>
          <RotateCcw size={13} aria-hidden="true" />
          Reintentar
        </Button>
      )}
      {sePuedeDescartar(t) && (
        <Button type="button" variant="ghost" surface={surface} disabled={ocupado === t.id} aria-label={`Descartar ${nombreDe(t)}`} title="Descartar: no se imprime y deja de avisar" onClick={() => void accion(t, "descartar")}>
          <Ban size={14} aria-hidden="true" />
          {surface === "tablet" && "Descartar"}
        </Button>
      )}
    </div>
  );

  const estado = (t: TrabajoDeImpresionDto) => {
    const e = ESTADO_DE_TRABAJO[t.estado];
    return (
      <span className={cn("flex items-center gap-1.5 font-semibold whitespace-nowrap", e.tono)}>
        <e.Icono size={14} aria-hidden="true" />
        {e.texto}
      </span>
    );
  };

  return (
    <div className="flex min-h-full flex-col gap-3 md:h-full">
      {/* ── qué ver ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Estado" className="flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-1 [scrollbar-width:none]">
          {FILTROS.map((f) => {
            const n = conteos?.[f.id];
            const elegido = consulta.filtro === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={elegido}
                onClick={() => cambiar({ filtro: f.id })}
                className={cn(
                  "tnum flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] whitespace-nowrap transition-colors",
                  elegido ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
                )}
              >
                {f.id === "FALLIDOS" && fallidos > 0 && <TriangleAlert size={13} className="text-state-crit" aria-hidden="true" />}
                {f.nombre}
                {n !== undefined && <span className={cn("text-[12px]", f.id === "FALLIDOS" && n > 0 ? "font-semibold text-state-crit" : "text-ink-3")}>{n}</span>}
              </button>
            );
          })}
        </div>
        <label className="flex items-center">
          <select aria-label="Impresora" className={CAMPO} value={consulta.impresoraId ?? ""} onChange={(e) => cambiar({ impresoraId: e.target.value || undefined })}>
            <option value="">Todas las impresoras</option>
            {impresoras.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center">
          <select aria-label="Tipo" className={CAMPO} value={consulta.tipo ?? ""} onChange={(e) => cambiar({ tipo: (e.target.value || undefined) as TipoTrabajo | undefined })}>
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        {conFiltros && (
          <Button type="button" variant="ghost" surface="admin" onClick={() => cambiar({ filtro: "TODOS", impresoraId: undefined, tipo: undefined })}>
            <FilterX size={14} aria-hidden="true" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* ── lo que no salió, con su salida: reintentar uno a uno o descartarlos de una vez ── */}
      {fallidos > 0 && (
        <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] border border-state-crit/35 bg-state-crit-bg px-3 py-2 text-[13px]">
          <TriangleAlert size={15} className="shrink-0 text-state-crit" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-ink">
            <b className="tnum text-state-crit">{fallidos === 1 ? "1 no salió" : `${fallidos} no salieron`}</b>
            <span className="text-ink-2">
              {" "}
              {conFiltros && consulta.filtro !== "FALLIDOS" ? "con estos filtros" : ""} · Revisa la impresora y reintenta, o descártalos si ya no hacen falta.
            </span>
          </span>
          {consulta.filtro !== "FALLIDOS" && (
            <Button type="button" variant="ghost" surface="admin" onClick={() => cambiar({ filtro: "FALLIDOS" })}>
              Ver solo esos
            </Button>
          )}
          <Button type="button" variant="neutral" surface="admin" disabled={ocupado === "todos"} onClick={() => setConfirmarTodos(true)}>
            <Ban size={14} aria-hidden="true" />
            {fallidos === 1 ? "Descartarlo" : `Descartar los ${fallidos}`}
          </Button>
        </div>
      )}

      {/* ── la página ── */}
      <div aria-busy={cargando} className={cn("relative flex min-h-0 flex-1 flex-col transition-opacity", cargando && "opacity-60")}>
        {error ? (
          <div role="alert" className="rounded-[var(--radius-card)] border border-state-crit/35 bg-state-crit-bg px-4 py-6 text-center text-[13px]">
            <p className="font-semibold text-state-crit">{error}</p>
            <Button type="button" variant="neutral" surface="admin" className="mt-3" onClick={() => void releer()}>
              Volver a intentar
            </Button>
          </div>
        ) : trabajos.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title={conFiltros ? "Nada con estos filtros" : "Todavía no se ha mandado nada a imprimir"}
            hint={conFiltros ? "Cambia o limpia los filtros." : "Aquí sale cada recibo, corte, comanda y prueba, con cómo le fue."}
          />
        ) : (
          <>
            {/* Escritorio: tabla de una línea por trabajo; la cabecera queda fija al desplazarse. */}
            <div className="hidden min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card lg:block">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-10 bg-surface-2">
                  <tr>
                    <th className={TH}>Documento</th>
                    <th className={TH}>Impresora</th>
                    <th className={cn(TH, "w-full")}>Estado</th>
                    <th className={TH}>Pedido</th>
                    <th className={TH}>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trabajos.map((t) => (
                    <tr key={t.id} className="border-t border-line">
                      <td className={cn(TD, "max-w-[15rem] font-semibold whitespace-nowrap text-ink")}>
                        <span className="block truncate" title={nombreDe(t)}>
                          {t.titulo}
                          {t.copia && <span className="font-normal text-ink-3"> · copia</span>}
                        </span>
                      </td>
                      <td className={cn(TD, "max-w-[10rem] whitespace-nowrap text-ink-2")}>
                        <span className="block truncate">{t.impresora.nombre}</span>
                      </td>
                      <td className={cn(TD, "max-w-0")}>
                        <span className="flex min-w-0 items-center gap-2">
                          {estado(t)}
                          {detalle(t) && (
                            <span className={cn("min-w-0 truncate", t.estado === "FALLIDO" ? "text-state-crit" : "text-ink-3")} title={detalle(t)}>
                              {detalle(t)}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={cn(TD, "tnum whitespace-nowrap text-ink-2")}>
                        {reloj.diaYHora(Date.parse(t.creadoEn))}
                        <span className="text-ink-3"> · {t.creadoPor}</span>
                      </td>
                      <td className={cn(TD, "py-1")}>{acciones(t, "admin")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tableta y teléfono: una tarjeta por trabajo; tocarla abre el ticket. Los botones, solo si
                hay algo que hacer. En tableta la lista se desplaza por dentro y las páginas quedan a la vista. */}
            <ul className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto lg:hidden">
              {trabajos.map((t) => (
                <li key={t.id} className="shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                  <button
                    type="button"
                    onClick={() => setViendo(t)}
                    className="flex min-h-12 w-full cursor-pointer flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="min-w-0 text-[13.5px] font-semibold text-ink">
                        {t.titulo}
                        {t.copia && <span className="font-normal text-ink-3"> · copia</span>}
                      </span>
                      <span className="shrink-0 text-[12.5px]">{estado(t)}</span>
                    </span>
                    <span className="tnum text-[12px] text-ink-3">
                      {t.impresora.nombre} · {reloj.diaYHora(Date.parse(t.creadoEn))} · {t.creadoPor}
                    </span>
                    {detalle(t) && <span className={cn("text-[12.5px]", t.estado === "FALLIDO" ? "text-state-crit" : "text-ink-2")}>{detalle(t)}</span>}
                  </button>
                  {sePuedeDescartar(t) && <div className="border-t border-line px-2 py-1.5">{acciones(t, "tablet")}</div>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── las páginas ── */}
      {!error && total > 0 && (
        <nav aria-label="Páginas del historial" className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
          <span className="tnum">
            {desde}–{hasta} de {total}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span aria-hidden="true">Por página</span>
              <select aria-label="Por página" className={CAMPO} value={consulta.porPagina} onChange={(e) => cambiar({ porPagina: Number(e.target.value) as ConsultaHistorial["porPagina"] })}>
                {POR_PAGINA_HISTORIAL.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="neutral" surface="admin" aria-label="Página anterior" disabled={consulta.pagina <= 1 || cargando} onClick={() => cambiar({ pagina: consulta.pagina - 1 })}>
              <ChevronLeft size={15} aria-hidden="true" />
            </Button>
            <span className="tnum min-w-[5.5rem] text-center">
              Página {consulta.pagina} de {paginas}
            </span>
            <Button type="button" variant="neutral" surface="admin" aria-label="Página siguiente" disabled={consulta.pagina >= paginas || cargando} onClick={() => cambiar({ pagina: consulta.pagina + 1 })}>
              <ChevronRight size={15} aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}

      <VistaPrevia
        trabajo={viendo}
        ocupado={viendo !== null && ocupado === viendo.id}
        onCerrar={() => setViendo(null)}
        onAccion={(t, que) => void accion(t, que).then(() => setViendo(null))}
      />

      <Dialog
        abierto={confirmarTodos}
        onCerrar={() => setConfirmarTodos(false)}
        titulo={fallidos === 1 ? "¿Descartar el que no salió?" : `¿Descartar los ${fallidos} que no salieron?`}
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setConfirmarTodos(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" surface="admin" disabled={ocupado === "todos"} onClick={() => void descartarTodos()}>
              {ocupado === "todos" ? "Descartando…" : "Sí, descartar"}
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-ink-2">
          No se imprimirán y la alerta se apaga. No se borran: quedan en el historial como descartados, con tu nombre. Lo que se cobró o se cerró ya está
          guardado; un recibo se puede reimprimir desde la caja.
        </p>
        {(consulta.impresoraId || consulta.tipo) && (
          <p className="mt-2 text-[13px] text-ink-2">
            Solo los de {[consulta.impresoraId && impresoras.find((i) => i.id === consulta.impresoraId)?.nombre, consulta.tipo && TIPOS.find((x) => x.id === consulta.tipo)?.nombre.toLowerCase()].filter(Boolean).join(" · ")}, como dice el filtro.
          </p>
        )}
      </Dialog>
    </div>
  );
}

/** El ticket como sale en el papel, con lo que pasó con él. */
function VistaPrevia({
  trabajo,
  ocupado,
  onCerrar,
  onAccion,
}: {
  trabajo: TrabajoDeImpresionDto | null;
  ocupado: boolean;
  onCerrar: () => void;
  onAccion: (t: TrabajoDeImpresionDto, que: "reintentar" | "descartar") => void;
}) {
  const reloj = useReloj();
  // Al cerrar, el diálogo sigue enseñando el último ticket mientras se va (su salida es animada).
  const [ultimo, setUltimo] = useState(trabajo);
  if (trabajo && trabajo !== ultimo) setUltimo(trabajo);
  const t = trabajo ?? ultimo;
  if (!t) return null;
  const e = ESTADO_DE_TRABAJO[t.estado];
  const filas: [string, string][] = [
    ["Impresora", t.impresora.nombre],
    ["Pedido", `${reloj.diaYHora(Date.parse(t.creadoEn))} · ${t.creadoPor}`],
    ["Intentos", String(t.intentos)],
    ...(t.terminadoEn ? ([[t.estado === "DESCARTADO" ? "Descartado" : "Terminó", reloj.diaYHora(Date.parse(t.terminadoEn))]] as [string, string][]) : []),
    ...(detalle(t) ? ([["Detalle", detalle(t)]] as [string, string][]) : []),
  ];
  return (
    <Dialog
      abierto={trabajo !== null}
      onCerrar={onCerrar}
      titulo={`${t.titulo}${t.copia ? " (copia)" : ""}`}
      className="w-[min(44rem,calc(100vw-2rem))]"
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          {sePuedeDescartar(t) && (
            <Button type="button" variant="ghost" surface="admin" disabled={ocupado} onClick={() => onAccion(t, "descartar")}>
              <Ban size={14} aria-hidden="true" />
              Descartar
            </Button>
          )}
          {t.estado === "FALLIDO" && (
            <Button type="button" variant="neutral" surface="admin" disabled={ocupado} onClick={() => onAccion(t, "reintentar")}>
              <RotateCcw size={14} aria-hidden="true" />
              Reintentar
            </Button>
          )}
          <Button type="button" variant="primary" surface="admin" onClick={onCerrar}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
        <pre className="max-h-[50dvh] overflow-auto rounded-[var(--radius-control)] border border-line bg-base p-3 font-mono text-[11.5px] leading-[1.35] text-ink">
          {t.vistaPrevia}
        </pre>
        <dl className="flex flex-col gap-2 text-[13px]">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Estado</dt>
            <dd className={cn("flex items-center gap-1.5 font-semibold", e.tono)}>
              <e.Icono size={14} aria-hidden="true" />
              {e.texto}
            </dd>
          </div>
          {filas.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">{k}</dt>
              <dd className={cn("tnum text-ink-2", k === "Detalle" && t.estado === "FALLIDO" && "text-state-crit")}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}
