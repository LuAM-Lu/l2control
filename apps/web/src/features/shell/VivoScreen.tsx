"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Baby,
  BellRing,
  ChefHat,
  CircleCheckBig,
  Clock,
  Printer,
  Receipt,
  Sparkles,
  TriangleAlert,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { ParkPolicyDto } from "@l2/contracts";
import type { UmbralEspera } from "@l2/domain-orders";
import { toMajor } from "@l2/domain-money";
import { Container, MoneyDisplay, PageHeader, cn } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useAhoraLocal, useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import { panelVivo, reloj, type Alerta } from "./vivo.ts";

/**
 * El local ahora mismo — F9-08, FLUJOS flujo E, paso 5 de DEC-22.
 *
 * Cinco zonas —parque, cocina, mesas, caja y personas— alimentadas por los
 * mismos eventos que mueven las estaciones. **Nada se recarga**: lo que pasa
 * en una tablet se ve aquí en el mismo segundo.
 *
 * LO QUE HACE ÚTIL A UN TABLERO Y NO SOLO BONITO
 *
 * 1. **Primero lo que pide acción.** Arriba, una línea con lo urgente de las
 *    cinco zonas; si no hay nada, lo dice con todas sus letras. Un tablero que
 *    solo enseña números se mira el primer día y se ignora el segundo.
 * 2. **Cada zona lleva a su pantalla.** Ver que tres familias esperan en caja
 *    no sirve si hay que buscar cómo llegar: la tarjeta es un enlace.
 * 3. **Números grandes y comparables** (`tnum`), estado con color, icono y
 *    texto, y ningún dato de más: esto se mira de lejos y de reojo.
 *
 * Esta pantalla NO decide nada: solo lee. Por eso es la única del back-office
 * que no tiene un solo botón que cambie el estado del local.
 */
