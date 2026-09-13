"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  CircleCheckBig,
  OctagonAlert,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Container, MoneyDisplay, formatMoneyVE, cn } from "@l2/ui";
import type { Excepcion } from "../cash/shift-fixtures.ts";
import { EntradasPorMedio, type PorMedio } from "../cash/EntradasPorMedio.tsx";
import { ExcepcionesTurno } from "../cash/ExcepcionesTurno.tsx";
import { PuntosDeCobro, type FilaPunto } from "../cash/PuntosDeCobro.tsx";

// El tipo vive con su componente; se reexporta porque la página lo importa
// desde aquí.
export type { PorMedio };

/**
 * Inicio del back-office — F9-00, §9.10.4.
 *
 * QUÉ SE ARREGLÓ AQUÍ
 *
 * La versión anterior era un documento, no un panel: todo pesaba lo mismo, el
 * saludo ocupaba el sitio más visible de la pantalla sin decir nada, y cada
 * bloque venía con dos líneas de prosa explicando lo que ya se veía. Un panel
 * que hay que leer entero para saber si el día va bien no sirve de panel.
 *
 * Ahora hay tres alturas, y solo tres:
 *
 *  1. **Las cuatro cifras del día**, grandes, con su comparación. Es lo que se
 *     mira desde la puerta. Conmutables entre [Parque & Caja] y [Mesas & Cocina].
 *  2. **Lo que exige atención**, si lo hay. Y cuando no lo hay se dice, para
 *     distinguir «todo bien» de «no he mirado».
 *  3. **El detalle**: de dónde vino el dinero y qué se salió de lo normal.
 *
 * La comparación es siempre contra **el mismo día de la semana pasada**, nunca
 * contra ayer: comparar un sábado con un viernes en un parque infantil no dice
 * nada, y es el error más común de los paneles de negocio.
 */

export type Atencion = {
  id: string;
  titulo: string;
  detalle: string;
  gravedad: "crit" | "warn";
  href: Route | null;
  accion: string;
};

export type SaldoMoneda = { moneda: string; total: string };

