"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { LayoutGrid, List, LoaderCircle, Rows3, Search, TriangleAlert, X } from "lucide-react";
import { cn } from "../cn";
import { Button, type Surface } from "../primitives/Button";
import { LETRAS, TODO_A_LA_VISTA, esVista, textoDeCargarMas, verLista, type Chip, type VistaDeLista } from "./listas.ts";

/**
 * Nivel 2 — las listas largas (T-22, M-38, W-11). Una pieza según cuántos elementos:
 *
 *  · **Hasta 50**, todo a la vista: sin buscador ni filtros, que con pocos estorban.
 *  · **De 50 a 500**, en el equipo: el buscador, chips con su cuenta que filtran, grupos con su encabezado fijo (por día,
 *    por categoría, por letra) y solo lo visible dibujado: cada elemento lleva `content-visibility: auto`, y el navegador
 *    no pinta lo que está fuera de la pantalla.
 *  · **Sin tope**, del servidor: busca el servidor y trae de a 50, con «Cargar más · 50 de N» y cuántos faltan; en las
 *    personas, el índice A–Z.
 *
 * Tres vistas —Tarjetas, Lista y Compacta— que cada persona elige y se recuerdan en el equipo (`useVistaDeLista`).
 * No conoce el dominio: recibe los elementos, cómo se pinta cada uno en cada vista, textos y eventos.
 */

const ICONO: Record<VistaDeLista, typeof List> = { TARJETAS: LayoutGrid, LISTA: List, COMPACTA: Rows3 };
const NOMBRE: Record<VistaDeLista, string> = { TARJETAS: "Tarjetas", LISTA: "Lista", COMPACTA: "Compacta" };
/** Lo que mide un elemento que no se ha pintado todavía, para que la barra de desplazamiento no salte. */
const ALTO: Record<VistaDeLista, string> = { TARJETAS: "auto 7rem", LISTA: "auto 4rem", COMPACTA: "auto 2.75rem" };

/**
 * La vista que eligió esta persona para esta lista, recordada en este equipo. Sin almacenamiento (una ventana privada),
 * dura lo que dure la pantalla.
 */
export function useVistaDeLista(lista: string, persona: string | null, porDefecto: VistaDeLista = "LISTA"): [VistaDeLista, (v: VistaDeLista) => void] {
  const clave = `l2.vista.${lista}.${persona ?? "equipo"}`;
  const [vista, setVista] = useState<VistaDeLista>(porDefecto);
  useEffect(() => {
    try {
      // lint-permitido: sin-simulacion — la vista de una lista es una preferencia de la pantalla, no un dato del negocio
      const v = window.localStorage.getItem(clave);
      setVista(esVista(v) ? v : porDefecto);
    } catch {
      /* sin almacenamiento: se queda la de siempre */
    }
  }, [clave, porDefecto]);
  const cambiar = useCallback(
    (v: VistaDeLista) => {
      setVista(v);
      try {
        // lint-permitido: sin-simulacion — la vista de una lista es una preferencia de la pantalla, no un dato del negocio
        window.localStorage.setItem(clave, v);
      } catch {
        /* sin almacenamiento: dura lo que dure la pantalla */
      }
    },
    [clave],
  );
  return [vista, cambiar];
}