export function VivoScreen({
  politica,
  umbral,
  enServicio,
}: {
  politica: ParkPolicyDto;
  umbral: UmbralEspera;
  /** Si el turno está abierto: fuera de servicio, un puesto vacío no es noticia. */
  enServicio: boolean;
}) {
  const sim = useSimulacion();
  const { cuentas } = useCuentas();
  const ahora = useAhoraLocal();
  const v = panelVivo({ estado: sim.estado, cuentas, ahora, politica, umbral, enServicio });

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        titulo="El local ahora"
        descripcion="Lo que está pasando en este momento. Se actualiza solo, sin recargar."
        meta={
          <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", sim.activa ? "bg-state-ok l2-pulse" : "bg-line-strong")}
            />
            {sim.activa ? "En vivo" : "Sin actividad: el local está quieto"}
          </span>
        }
      />

      {/* ── lo urgente, primero ── */}
      <section aria-label="Lo que pide atención" className="mb-6">
        {v.urgencias === 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-state-ok/30 bg-state-ok-bg/30 px-4 py-3 text-[13.5px] text-state-ok">
            <CircleCheckBig size={17} aria-hidden="true" />
            Todo al día: nada pide atención ahora mismo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[v.parque, v.cocina, v.mesas, v.caja, v.personas]
              .flatMap((z) => z.alertas)
              .map((a) => (
                <li key={a.texto}>
                  <Aviso alerta={a} />
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* ── las cinco zonas ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Zona
          titulo="Parque"
          icono={<Baby size={16} aria-hidden="true" />}
          href="/monitor"
          verbo="Ver la sala"
          principal={`${v.parque.enSala}`}
          unidad={`de ${v.parque.aforo} niños`}
          tono={v.parque.alertas.length > 0 ? "crit" : "idle"}
          datos={[
            { etiqueta: "Por vencer", valor: v.parque.porVencer },
            { etiqueta: "Tiempo cumplido", valor: v.parque.vencidas, urgente: v.parque.vencidas > 0 },
          ]}
        />

        <Zona
          titulo="Cocina"
          icono={<ChefHat size={16} aria-hidden="true" />}
          href="/cocina"
          verbo="Ver comandas"
          principal={`${v.cocina.enCola + v.cocina.enPreparacion}`}
          unidad="comandas vivas"
          tono={v.cocina.alertas.length > 0 ? "crit" : "idle"}
          datos={[
            { etiqueta: "En cola", valor: v.cocina.enCola },
            { etiqueta: "En preparación", valor: v.cocina.enPreparacion },
            { etiqueta: "Listas", valor: v.cocina.listas, icono: <BellRing size={12} aria-hidden="true" /> },
            {
              etiqueta: "La más antigua",
              texto: v.cocina.enCola + v.cocina.enPreparacion > 0 ? reloj(v.cocina.masAntiguaMs) : "—",
            },
            ...(v.cocina.sinTicket > 0
              ? [{ etiqueta: "Sin ticket", valor: v.cocina.sinTicket, icono: <Printer size={12} aria-hidden="true" />, urgente: true }]
              : []),
          ]}
        />

        <Zona
          titulo="Mesas"
          icono={<UtensilsCrossed size={16} aria-hidden="true" />}
          href="/mesas"
          verbo="Ver el salón"
          principal={`${v.mesas.ocupadas}`}
          unidad="ocupadas"
          tono={v.mesas.alertas.length > 0 ? "warn" : "idle"}
          datos={[
            { etiqueta: "Piden la cuenta", valor: v.mesas.pidenCuenta, icono: <Receipt size={12} aria-hidden="true" />, urgente: v.mesas.pidenCuenta > 0 },
            { etiqueta: "Por limpiar", valor: v.mesas.porLimpiar, icono: <Sparkles size={12} aria-hidden="true" /> },
            ...(v.mesas.pidenCuenta > 0 ? [{ etiqueta: "Esperando", texto: `${v.mesas.esperaCuentaMin} min` }] : []),
          ]}
        />

        <Zona
          titulo="Caja"
          icono={<Wallet size={16} aria-hidden="true" />}
          href="/caja"
          verbo="Ir a cobrar"
          principal={`${v.caja.porCobrar}`}
          unidad="cuentas por cobrar"
          tono={v.caja.alertas.length > 0 ? "crit" : "idle"}
          pie={
            <span className="flex items-baseline gap-2">
              <span className="text-[11px] tracking-[0.08em] text-ink-3 uppercase">Pendiente</span>
              <MoneyDisplay value={toMajor(v.caja.pendiente)} currency="USD" size="md" />
            </span>
          }
          datos={[
            { etiqueta: "Familia ya fuera", valor: v.caja.familiasFuera, urgente: v.caja.familiasFuera > 0 },
            ...(v.caja.porCobrar > 0 ? [{ etiqueta: "La que más espera", texto: `${v.caja.esperaMax} min` }] : []),
          ]}
        />

        {/* Personas conectadas: quién está en cada puesto (D7). */}
        <section
          aria-label="Personas conectadas"
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 md:col-span-2 xl:col-span-1"
        >
          <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
            <UserRound size={16} aria-hidden="true" />
            Personas conectadas
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {v.personas.puestos.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-[13.5px] text-ink-2">{p.nombre}</span>
                {p.quien ? (
                  <span className="flex items-baseline gap-2 text-right">
                    <span className="text-[13.5px] font-semibold text-ink">{p.quien}</span>
                    <span className="tnum text-[11.5px] text-ink-3">{p.desdeMin} min</span>
                  </span>
                ) : (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-[12.5px]",
                      enServicio ? "text-state-warn" : "text-ink-3",
                    )}
                  >
                    {enServicio && <TriangleAlert size={13} aria-hidden="true" />}
                    Sin nadie
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-ink-3">
            Sale de las sesiones abiertas en cada aparato. Un puesto vacío en hora de servicio se marca.
          </p>
        </section>
      </div>
    </Container>
  );
}

function Aviso({ alerta }: { alerta: Alerta }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-[13.5px]",
        alerta.tono === "crit"
          ? "border-state-crit/40 bg-state-crit-bg text-state-crit"
          : "border-state-warn/40 bg-state-warn-bg text-state-warn",
      )}
    >
      {alerta.tono === "crit" ? <TriangleAlert size={16} aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />}
      {alerta.texto}
    </p>
  );
}

type Dato = Readonly<{
  etiqueta: string;
  valor?: number;
  texto?: string;
  icono?: React.ReactNode;
  urgente?: boolean;
}>;

/** Una zona del tablero: su cifra grande, sus datos y el enlace a su pantalla. */
function Zona({
  titulo,
  icono,
  href,
  verbo,
  principal,
  unidad,
  datos,
  tono,
  pie,
}: {
  titulo: string;
  icono: React.ReactNode;
  href: Route;
  verbo: string;
  principal: string;
  unidad: string;
  datos: readonly Dato[];
  tono: "idle" | "warn" | "crit";
  pie?: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-4",
        tono === "crit" ? "border-state-crit/40" : tono === "warn" ? "border-state-warn/40" : "border-line",
      )}
    >
      <h2 className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        {icono}
        {titulo}
      </h2>

      <p className="flex items-baseline gap-2">
        <span className="font-display tnum text-4xl leading-none font-bold text-ink">{principal}</span>
        <span className="text-[13px] text-ink-3">{unidad}</span>
      </p>

      <dl className="flex flex-col gap-1 text-[13px]">
        {datos.map((d) => (
          <div key={d.etiqueta} className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-ink-3">
              {d.icono}
              {d.etiqueta}
            </dt>
            <dd className={cn("tnum font-semibold", d.urgente ? "text-state-warn" : "text-ink")}>
              {d.texto ?? d.valor}
            </dd>
          </div>
        ))}
      </dl>

      {pie}

      <Link
        href={href}
        className="mt-auto flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-line px-3 text-[13px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
      >
        {verbo}
      </Link>
    </section>
  );
}