export function InicioScreen({
  atenciones,
  porMedio,
  gaveta,
  puntos,
  ninosHoy,
  ninosSemanaPasada,
  enSala,
  aforo,
  ventaHoy,
  ventaSemanaPasada,
  excepciones,
  fecha,
  diaSemana,
  turnoDesde,
  cajero,
  tasa,
  mesasOcupadas = 5,
  mesasTotales = 8,
  comandasCocina = 4,
  comandasEnCola = 2,
  comandasEnPrep = 2,
  comandasListas = 2,
  esperaMaximaMin = 18,
  mesaEsperaCritica = "Mesa 4",
}: {
  atenciones: readonly Atencion[];
  porMedio: readonly PorMedio[];
  gaveta: readonly SaldoMoneda[];
  puntos: readonly FilaPunto[];
  ninosHoy: number;
  ninosSemanaPasada: number;
  enSala: number;
  aforo: number;
  ventaHoy: string;
  ventaSemanaPasada: string;
  excepciones: readonly Excepcion[];
  fecha: string;
  diaSemana: string;
  turnoDesde: string;
  cajero: string;
  /** Tasa del día ya formateada («228,41»), o `null` si no hay tasa confirmada (ADR-005). */
  tasa: string | null;
  mesasOcupadas?: number;
  mesasTotales?: number;
  comandasCocina?: number;
  comandasEnCola?: number;
  comandasEnPrep?: number;
  comandasListas?: number;
  esperaMaximaMin?: number;
  mesaEsperaCritica?: string;
}) {
  const [tabDetalle, setTabDetalle] = useState<"caja" | "excepciones">("caja");
  const todoBien = atenciones.length === 0;
  const diaMinuscula = diaSemana.toLowerCase();

  const variacion = (hoy: number, antes: number) =>
    antes === 0 ? null : Math.round(((hoy - antes) / antes) * 100);

  const ocupacion = aforo === 0 ? 0 : Math.round((enSala / aforo) * 100);
  const gavetaPrincipal = gaveta[0];
  const gavetaResto = gaveta.slice(1);

  return (
    <Container ancho="operacion" className="max-w-[1600px] py-3 xl:py-3.5 pb-6">
      {/* ─────────────── cabecera delgada: contexto, no protagonismo ────── */}
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl leading-none font-bold tracking-tight text-ink">
            Hoy
          </h1>
          <p className="mt-0.5 text-xs lg:text-[12.5px] text-ink-3">
            {diaSemana} {fecha}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Componente Tasa Oficial BCV */}
          <div className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface/80 px-3 py-1.5 text-xs text-ink-2 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-state-ok l2-pulse" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3">BCV</span>
            </div>
            <div className="flex items-baseline gap-1 border-l border-line pl-2.5">
              {/* La misma tasa que la barra de las estaciones: una cifra escrita
                  a mano aquí contradecía la que se usa para cobrar. */}
              <span className="tnum font-mono text-sm font-bold text-ink">{tasa ?? "—"}</span>
              <span className="text-[10.5px] text-ink-3">Bs. / $</span>
            </div>
            {tasa ? (
              <span className="hidden sm:inline-block rounded-full bg-state-ok-bg/60 border border-state-ok/30 px-2 py-0.2 text-[10.5px] font-medium text-state-ok">
                Confirmada
              </span>
            ) : (
              <span className="rounded-full border border-state-crit/30 bg-state-crit-bg px-2 py-0.2 text-[10.5px] font-medium text-state-crit">
                Sin tasa
              </span>
            )}
          </div>

          {/* Enlace al Turno */}
          <Link
            href={"/turno" as Route}
            className="group inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface/80 px-3 py-1.5 text-xs lg:text-[13px] text-ink-2 transition-all duration-[var(--dur-rapida)] hover:border-line-strong hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand shadow-sm"
          >
            <span>
              Turno desde <span className="tnum font-medium text-ink">{turnoDesde}</span> · {cajero}
            </span>
            <ArrowRight
              size={13}
              className="text-ink-3 transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5 group-hover:text-brand"
              aria-hidden="true"
            />
          </Link>
        </div>
      </header>

      {/* ───────────────────────── 1 · las cifras del día ─────────────────── */}
      <section aria-label="Cifras del día" className="mb-3 xl:mb-4 space-y-2">
        {/* Fila 1: Parque y Caja */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9.5px] sm:text-[10px] font-bold tracking-[0.1em] text-ink-3 uppercase">
              Parque y Caja
            </span>
          </div>
          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card grid-cols-2 lg:grid-cols-4">
            <Cifra
              etiqueta="Vendido"
              valor={<MoneyDisplay value={ventaHoy} currency="USD" size="lg" />}
              variacion={variacion(Number(ventaHoy), Number(ventaSemanaPasada))}
              pie={`${ventaSemanaPasada} el ${diaMinuscula} pasado`}
            />
            <Cifra
              etiqueta="Niños atendidos"
              valor={<Numero>{ninosHoy}</Numero>}
              variacion={variacion(ninosHoy, ninosSemanaPasada)}
              pie={`${ninosSemanaPasada} el ${diaMinuscula} pasado`}
            />
            <Cifra
              etiqueta="En sala ahora"
              valor={
                <span className="flex items-baseline gap-1.5">
                  <Numero>{enSala}</Numero>
                  <span className="tnum text-xs sm:text-sm text-ink-3">de {aforo}</span>
                </span>
              }
              pie={`${ocupacion} % del aforo`}
              barra={ocupacion}
            />
            <Cifra
              etiqueta="En gaveta"
              valor={
                gavetaPrincipal ? (
                  <MoneyDisplay
                    value={gavetaPrincipal.total}
                    currency={gavetaPrincipal.moneda}
                    size="lg"
                  />
                ) : (
                  <Numero>0</Numero>
                )
              }
              pie={
                gavetaResto.length > 0
                  ? gavetaResto.map((g) => formatMoneyVE(g.total, g.moneda)).join(" · ")
                  : "solo una moneda en gaveta"
              }
            />
          </div>
        </div>

        {/* Fila 2: Mesas y Cocina */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9.5px] sm:text-[10px] font-bold tracking-[0.1em] text-ink-3 uppercase">
              Mesas y Cocina
            </span>
          </div>

          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card grid-cols-2 lg:grid-cols-4">
            <Cifra
              etiqueta="Mesas en servicio"
              valor={
                <span className="flex items-baseline gap-1.5">
                  <Numero>{mesasOcupadas}</Numero>
                  <span className="tnum text-xs sm:text-sm text-ink-3">de {mesasTotales}</span>
                </span>
              }
              pie={`${Math.round((mesasOcupadas / mesasTotales) * 100)} % del salón · ${mesasTotales - mesasOcupadas} libres`}
              barra={Math.round((mesasOcupadas / mesasTotales) * 100)}
            />
            <Cifra
              etiqueta="En cocina (KDS)"
              valor={
                <span className="flex items-baseline gap-1.5">
                  <Numero>{comandasCocina}</Numero>
                  <span className="text-xs sm:text-sm font-medium text-ink-3">comandas</span>
                </span>
              }
              pie={`${comandasEnCola} en cola · ${comandasEnPrep} en preparación`}
            />
            <Cifra
              etiqueta="Listas para servir"
              valor={
                <span className="flex items-center gap-2">
                  <Numero>{comandasListas}</Numero>
                  {comandasListas > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 border border-brand/40 px-2 py-0.5 text-[10px] font-bold text-brand leading-none">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                      </span>
                      <span>Por retirar</span>
                    </span>
                  ) : (
                    <span className="text-xs sm:text-sm font-medium text-ink-3">al día</span>
                  )}
                </span>
              }
              pie={comandasListas > 0 ? "esperando retiro por mesero" : "sin platos pendientes"}
            />
            <Cifra
              etiqueta="Espera máxima"
              valor={
                <span className="flex items-baseline gap-1">
                  <Numero>{esperaMaximaMin}</Numero>
                  <span className="text-xs sm:text-sm font-semibold text-ink-3">min</span>
                </span>
              }
              pie={`${mesaEsperaCritica} · desde envío`}
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────── 2 · lo que exige atención ───────────────── */}
      <section className="mb-3.5 xl:mb-4">
        <h2 className="mb-1.5 flex items-baseline gap-2 text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
          Requiere atención
          {!todoBien && (
            <span
              className={cn(
                "tnum font-bold",
                atenciones.some((a) => a.gravedad === "crit") ? "text-state-crit" : "text-state-warn",
              )}
            >
              {atenciones.length}
            </span>
          )}
        </h2>

        {todoBien ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-state-ok/35 bg-state-ok-bg/40 px-4 py-3">
            <CircleCheckBig size={18} className="shrink-0 text-state-ok" aria-hidden="true" />
            <p className="text-[13px] text-ink">
              Nada pendiente: sin tiempos cumplidos, sin diferencias de arqueo y con la tasa del día
              confirmada.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2.5 lg:grid-cols-2">
            {atenciones.map((a) => {
              const Icon = a.gravedad === "crit" ? OctagonAlert : TriangleAlert;
              const cuerpo = (
                <div
                  className={cn(
                    "group flex min-h-[2.75rem] items-center gap-3 rounded-[var(--radius-card)] border px-3.5 py-2.5",
                    "transition-[transform,border-color,background-color] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
                    a.gravedad === "crit"
                      ? "border-state-crit/40 bg-state-crit-bg/45 hover:border-state-crit/70"
                      : "border-state-warn/40 bg-state-warn-bg/45 hover:border-state-warn/70",
                    a.href && "hover:-translate-y-0.5 active:scale-[0.99] cursor-pointer",
                  )}
                >
                  <Icon
                    size={18}
                    className={cn(
                      "shrink-0",
                      a.gravedad === "crit" ? "text-state-crit l2-pulse" : "text-state-warn",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display leading-tight text-sm font-bold text-ink">{a.titulo}</p>
                    <p className="mt-0.5 text-xs leading-snug text-ink-2 truncate">{a.detalle}</p>
                  </div>
                  {a.href && (
                    <span className="flex shrink-0 items-center gap-1.5 self-center rounded-[var(--radius-control)] bg-surface/60 px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-brand transition-colors duration-[var(--dur-rapida)] group-hover:bg-surface group-hover:text-brand">
                      {a.accion}
                      <ArrowRight size={12} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
              );
              return (
                <li key={a.id}>
                  {a.href ? (
                    <Link
                      href={a.href}
                      className="block h-full no-underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded-[var(--radius-card)]"
                    >
                      {cuerpo}
                    </Link>
                  ) : (
                    cuerpo
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ────────────────────────────── 3 · el detalle ───────────────────── */}
      <section aria-label="Detalle operativo y financiero">
        {/* Selector segmentado en Tablet y Mobile (<1280px) para evitar scroll vertical excesivo */}
        <div className="mb-4 flex items-center rounded-[var(--radius-control)] border border-line bg-surface p-1 xl:hidden">
          <button
            type="button"
            onClick={() => setTabDetalle("caja")}
            className={cn(
              "flex-1 rounded-[calc(var(--radius-control)-2px)] py-2 text-center text-xs font-semibold tracking-wide transition-colors duration-[var(--dur-rapida)]",
              tabDetalle === "caja"
                ? "bg-surface-2 text-ink shadow-sm"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            Flujo de caja
          </button>
          <button
            type="button"
            onClick={() => setTabDetalle("excepciones")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] py-2 text-center text-xs font-semibold tracking-wide transition-colors duration-[var(--dur-rapida)]",
              tabDetalle === "excepciones"
                ? "bg-surface-2 text-ink shadow-sm"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            <span>Excepciones del turno</span>
            {excepciones.length > 0 && (
              <span className="tnum rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] font-medium text-ink-2">
                {excepciones.length}
              </span>
            )}
          </button>
        </div>

        {/* En Desktop (xl:): 3 columnas paralelas perfectamente balanceadas. En Tablet/Mobile: selector segmentado */}
        <div className="xl:grid xl:grid-cols-3 xl:gap-4 2xl:gap-5">
          <div className={cn(tabDetalle !== "caja" && "hidden xl:block")}>
            <PuntosDeCobro filas={puntos} className="h-full" />
          </div>
          <div className={cn(tabDetalle !== "caja" && "mt-4 xl:mt-0 hidden xl:block")}>
            <EntradasPorMedio porMedio={porMedio} className="h-full" />
          </div>
          <div className={cn(tabDetalle !== "excepciones" && "mt-4 xl:mt-0 hidden xl:block")}>
            <ExcepcionesTurno excepciones={excepciones} className="h-full" />
          </div>
        </div>
      </section>

      <p className="mt-6 border-t border-line pt-3 text-[11px] text-ink-3">
        Las cifras del día salen del libro de movimientos, con el mismo dominio que usa el arqueo.
        La comparación con la semana pasada necesita histórico y hoy es de ejemplo.
      </p>
    </Container>
  );
}

/* ──────────────────────────────────────────────────────────── piezas ── */

function Numero({ children }: { children: React.ReactNode }) {
  return (
    <span className="tnum font-display text-lg sm:text-xl 2xl:text-2xl leading-none font-bold tracking-tight text-ink">
      {children}
    </span>
  );
}

/**
 * Celda de cifra. Las cuatro comparten fondo y separador de un píxel, así que
 * se leen como una sola pieza y no como cuatro tarjetas sueltas: el ojo
 * compara mejor lo que está alineado en una rejilla que lo que flota.
 */
function Cifra({
  etiqueta,
  valor,
  variacion,
  pie,
  barra,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  variacion?: number | null;
  pie: string;
  barra?: number;
}) {
  const sube = variacion !== null && variacion !== undefined && variacion > 0;
  const baja = variacion !== null && variacion !== undefined && variacion < 0;

  return (
    <div className="flex flex-col justify-between gap-0.5 bg-surface px-3 py-1.5 sm:px-3.5 sm:py-2 2xl:px-4 2xl:py-2.5">
      <span className="text-[9.5px] sm:text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        {etiqueta}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {valor}
        {variacion !== null && variacion !== undefined && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              sube ? "text-state-ok" : baja ? "text-state-crit" : "text-ink-3",
            )}
          >
            {sube ? (
              <TrendingUp size={12} aria-hidden="true" />
            ) : baja ? (
              <TrendingDown size={12} aria-hidden="true" />
            ) : null}
            <span className="tnum">
              {sube ? "+" : ""}
              {variacion} %
            </span>
          </span>
        )}
      </div>

      {barra !== undefined && (
        <span
          aria-hidden="true"
          className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-base"
        >
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
              barra >= 90 ? "bg-state-crit" : barra >= 70 ? "bg-state-warn" : "bg-state-ok",
            )}
            style={{ width: `${Math.min(barra, 100)}%` }}
          />
        </span>
      )}

      <span className="text-[10px] sm:text-[10.5px] text-ink-2/80 truncate leading-none mt-0.5">{pie}</span>
    </div>
  );
}
