"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, FilterX, TriangleAlert } from "lucide-react";
import { cn } from "../cn";
import { Button, type Surface } from "../primitives/Button";

/**
 * Nivel 2 — patrones de las pantallas de Ajustes (M-17): el resumen de cifras que llevan a su sitio,
 * los filtros con su cuenta, «Limpiar filtros» y las páginas. Nacieron en Ajustes → Impresoras
 * (v0.39.2) y los usan también Carta y precios y Plano del local (B6-1); T-7 los lleva al resto.
 *
 * No conocen el dominio: reciben textos, cifras y eventos.
 */

export type TonoCifra = "ok" | "warn" | "crit" | "idle";

const COLOR: Record<TonoCifra, string> = { ok: "text-state-ok", crit: "text-state-crit", warn: "text-state-warn", idle: "text-ink" };

/** La franja del resumen: de 2 a 4 cifras, en una fila desde `lg` y de dos en dos debajo. */
export function Resumen({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <section
      aria-label={etiqueta}
      className={cn(
        "grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * Una cifra del resumen: etiqueta, valor y una línea de contexto. Color + icono + texto (§8.2): el
 * tono solo dice el estado, nunca decora. Con `onClick` lleva a su sitio (una pestaña, un filtro).
 */
export function Cifra({
  etiqueta,
  icono,
  tono = "idle",
  valor,
  pie,
  activo = false,
  onClick,
}: {
  etiqueta: string;
  icono: ReactNode;
  tono?: TonoCifra;
  valor: string;
  pie: string;
  activo?: boolean;
  onClick?: () => void;
}) {
  const color = COLOR[tono];
  const contenido = (
    <>
      <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase [&_svg]:size-[13px]", tono === "idle" ? "text-ink-3" : color)}>
        {icono}
        {etiqueta}
      </span>
      <span className={cn("tnum font-display text-[19px] leading-tight font-bold", color)}>{valor}</span>
      <span className="w-full truncate text-[12px] text-ink-3">{pie}</span>
    </>
  );
  const clase = "flex min-w-0 flex-col items-start gap-0.5 bg-surface px-4 py-2.5 text-left";
  if (!onClick) return <div className={clase}>{contenido}</div>;
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(clase, "cursor-pointer transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand", activo && "ring-2 ring-brand ring-inset")}
    >
      {contenido}
    </button>
  );
}

export type OpcionDeFiltro<T extends string> = Readonly<{
  id: T;
  nombre: string;
  /** Cuántos hay con este filtro; sin cifra si no se sabe. */
  cuenta?: number | undefined;
  /** Si su cuenta pide atención (lo que no salió, lo agotado): icono y cifra en crítico cuando es > 0. */
  alerta?: boolean;
}>;

/** Un filtro de una sola elección, en botones segmentados con su cuenta. */
export function FiltroSegmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  opciones: readonly OpcionDeFiltro<T>[];
  valor: T;
  onCambiar: (id: T) => void;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-1 [scrollbar-width:none]">
      {opciones.map((o) => {
        const elegido = o.id === valor;
        const avisa = o.alerta === true && (o.cuenta ?? 0) > 0;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={elegido}
            onClick={() => onCambiar(o.id)}
            className={cn(
              "tnum flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] whitespace-nowrap transition-colors",
              elegido ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {avisa && <TriangleAlert size={13} className="text-state-crit" aria-hidden="true" />}
            {o.nombre}
            {o.cuenta !== undefined && <span className={cn("text-[12px]", avisa ? "font-semibold text-state-crit" : "text-ink-3")}>{o.cuenta}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Clase de un `<select>` o un campo de búsqueda de la barra de filtros (32 px, superficie admin). */
export const CAMPO_DE_FILTRO =
  "min-h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * La fila de filtros: lo que se elige (`children`), cuántos salen (`cuenta`, «12 de 40») y, si hay
 * alguno puesto, «Limpiar filtros».
 */
export function BarraDeFiltros({
  children,
  hayFiltros,
  onLimpiar,
  cuenta,
  surface = "admin",
}: {
  children: ReactNode;
  hayFiltros: boolean;
  onLimpiar: () => void;
  cuenta?: string | undefined;
  surface?: Surface;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {children}
      {hayFiltros && (
        <Button type="button" variant="ghost" surface={surface} onClick={onLimpiar}>
          <FilterX size={14} aria-hidden="true" />
          Limpiar filtros
        </Button>
      )}
      {cuenta && <span className="tnum ml-auto text-[12.5px] text-ink-3">{cuenta}</span>}
    </div>
  );
}

/**
 * Las páginas de una lista que crece: «21–40 de 87», cuántas por página y anterior o siguiente. Nunca
 * una lista sin fin. Quien la usa decide si la página se lee del servidor o se corta en la pantalla.
 */
export function Paginacion<N extends number>({
  etiqueta,
  pagina,
  porPagina,
  opciones,
  total,
  cargando = false,
  onCambiar,
  surface = "admin",
}: {
  etiqueta: string;
  pagina: number;
  porPagina: N;
  opciones: readonly N[];
  total: number;
  cargando?: boolean;
  onCambiar: (cambio: { pagina?: number; porPagina?: N }) => void;
  surface?: Surface;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  return (
    <nav aria-label={etiqueta} className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
      <span className="tnum">
        {desde}–{hasta} de {total}
      </span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span aria-hidden="true">Por página</span>
          <select aria-label="Por página" className={CAMPO_DE_FILTRO} value={porPagina} onChange={(e) => onCambiar({ porPagina: Number(e.target.value) as N })}>
            {opciones.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="neutral" surface={surface} aria-label="Página anterior" disabled={pagina <= 1 || cargando} onClick={() => onCambiar({ pagina: pagina - 1 })}>
          <ChevronLeft size={15} aria-hidden="true" />
        </Button>
        <span className="tnum min-w-[5.5rem] text-center">
          Página {pagina} de {paginas}
        </span>
        <Button type="button" variant="neutral" surface={surface} aria-label="Página siguiente" disabled={pagina >= paginas || cargando} onClick={() => onCambiar({ pagina: pagina + 1 })}>
          <ChevronRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
