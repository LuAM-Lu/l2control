"use client";

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
import { Container, MoneyDisplay, cn } from "@l2/ui";
import type { Excepcion } from "../cash/shift-fixtures.ts";

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
 *     mira desde la puerta.
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

export type PorMedio = {
  medio: string;
  moneda: string;
  /** Unidades mayores ya formateadas, para mostrar. */
  total: string;
  /** Unidades menores como texto, para calcular proporciones sin decimales. */
  minor: string;
  enGaveta: boolean;
};

export type SaldoMoneda = { moneda: string; total: string };

export function InicioScreen({
  atenciones,
  porMedio,
  gaveta,
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
}: {
  atenciones: readonly Atencion[];
  porMedio: readonly PorMedio[];
  gaveta: readonly SaldoMoneda[];
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
}) {
  const todoBien = atenciones.length === 0;
  const diaMinuscula = diaSemana.toLowerCase();

  const variacion = (hoy: number, antes: number) =>
    antes === 0 ? null : Math.round(((hoy - antes) / antes) * 100);

  const ocupacion = aforo === 0 ? 0 : Math.round((enSala / aforo) * 100);
  const gavetaPrincipal = gaveta[0];
  const gavetaResto = gaveta.slice(1);

  return (
    <Container ancho="panel" className="py-6 pb-16">
      {/* ─────────────── cabecera delgada: contexto, no protagonismo ────── */}
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-display text-2xl leading-none font-bold tracking-tight text-ink">
            Hoy
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {diaSemana} {fecha}
          </p>
        </div>
        <p className="text-[13px] text-ink-2">
          Turno abierto desde las <span className="tnum text-ink">{turnoDesde}</span> · {cajero}
        </p>
      </header>

      {/* ───────────────────────── 1 · las cuatro cifras ─────────────────── */}
      <section
        aria-label="Cifras del día"
        className="mb-8 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card sm:grid-cols-2 lg:grid-cols-4"
      >
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
              <span className="tnum text-sm text-ink-3">de {aforo}</span>
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
              ? gavetaResto.map((g) => `${g.total} ${g.moneda}`).join(" · ")
              : "solo una moneda en gaveta"
          }
        />
      </section>

      {/* ─────────────────────── 2 · lo que exige atención ───────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-baseline gap-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
          Requiere atención
          {!todoBien && <span className="tnum text-state-crit">{atenciones.length}</span>}
        </h2>

        {todoBien ? (
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-state-ok/35 bg-state-ok-bg/40 px-4 py-3.5">
            <CircleCheckBig size={18} className="shrink-0 text-state-ok" aria-hidden="true" />
            <p className="text-[13.5px] text-ink">
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
                    "flex h-full items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3.5",
                    "transition-[transform,border-color] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
                    a.gravedad === "crit"
                      ? "border-state-crit/40 bg-state-crit-bg/45"
                      : "border-state-warn/40 bg-state-warn-bg/45",
                    a.href && "hover:-translate-y-0.5 hover:border-brand/50",
                  )}
                >
                  <Icon
                    size={18}
                    className={cn(
                      "mt-0.5 shrink-0",
                      a.gravedad === "crit" ? "text-state-crit" : "text-state-warn",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-display leading-tight font-bold text-ink">{a.titulo}</p>
                    <p className="mt-1 text-[13px] leading-snug text-ink-2">{a.detalle}</p>
                  </div>
                  {a.href && (
                    <span className="flex shrink-0 items-center gap-1 self-center text-[12.5px] whitespace-nowrap text-brand">
                      {a.accion}
                      <ArrowRight size={13} aria-hidden="true" />
                    </span>
                  )}
                </div>
              );
              return (
                <li key={a.id}>
                  {a.href ? (
                    <Link href={a.href} className="block h-full no-underline">
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
      <div className="grid gap-5 lg:grid-cols-2">
        <EntroHoy porMedio={porMedio} />
        <Excepciones excepciones={excepciones} />
      </div>

      <p className="mt-8 border-t border-line pt-4 text-[11.5px] text-ink-3">
        Las cifras del día salen del libro de movimientos, con el mismo dominio que usa el arqueo.
        La comparación con la semana pasada necesita histórico y hoy es de ejemplo, igual que el
        desglose por punto de cobro, que llega con F4-01b.
      </p>
    </Container>
  );
}

/* ──────────────────────────────────────────────────────────── piezas ── */

function Numero({ children }: { children: React.ReactNode }) {
  return (
    <span className="tnum font-display text-2xl leading-none font-bold tracking-tight text-ink">
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
    <div className="flex flex-col gap-1.5 bg-surface px-4 py-3.5">
      <span className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        {etiqueta}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {valor}
        {variacion !== null && variacion !== undefined && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[12.5px] font-medium",
              sube ? "text-state-ok" : baja ? "text-state-crit" : "text-ink-3",
            )}
          >
            {sube ? (
              <TrendingUp size={13} aria-hidden="true" />
            ) : baja ? (
              <TrendingDown size={13} aria-hidden="true" />
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
              "block h-full rounded-full transition-[width] duration-[var(--dur-normal)]",
              barra >= 90 ? "bg-state-crit" : barra >= 70 ? "bg-state-warn" : "bg-state-ok",
            )}
            style={{ width: `${Math.min(barra, 100)}%` }}
          />
        </span>
      )}

      <span className="text-[11.5px] text-ink-3">{pie}</span>
    </div>
  );
}

