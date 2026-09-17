"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import type { UmbralEspera } from "@l2/domain-orders";
import { Container, MoneyDisplay, formatMoneyVE, cn } from "@l2/ui";
import { EnVivo } from "./EnVivo.tsx";
import type { Excepcion } from "../cash/turno.ts";
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
 *  1. **El local ahora** (`EnVivo`): lo que pide acción y las cinco zonas, que
 *     se mueven solas con los eventos.
 *  2. **El día**: lo acumulado, grande y comparado.
 *  3. **El detalle**: de dónde vino el dinero y qué se salió de lo normal.
 *
 * DOS TABLEROS FUSIONADOS EN UNO — 2026-09-14
 *
 * Esta pantalla enseñaba «en sala», «mesas en servicio», «en cocina» y
 * «requiere atención» por su cuenta, con cifras de mesas y cocina **escritas a
 * mano en la ruta** (`mesasOcupadas={5}`), mientras `/panel/vivo` calculaba
 * esas mismas cosas de verdad. Dos tableros que dicen lo mismo con números
 * distintos son peores que ninguno: el de al lado se convirtió en el bloque de
 * arriba de este, y aquellas cifras inventadas se borraron.
 *
 * El reparto que queda es de **horizonte temporal**, no de tema: arriba lo que
 * se mueve ahora, abajo lo que ya pasó hoy. La comparación es siempre contra
 * **el mismo día de la semana pasada**, nunca contra ayer: comparar un sábado
 * con un viernes en un parque infantil no dice nada, y es el error más común de
 * los paneles de negocio.
 */

export type SaldoMoneda = { moneda: string; total: string };

export function InicioScreen({
  porMedio,
  gaveta,
  puntos,
  ninosHoy,
  ninosSemanaPasada,
  ventaHoy,
  ventaSemanaPasada,
  excepciones,
  fecha,
  diaSemana,
  turnoDesde,
  cajero,
  tasa,
  umbral,
  enServicio,
}: {
  porMedio: readonly PorMedio[];
  gaveta: readonly SaldoMoneda[];
  puntos: readonly FilaPunto[];
  ninosHoy: number;
  ninosSemanaPasada: number;
  ventaHoy: string;
  ventaSemanaPasada: string;
  excepciones: readonly Excepcion[];
  fecha: string;
  diaSemana: string;
  turnoDesde: string;
  cajero: string;
  /** Tasa del día ya formateada («228,41»), o `null` si no hay tasa confirmada (ADR-005). */
  tasa: string | null;
  /** Cuándo una comanda tarda y cuándo está atrasada. */
  umbral: UmbralEspera;
  /** Si el turno está abierto: fuera de servicio, un puesto vacío no es noticia. */
  enServicio: boolean;
}) {
  const [tabDetalle, setTabDetalle] = useState<"caja" | "excepciones">("caja");
  const diaMinuscula = diaSemana.toLowerCase();

  const variacion = (hoy: number, antes: number) =>
    antes === 0 ? null : Math.round(((hoy - antes) / antes) * 100);

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
            className="group inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface/80 px-3 py-1.5 text-xs lg:text-[13px] text-ink-2 transition-all duration-[var(--dur-rapida)] hover:border-line-strong hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand shadow-sm"
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

      {/* ──────────────────────────── 1 · el local ahora ─────────────────── */}
      <EnVivo
        umbral={umbral}
        enServicio={enServicio}
        // Sin tasa formateada no hay tasa confirmada: es el mismo dato que
        // pinta el chip del BCV, no una segunda versión de la verdad.
        tasaConfirmada={tasa !== null}
      />

      {/* ───────────────────────────── 2 · el día ────────────────────────── */}
      <section aria-label="El día" className="mb-3 xl:mb-4">
        <h2 className="mb-1.5 text-[10px] font-bold tracking-[0.1em] text-ink-3 uppercase">
          El día · lo acumulado
        </h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:grid-cols-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
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
      </section>

      {/* ─────────────────────────── 3 · el detalle ──────────────────────── */}
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