/** Tarjetas, Lista o Compacta: tres botones con su icono (el nombre, al pasar el ratón y para el lector de pantalla). */
export function SelectorDeVista({ vista, onCambiar, surface = "admin", className }: { vista: VistaDeLista; onCambiar: (v: VistaDeLista) => void; surface?: Surface; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Vista" className={cn("flex shrink-0 gap-0.5 rounded-[var(--radius-control)] border border-line bg-surface p-0.5", className)}>
      {(Object.keys(ICONO) as VistaDeLista[]).map((v) => {
        const Icono = ICONO[v];
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={vista === v}
            aria-label={NOMBRE[v]}
            title={NOMBRE[v]}
            onClick={() => onCambiar(v)}
            className={cn(
              "grid cursor-pointer place-content-center rounded-[calc(var(--radius-control)-2px)] transition-colors focus-visible:outline-2 focus-visible:outline-brand",
              surface === "admin" ? "size-8" : "size-11",
              vista === v ? "bg-brand text-on-brand" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icono className="size-(--icono-texto)" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** «Cargar más · 50 de 2.000» y cuántos faltan (sin tope, del servidor); con todo cargado, cuántos son. */
export function CargarMas({ cargados, total, cargando, onCargarMas, surface = "admin" }: { cargados: number; total: number; cargando: boolean; onCargarMas: () => void; surface?: Surface }) {
  const t = textoDeCargarMas(cargados, total);
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      {t.boton && (
        <Button surface={surface === "admin" ? "tablet" : surface} variant="neutral" disabled={cargando} onClick={onCargarMas}>
          {cargando ? <LoaderCircle className="size-(--icono-texto) animate-spin" aria-hidden="true" /> : null}
          {t.boton}
        </Button>
      )}
      <p className="tnum text-nota text-ink-3">{t.faltan}</p>
    </div>
  );
}

/** Chips que filtran, cada uno con su cuenta: lo que va a dejar si se toca. */
export function ChipsDeFiltro({
  chips,
  elegido,
  onElegir,
  surface = "admin",
  etiqueta = "Filtrar",
  className,
}: {
  chips: readonly Readonly<{ id: string; nombre: string; cuenta: number }>[];
  elegido: string | null;
  onElegir: (id: string) => void;
  surface?: Surface;
  etiqueta?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={cn("-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]", className)}>
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={elegido === c.id}
          onClick={() => onElegir(c.id)}
          className={cn(
            "inline-flex shrink-0 cursor-pointer snap-start items-center gap-1.5 rounded-full border px-3 text-detalle whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand",
            surface === "admin" ? "min-h-8" : "min-h-11",
            elegido === c.id ? "border-brand bg-brand/15 font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
          )}
        >
          {c.nombre}
          <span className="tnum text-ink-3">{c.cuenta}</span>
        </button>
      ))}
    </div>
  );
}

/** Lo que el servidor da de una lista sin tope: lo buscado, cuántos hay, cargar más y, en las personas, sus letras. */
export type ListaDelServidor = Readonly<{
  total: number;
  buscado: string;
  onBuscar: (q: string) => void;
  cargando: boolean;
  onCargarMas: () => void;
  error?: string | null;
  letras?: Readonly<{ disponibles: readonly string[]; activa: string | null; onLetra: (letra: string | null) => void }>;
}>;

export function ListaLarga<T>({
  etiqueta,
  elementos,
  clave,
  render,
  vista,
  onVista,
  buscador,
  chips,
  grupo,
  servidor,
  vacio,
  sinCoincidencias = "Nada con eso.",
  acciones,
  barra = true,
  surface = "admin",
  className,
}: {
  /** Sin la barra (el buscador y la vista): la pantalla ya tiene la suya. */
  barra?: boolean;
  /** Cómo se llama la lista (para el lector de pantalla): «Familias», «Productos». */
  etiqueta: string;
  elementos: readonly T[];
  clave: (t: T) => string;
  /** Cómo se pinta un elemento en cada vista. */
  render: (t: T, vista: VistaDeLista) => ReactNode;
  vista: VistaDeLista;
  onVista: (v: VistaDeLista) => void;
  /** En el equipo: el buscador (desde 50) y si un elemento coincide con lo escrito (ya sin acentos ni mayúsculas). */
  buscador?: Readonly<{ placeholder: string; coincide: (t: T, q: string) => boolean }>;
  /** En el equipo: los chips que filtran, cada uno con su cuenta (el primero suele ser «Todos»). */
  chips?: readonly Chip<T>[];
  /** Los grupos con su encabezado fijo: el título del grupo de cada elemento, en el orden de la lista. */
  grupo?: (t: T) => string;
  /** Sin tope: el servidor busca y trae de a 50. */
  servidor?: ListaDelServidor;
  /** Lo que se dice si la lista está vacía de verdad. */
  vacio: ReactNode;
  /** Lo que se dice si nada coincide con lo buscado. */
  sinCoincidencias?: string;
  /** Botones de la barra, junto a la vista («Nuevo»). */
  acciones?: ReactNode;
  surface?: Surface;
  className?: string;
}) {
  const [buscadoAqui, setBuscadoAqui] = useState("");
  const [chip, setChip] = useState<string | null>(chips?.[0]?.id ?? null);
  // Lo escrito en una lista del servidor espera un momento antes de buscar: no se pregunta letra a letra.
  const [escrito, setEscrito] = useState(servidor?.buscado ?? "");
  const alBuscar = servidor?.onBuscar;
  useEffect(() => {
    if (!alBuscar) return;
    const t = window.setTimeout(() => alBuscar(escrito.trim()), 300);
    return () => window.clearTimeout(t);
  }, [escrito, alBuscar]);

  const grande = servidor !== undefined || elementos.length > TODO_A_LA_VISTA;
  const conHerramientas = grande && (servidor !== undefined || buscador !== undefined || (chips?.length ?? 0) > 0);
  const { grupos, cuentas, visibles } = useMemo(
    () =>
      servidor
        ? verLista(elementos, grupo ? { grupo } : {})
        : verLista(elementos, {
            ...(grande && buscador ? { buscado: buscadoAqui, coincide: buscador.coincide } : {}),
            ...(grande && chips ? { chips, chip } : {}),
            ...(grupo ? { grupo } : {}),
          }),
    [elementos, servidor, grupo, grande, buscador, buscadoAqui, chips, chip],
  );
  const estilo: CSSProperties | undefined = grande ? { contentVisibility: "auto", containIntrinsicSize: ALTO[vista] } : undefined;
  const buscando = servidor ? servidor.buscado !== "" || (servidor.letras?.activa ?? null) !== null : buscadoAqui.trim() !== "" || (chip !== null && chip !== chips?.[0]?.id);
  const alto = surface === "admin" ? "min-h-9" : "min-h-12";

  return (
    <section aria-label={etiqueta} className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      {/* La barra: lo que se busca, la vista y las acciones; debajo, los chips y el índice. */}
      {barra && (
      <div className="flex flex-wrap items-center gap-2">
        {conHerramientas && (servidor || buscador) && (
          <label className={cn("flex min-w-[12rem] flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 focus-within:border-brand", alto)}>
            {servidor?.cargando ? (
              <LoaderCircle className="size-(--icono-texto) shrink-0 animate-spin text-ink-3" aria-hidden="true" />
            ) : (
              <Search className="size-(--icono-texto) shrink-0 text-ink-3" aria-hidden="true" />
            )}
            <span className="sr-only">Buscar en {etiqueta.toLowerCase()}</span>
            <input
              type="search"
              value={servidor ? escrito : buscadoAqui}
              onChange={(e) => (servidor ? setEscrito(e.target.value) : setBuscadoAqui(e.target.value))}
              placeholder={buscador?.placeholder ?? "Buscar"}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className={cn("min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden", surface === "admin" ? "text-cuerpo" : "text-base")}
            />
            {(servidor ? escrito : buscadoAqui) && (
              <button
                type="button"
                aria-label="Borrar la búsqueda"
                onClick={() => (servidor ? setEscrito("") : setBuscadoAqui(""))}
                className="-mr-1.5 grid size-8 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:text-ink"
              >
                <X className="size-(--icono-texto)" aria-hidden="true" />
              </button>
            )}
          </label>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {acciones}
          <SelectorDeVista vista={vista} onCambiar={onVista} surface={surface} />
        </div>
      </div>
      )}

      {conHerramientas && !servidor && chips && chips.length > 0 && (
        <ChipsDeFiltro chips={chips.map((c) => ({ id: c.id, nombre: c.nombre, cuenta: cuentas[c.id] ?? 0 }))} elegido={chip} onElegir={setChip} surface={surface} />
      )}

      {servidor?.letras && (
        <nav aria-label="Por letra" className="-mx-1 flex snap-x gap-0.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
          <button
            type="button"
            aria-pressed={servidor.letras.activa === null}
            onClick={() => servidor.letras!.onLetra(null)}
            className={cn("shrink-0 cursor-pointer snap-start rounded-[var(--radius-control)] px-2 text-detalle", alto, servidor.letras.activa === null ? "bg-brand font-semibold text-on-brand" : "text-ink-2 hover:bg-surface-2")}
          >
            Todas
          </button>
          {LETRAS.map((l) => {
            const hay = servidor.letras!.disponibles.includes(l);
            return (
              <button
                key={l}
                type="button"
                disabled={!hay}
                aria-pressed={servidor.letras!.activa === l}
                aria-label={hay ? `Con la ${l}` : `Nadie con la ${l}`}
                onClick={() => servidor.letras!.onLetra(l)}
                className={cn(
                  "w-8 shrink-0 cursor-pointer snap-start rounded-[var(--radius-control)] text-detalle font-semibold disabled:cursor-default disabled:text-ink-3/40",
                  alto,
                  servidor.letras!.activa === l ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-surface-2",
                )}
              >
                {l}
              </button>
            );
          })}
        </nav>
      )}

      {servidor?.error && (
        <p role="alert" className="flex items-center gap-1.5 text-detalle text-state-crit">
          <TriangleAlert className="size-(--icono-texto) shrink-0" aria-hidden="true" />
          {servidor.error}
        </p>
      )}

      {visibles === 0 ? (
        buscando ? (
          <p role="status" className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-detalle text-ink-3">
            {sinCoincidencias}
          </p>
        ) : (
          vacio
        )
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((g) => (
            <div key={g.titulo || "todos"} className="flex flex-col gap-1.5">
              {g.titulo && (
                // El encabezado del grupo se queda arriba mientras se recorre el grupo.
                <h3 className="sticky top-0 z-10 -mx-1 flex items-baseline gap-2 bg-base/95 px-1 py-1 text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase backdrop-blur">
                  {g.titulo}
                  <span className="tnum font-normal tracking-normal">{g.elementos.length}</span>
                </h3>
              )}
              <ul
                className={cn(
                  vista === "TARJETAS" && "grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2",
                  vista === "LISTA" && "flex flex-col gap-1.5",
                  vista === "COMPACTA" && "flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface",
                )}
              >
                {g.elementos.map((t) => (
                  <li key={clave(t)} style={estilo}>
                    {render(t, vista)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {servidor && visibles > 0 && <CargarMas cargados={elementos.length} total={servidor.total} cargando={servidor.cargando} onCargarMas={servidor.onCargarMas} surface={surface} />}
    </section>
  );
}
