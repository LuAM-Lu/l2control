"use client";

import { useEffect, useState, type RefObject } from "react";
import { Baby, Clock, Keyboard, Plus, Receipt, Search, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { toMajor } from "@l2/domain-money";
import type { PointOfSale } from "@l2/domain-cash";
import { WristbandCodeSchema, type FamilyAccountDto } from "@l2/contracts";
import { MoneyDisplay, ScannerField, cn } from "@l2/ui";
import { esDeMesa, esVentaDirecta, numeroDeOrden, pendiente } from "../cuentas/cuentas.ts";
import { PistaTecla } from "./AtajosDialog.tsx";

/**
 * La cola de cuentas por cobrar — DEC-21, UX-MEJORAS §9 (C1, C2, C5).
 *
 * Maestro-detalle: a la izquierda lo que espera, a la derecha el cobro de la
 * elegida. Tres cosas la hacen rápida con cola de verdad:
 *
 *  · **La más antigua arriba**, con cuánto lleva esperando. A los 10 minutos
 *    el tiempo se marca en ámbar: una familia que espera es la que se queja.
 *  · **Encontrar sin recorrer**: pasar la pulsera abre la cuenta de ese niño;
 *    «/» busca por familia o número de orden; los filtros separan parque y
 *    mostrador. El buscador solo ocupa sitio cuando hace falta.
 *  · **Se ve lo que llega**: una cuenta nueva destella al entrar a la cola.
 *
 * El estado se dice con icono + texto, nunca solo con color (§8.2).
 */

export type FiltroCola = "TODAS" | "PARQUE" | "MESAS" | "MOSTRADOR";

const FILTROS: readonly { id: FiltroCola; texto: string }[] = [
  { id: "TODAS", texto: "Todas" },
  { id: "PARQUE", texto: "Parque" },
  { id: "MESAS", texto: "Mesas" },
  { id: "MOSTRADOR", texto: "Mostrador" },
];

/** A partir de cuántos minutos la espera se marca. */
export const ESPERA_LARGA_MIN = 10;

/** Con más cuentas que esta, el buscador se queda a la vista. */
export const COLA_LARGA = 5;

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** La cola en el orden en que se atiende: primero la que más lleva esperando. */
export function ordenarCola(cuentas: readonly FamilyAccountDto[]): FamilyAccountDto[] {
  const desde = (c: FamilyAccountDto) => Date.parse(c.pendingSince ?? c.openedAt);
  return [...cuentas].sort((a, b) => desde(a) - desde(b) || (a.orderNumber ?? 0) - (b.orderNumber ?? 0));
}

/** Filtra por origen y por texto: familia, número de orden («#0012», «12») o «mostrador». */
export function filtrarCola(cuentas: readonly FamilyAccountDto[], texto: string, filtro: FiltroCola): FamilyAccountDto[] {
  const q = sinAcentos(texto.trim()).replace(/^#/, "");
  return cuentas.filter((c) => {
    const directa = esVentaDirecta(c);
    const deMesa = esDeMesa(c);
    if (filtro === "PARQUE" && (directa || deMesa)) return false;
    if (filtro === "MESAS" && !deMesa) return false;
    if (filtro === "MOSTRADOR" && !directa) return false;
    if (q === "") return true;
    const numero = String(c.orderNumber ?? "");
    const nombre = sinAcentos(directa ? "venta de mostrador" : c.family);
    return nombre.includes(q) || (/^\d+$/.test(q) && (numero === q.replace(/^0+/, "") || numero.startsWith(q)));
  });
}

export function ColaCuentas({
  className,
  cuentas,
  total,
  actual,
  onElegir,
  onNuevaVentaDirecta,
  ventaNueva,
  puntoDeCobro,
  recientes,
  busqueda,
  onBusqueda,
  filtro,
  onFiltro,
  buscando,
  onBuscando,
  buscadorRef,
  onEscanear,
  ultimoCobro,
  onVerRecibo,
  onVerAtajos,
}: {
  className?: string;
  /** Ya ordenadas y filtradas. */
  cuentas: readonly FamilyAccountDto[];
  /** Cuántas esperan en total, sin filtro. */
  total: number;
  actual: string | null;
  onElegir: (id: string) => void;
  onNuevaVentaDirecta: () => void;
  ventaNueva: boolean;
  puntoDeCobro: PointOfSale;
  /** Cuentas que acaban de llegar: destellan una vez. */
  recientes: ReadonlySet<string>;
  busqueda: string;
  onBusqueda: (texto: string) => void;
  filtro: FiltroCola;
  onFiltro: (f: FiltroCola) => void;
  /** Si el buscador está desplegado aunque la cola sea corta. */
  buscando: boolean;
  onBuscando: (abierto: boolean) => void;
  buscadorRef: RefObject<HTMLInputElement | null>;
  onEscanear: (codigo: string) => void;
  ultimoCobro: { orden: string; total: string } | null;
  onVerRecibo: () => void;
  onVerAtajos: () => void;
}) {
  // El reloj de la espera. Arranca en 0 para que servidor y navegador pinten
  // lo mismo; la espera aparece tras hidratar y se refresca cada 30 s.
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const conBuscador = buscando || total > COLA_LARGA || busqueda !== "" || filtro !== "TODAS";

  // Pedir el buscador (lupa o «/») es para escribir ya: el foco va a él en
  // cuanto existe.
  useEffect(() => {
    if (buscando) buscadorRef.current?.focus();
  }, [buscando, buscadorRef]);

  function cerrarBuscador() {
    onBusqueda("");
    onFiltro("TODAS");
    onBuscando(false);
  }

  return (
    <section
      aria-label="Cuentas por cobrar"
      className={cn("flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-4">
        <h2
          className="font-display text-base font-bold whitespace-nowrap text-ink"
          title={`Cobrando desde ${puntoDeCobro === "TAQUILLA" ? "la taquilla" : "el mostrador"}`}
        >
          Por cobrar <span className="tnum ml-1 text-[13px] font-semibold text-ink-3">{total}</span>
        </h2>
        <span className="flex items-center gap-0.5">
          {!conBuscador && (
            <button
              type="button"
              onClick={() => onBuscando(true)}
              aria-label="Buscar en la cola"
              title="Buscar (/)"
              className="grid size-14 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Search size={16} aria-hidden="true" />
            </button>
          )}
          {/* Solo donde hay teclado: en la tablet no hay teclas que enseñar. */}
          <button
            type="button"
            onClick={onVerAtajos}
            aria-label="Atajos de teclado"
            title="Atajos de teclado (?)"
            className="hidden size-14 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink pointer-fine:grid"
          >
            <Keyboard size={16} aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-2 border-b border-line/40 p-2">
        {/* Neutro: es una acción secundaria de la cola, no la acción principal
            de la pantalla, que es cobrar. */}
        <button
          type="button"
          onClick={onNuevaVentaDirecta}
          aria-pressed={ventaNueva}
          className={cn(
            "flex min-h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            ventaNueva ? "border-brand bg-brand/12 text-ink" : "border-line bg-base text-ink-2 hover:border-line-strong hover:text-ink",
          )}
        >
          <Plus size={15} aria-hidden="true" />
          <span>Venta directa</span>
          <PistaTecla tecla="N" />
        </button>

        <ScannerField
          onScan={onEscanear}
          validate={(c) => WristbandCodeSchema.safeParse(c).success}
          placeholder="Pasa una pulsera"
          className="min-h-12 gap-2 px-3 py-2 [&>span:last-child]:hidden [&>span[role=status]]:truncate [&>span[role=status]]:text-[12.5px]"
        />

        {conBuscador && (
          <div className="flex flex-col gap-1.5">
            <label className="flex h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base px-2.5 focus-within:border-brand">
              <Search size={15} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="sr-only">Buscar por familia o número de orden</span>
              <input
                ref={buscadorRef}
                type="search"
                value={busqueda}
                onChange={(e) => onBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cerrarBuscador();
                    e.currentTarget.blur();
                  } else if (e.key === "Enter" && cuentas.length === 1) {
                    e.preventDefault();
                    onElegir(cuentas[0]!.id);
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Familia o #orden"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
              />
              {(busqueda !== "" || total <= COLA_LARGA) && (
                <button
                  type="button"
                  onClick={cerrarBuscador}
                  aria-label="Cerrar la búsqueda"
                  className="grid size-14 shrink-0 cursor-pointer place-content-center rounded text-ink-3 hover:text-ink"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </label>
            <div role="radiogroup" aria-label="Origen de la cuenta" className="grid grid-cols-3 gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filtro === f.id}
                  onClick={() => onFiltro(f.id)}
                  className={cn(
                    "min-h-10 cursor-pointer rounded-[var(--radius-control)] text-[12px] font-semibold transition-colors",
                    filtro === f.id ? "bg-surface-2 text-ink ring-1 ring-line-strong" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {f.texto}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {cuentas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">
          {total === 0 ? "La cola está vacía." : "Ninguna cuenta coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {cuentas.map((c) => {
            const activa = c.id === actual && !ventaNueva;
            const esDirecta = esVentaDirecta(c);
            const deMesa = esDeMesa(c);
            const Origen = esDirecta ? ShoppingBag : deMesa ? UtensilsCrossed : Baby;
            const minutos =
              ahora > 0 && c.pendingSince ? Math.max(0, Math.floor((ahora - Date.parse(c.pendingSince)) / 60_000)) : null;
            const larga = minutos !== null && minutos >= ESPERA_LARGA_MIN;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={activa}
                  onClick={() => onElegir(c.id)}
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                    "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    activa ? "border-brand bg-brand/12" : "border-transparent hover:bg-surface-2",
                    recientes.has(c.id) && "l2-destello",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {esDirecta ? "Venta de mostrador" : c.family}
                    </span>
                    <MoneyDisplay value={toMajor(pendiente(c))} currency="USD" size="sm" />
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="tnum font-semibold text-ink-2">{numeroDeOrden(c)}</span>
                      <Origen size={12} className="ml-0.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {esDirecta ? "Mostrador" : deMesa ? "Mesa" : c.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"}
                        {!esDirecta && c.sessionIds.length > 0 &&
                          ` · ${c.sessionIds.length} ${c.sessionIds.length === 1 ? "niño" : "niños"}`}
                      </span>
                    </span>
                    {minutos !== null && (
                      <span
                        className={cn(
                          "tnum flex shrink-0 items-center gap-1 whitespace-nowrap",
                          larga && "rounded bg-state-warn-bg px-1 font-semibold text-state-warn",
                        )}
                        title={larga ? "Lleva mucho esperando" : "Tiempo en la cola"}
                      >
                        {larga && <Clock size={11} aria-hidden="true" />}
                        {minutos === 0 ? "ahora" : `${minutos} min`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {ultimoCobro && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line py-1.5 pr-1.5 pl-4 text-[12px]">
          <span className="min-w-0 truncate text-ink-3" title={`Último cobro ${ultimoCobro.orden} · ${ultimoCobro.total}`}>
            Último <span className="tnum font-semibold text-ink-2">{ultimoCobro.orden}</span>
          </span>
          <button
            type="button"
            onClick={onVerRecibo}
            className="inline-flex min-h-14 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Receipt size={14} aria-hidden="true" />
            Recibo
            <PistaTecla tecla="R" />
          </button>
        </div>
      )}
    </section>
  );
}
