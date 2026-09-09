"use client";

import Link from "next/link";
import {
  CircleCheckBig,
  OctagonAlert,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { Container, MoneyDisplay, PageHeader, cn } from "@l2/ui";
import type { Excepcion } from "../cash/shift-fixtures.ts";

/**
 * Inicio del back-office — F9-00, §9.10.4.
 *
 * El cliente pidió «las mejores prácticas». Estas son, y el orden importa:
 *
 *  1. Lo que exige atención, arriba y en grande. Y **distinguiendo «todo
 *     bien» de «no he mirado»**: un panel que no lo hace es ruido.
 *  2. El día por **moneda y punto de cobro**, no un número único. Con una
 *     sola caja y dos puntos de cobro, saber cuánto entró por taquilla y
 *     cuánto por mostrador es lo que permite explicar una diferencia.
 *  3. Las excepciones del turno, con nombre y motivo (§7.5).
 *  4. La comparación contra **el mismo día de la semana pasada**, nunca
 *     contra ayer: comparar un sábado con un viernes en un parque infantil no
 *     dice nada. Es el error más común de los paneles de negocio.
 *
 * Lo que NO va: gráficos decorativos, cifras acumuladas sin contexto, y
 * cualquier métrica que nadie vaya a mirar dos veces.
 */

export type Atencion = {
  id: string;
  titulo: string;
  detalle: string;
  gravedad: "crit" | "warn";
  href: "/monitor" | "/turno" | "/caja" | null;
  accion: string;
};

export type PorMedio = { medio: string; moneda: string; total: string; enGaveta: boolean };

export function InicioScreen({
  atenciones,
  porMedio,
  ninosHoy,
  ninosSemanaPasada,
  ventaHoy,
  ventaSemanaPasada,
  excepciones,
  diaSemana,
}: {
  atenciones: readonly Atencion[];
  porMedio: readonly PorMedio[];
  ninosHoy: number;
  ninosSemanaPasada: number;
  ventaHoy: string;
  ventaSemanaPasada: string;
  excepciones: readonly Excepcion[];
  diaSemana: string;
}) {
  const todoBien = atenciones.length === 0;

  const variacion = (hoy: number, antes: number) =>
    antes === 0 ? null : Math.round(((hoy - antes) / antes) * 100);

  const varNinos = variacion(ninosHoy, ninosSemanaPasada);
  const varVenta = variacion(Number(ventaHoy), Number(ventaSemanaPasada));

  return (
    <Container ancho="panel" className="py-8 pb-24 lg:pb-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom" }, { texto: "Inicio" }]}
        titulo="Buenas tardes, Abigail"
        descripcion={`${diaSemana} · turno abierto desde las 14:00`}
      />

      {/* ─────────────────────── 1 · lo que exige atención ──────────────── */}
      <section className="mb-10">
        {todoBien ? (
          // La otra mitad de la regla: decir que NO hay nada, para que se
          // distinga de «no he mirado».
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-state-ok/35 bg-state-ok-bg/50 px-5 py-4">
            <CircleCheckBig size={20} className="shrink-0 text-state-ok" aria-hidden="true" />
            <div>
              <p className="font-display font-bold text-ink">Nada pendiente ahora mismo</p>
              <p className="text-[13px] text-ink-2">
                Sin tiempos cumplidos, sin diferencias de arqueo y con la tasa del día confirmada.
              </p>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
              Requiere atención
            </h2>
            <ul className="flex flex-col gap-2.5">
              {atenciones.map((a) => {
                const Icon = a.gravedad === "crit" ? OctagonAlert : TriangleAlert;
                const contenido = (
                  <div
                    className={cn(
                      "flex items-start gap-3.5 rounded-[var(--radius-card)] border px-5 py-4 transition-colors",
                      a.gravedad === "crit"
                        ? "border-state-crit/35 bg-state-crit-bg/50"
                        : "border-state-warn/35 bg-state-warn-bg/50",
                      a.href && "hover:border-brand/50",
                    )}
                  >
                    <Icon
                      size={20}
                      className={cn(
                        "mt-0.5 shrink-0",
                        a.gravedad === "crit" ? "text-state-crit" : "text-state-warn",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-ink">{a.titulo}</p>
                      <p className="mt-0.5 text-[13.5px] text-ink-2">{a.detalle}</p>
                    </div>
                    {a.href && (
                      <span className="shrink-0 self-center text-[13px] whitespace-nowrap text-brand">
                        {a.accion} →
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={a.id}>
                    {a.href ? (
                      <Link href={a.href} className="block no-underline">
                        {contenido}
                      </Link>
                    ) : (
                      contenido
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ──────────────── 2 · el día, por moneda y punto de cobro ────────── */}
      <section className="mb-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="font-display mb-1 text-lg font-bold text-ink">Lo que entró hoy</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">
            Por medio de pago y moneda. Lo que no está en la gaveta se concilia contra su propio
            estado de cuenta, no contra el efectivo.
          </p>

          <ul className="flex flex-col gap-2">
            {porMedio.map((m) => (
              <li
                key={`${m.medio}|${m.moneda}`}
                className="flex items-center justify-between gap-4 border-b border-line/50 pb-2 text-sm last:border-0"
              >
                <span className="flex items-center gap-2">
                  <span className="text-ink-2">{m.medio}</span>
                  {!m.enGaveta && (
                    <span className="text-[10px] tracking-wide text-ink-3 uppercase">
                      fuera de gaveta
                    </span>
                  )}
                </span>
                <MoneyDisplay value={m.total} currency={m.moneda} size="sm" />
              </li>
            ))}
          </ul>

          {/* F4-01b todavía no existe: se dice, no se finge. */}
          <p className="mt-4 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2 text-[12px] text-ink-3">
            El desglose por punto de cobro —taquilla o mostrador— llega con F4-01b. Sin él, una
            diferencia no se puede atribuir.
          </p>
        </div>

        {/* ────────── 4 · comparación contra el mismo día de la semana ───── */}
        <div className="flex flex-col gap-3">
          <Comparacion
            etiqueta="Vendido"
            valor={<MoneyDisplay value={ventaHoy} currency="USD" size="lg" />}
            variacion={varVenta}
            referencia={`${ventaSemanaPasada} el ${diaSemana.toLowerCase()} pasado`}
          />
          <Comparacion
            etiqueta="Niños atendidos"
            valor={
              <span className="tnum font-display text-3xl leading-none font-bold text-ink">
                {ninosHoy}
              </span>
            }
            variacion={varNinos}
            referencia={`${ninosSemanaPasada} el ${diaSemana.toLowerCase()} pasado`}
          />
          <p className="text-[12px] leading-relaxed text-ink-3">
            Se compara contra el <strong className="text-ink-2">mismo día de la semana pasada</strong>,
            nunca contra ayer: un sábado y un viernes no se parecen en un parque infantil.
          </p>
        </div>
      </section>

      {/* ─────────────────── 3 · excepciones del turno ───────────────────── */}
      <section>
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="font-display mb-1 flex items-center gap-2 text-lg font-bold text-ink">
            <ShieldAlert size={17} className="text-state-warn" aria-hidden="true" />
            Excepciones del turno
          </h2>
          <p className="mb-4 text-[12.5px] text-ink-3">
            Anulaciones, descuentos, cortesías y reimpresiones. Visibles aquí, no enterradas en un
            registro que nadie abre.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  {["Hora", "Tipo", "Detalle", "Quién", "Autorizó"].map((h) => (
                    <th
                      key={h}
                      className="pb-2 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {excepciones.map((e, i) => (
                  <tr key={i} className="border-b border-line/50 last:border-0">
                    <td className="tnum py-2.5 text-ink-3">{e.hora}</td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "font-mono text-[10.5px] font-semibold tracking-wide",
                          e.tipo === "ANULACIÓN" ? "text-state-crit" : "text-state-warn",
                        )}
                      >
                        {e.tipo}
                      </span>
                    </td>
                    <td className="py-2.5 text-ink-2">
                      {e.detalle}
                      <span className="block text-[11.5px] text-ink-3">{e.motivo}</span>
                    </td>
                    <td className="py-2.5 text-ink-2">{e.usuario}</td>
                    <td className="py-2.5 text-ink-3">{e.autorizadoPor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-6 border-t border-line pt-4 text-xs text-ink-3">
          Prototipo con datos de ejemplo. Las cifras del día salen del libro de movimientos; la
          comparación con la semana pasada necesita histórico y hoy es de ejemplo.
        </p>
      </section>
    </Container>
  );
}

function Comparacion({
  etiqueta,
  valor,
  variacion,
  referencia,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  variacion: number | null;
  referencia: string;
}) {
  const sube = variacion !== null && variacion > 0;
  const baja = variacion !== null && variacion < 0;

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{etiqueta}</p>
      <div className="mt-1.5 flex items-baseline gap-3">
        {valor}
        {variacion !== null && (
          <span
            className={cn(
              "flex items-center gap-1 text-[13px] font-medium",
              sube ? "text-state-ok" : baja ? "text-state-crit" : "text-ink-3",
            )}
          >
            {sube ? (
              <TrendingUp size={14} aria-hidden="true" />
            ) : baja ? (
              <TrendingDown size={14} aria-hidden="true" />
            ) : null}
            <span className="tnum">
              {sube ? "+" : ""}
              {variacion}%
            </span>
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-3">{referencia}</p>
    </div>
  );
}