/**
 * De dónde vino el dinero.
 *
 * Se agrupa POR MONEDA y la barra compara solo dentro de su grupo. Poner
 * dólares y bolívares en la misma barra daría una imagen falsa: 18.272 Bs
 * parecería veinte veces más que 70,58 USD cuando es menos de la mitad.
 */
function EntroHoy({ porMedio }: { porMedio: readonly PorMedio[] }) {
  const monedas = [...new Set(porMedio.map((m) => m.moneda))];

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <h2 className="font-display mb-4 text-base font-bold text-ink">Entró hoy</h2>

      <div className="flex flex-col gap-5">
        {monedas.map((moneda) => {
          const grupo = porMedio.filter((m) => m.moneda === moneda);
          const mayor = grupo.reduce((max, m) => (BigInt(m.minor) > max ? BigInt(m.minor) : max), 1n);

          return (
            <div key={moneda}>
              <p className="mb-2 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                {moneda}
              </p>
              <ul className="flex flex-col gap-2.5">
                {grupo.map((m) => {
                  const proporcion = Number((BigInt(m.minor) * 100n) / mayor);
                  return (
                    <li key={`${m.medio}|${m.moneda}`}>
                      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-ink-2">{m.medio}</span>
                          {!m.enGaveta && (
                            <span
                              title="No entra en el arqueo de efectivo: se concilia contra su propio estado de cuenta"
                              className="shrink-0 text-[10px] tracking-wide text-ink-3 uppercase"
                            >
                              fuera de gaveta
                            </span>
                          )}
                        </span>
                        <MoneyDisplay value={m.total} currency={m.moneda} size="sm" />
                      </div>
                      <span
                        aria-hidden="true"
                        className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-base"
                      >
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            m.enGaveta ? "bg-brand/70" : "bg-line-strong",
                          )}
                          style={{ width: `${Math.max(proporcion, 2)}%` }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Excepciones({ excepciones }: { excepciones: readonly Excepcion[] }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <h2 className="font-display mb-1 flex items-baseline gap-2 text-base font-bold text-ink">
        Excepciones del turno
        <span className="tnum text-[13px] font-medium text-ink-3">{excepciones.length}</span>
      </h2>
      <p className="mb-4 text-[12px] text-ink-3">
        Anulaciones, descuentos, cortesías y reimpresiones.
      </p>

      <ul className="flex flex-col">
        {excepciones.map((e, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 border-b border-line/50 py-2.5 text-[13px] last:border-0"
          >
            <span className="tnum shrink-0 text-ink-3">{e.hora}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "font-mono text-[10.5px] font-semibold tracking-wide",
                    e.tipo === "ANULACIÓN" ? "text-state-crit" : "text-state-warn",
                  )}
                >
                  {e.tipo}
                </span>
                <span className="text-ink-2">{e.detalle}</span>
              </span>
              <span className="mt-0.5 block text-[11.5px] text-ink-3">
                {e.motivo} · {e.usuario}
                {e.autorizadoPor && ` · autorizó ${e.autorizadoPor}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
