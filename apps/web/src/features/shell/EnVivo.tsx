"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  Baby,
  BellRing,
  ChefHat,
  ChevronRight,
  CircleCheckBig,
  OctagonAlert,
  Printer,
  Receipt,
  Sparkles,
  TriangleAlert,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { UmbralEspera } from "@l2/domain-orders";
import { toMajor } from "@l2/domain-money";
import { MoneyDisplay, cn } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useAhoraLocal, useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import { panelVivo, reloj, type Alerta } from "./vivo.ts";
import { useTarifario } from "../park/TarifarioProvider";

/**
 * El local ahora mismo — F9-08, FLUJOS flujo E, paso 5 de DEC-22.
 *
 * Cinco zonas —parque, cocina, mesas, caja y personas— alimentadas por los
 * mismos eventos que mueven las estaciones. **Nada se recarga**: lo que pasa
 * en una tablet se ve aquí en el mismo segundo.
 *
 * NO ES UNA PANTALLA: ES LA PARTE DE ARRIBA DE INICIO
 *
 * Nació como pantalla propia (`/panel/vivo`) y duró un día. Inicio ya enseñaba
 * sala, mesas, cocina y «requiere atención», con la diferencia de que aquellas
 * cifras estaban escritas a mano en la ruta. Dos tableros que dicen lo mismo
 * con números distintos son peores que ninguno: este bloque pasó a ser el
 * encabezado de Inicio y aquellas cifras se borraron.
 *
 * LO QUE HACE ÚTIL A UN TABLERO Y NO SOLO BONITO
 *
 * 1. **Primero lo que pide acción**, y cada aviso lleva a donde se resuelve.
 *    Si no hay nada, se dice con todas sus letras: «todo al día» y «no he
 *    mirado» no pueden parecerse.
 * 2. **Cada zona lleva a su pantalla.** Ver que tres familias esperan no sirve
 *    si hay que buscar cómo llegar.
 * 3. **Números grandes y comparables** (`tnum`), estado con color, icono y
 *    texto, y ningún dato de más: esto se mira de lejos y de reojo.
 *
 * Este bloque NO decide nada: solo lee. Ni un botón que cambie el estado del
 * local.
 */
export function EnVivo({
  umbral,
  enServicio,
  tasaConfirmada,
}: {
  umbral: UmbralEspera;
  /** Si el turno está abierto: fuera de servicio, un puesto vacío no es noticia. */
  enServicio: boolean;
  /** Si hay tasa del día confirmada (ADR-005). */
  tasaConfirmada: boolean;
}) {
  const sim = useSimulacion();
  const { cuentas } = useCuentas();
  const ahora = useAhoraLocal();
  const { tarifario } = useTarifario();
  const v = panelVivo({
    estado: sim.estado,
    cuentas,
    ahora,
    politica: tarifario.policy,
    umbral,
    enServicio,
    tasaConfirmada,
  });

  /**
   * El color de una zona sale de su aviso MÁS GRAVE, no de que tenga alguno.
   * Los colores de estado son reservados (§8.2): pintar de crítico una zona con
   * una advertencia le quita el significado al rojo justo donde más hace falta.
   */
  const tonoDe = (alertas: readonly Alerta[]): "idle" | "warn" | "crit" =>
    alertas.some((a) => a.tono === "crit") ? "crit" : alertas.length > 0 ? "warn" : "idle";

  // Lo crítico primero: dentro de la franja, el orden ES la prioridad.
  const alertas = [v.parque, v.cocina, v.mesas, v.caja, v.personas]
    .flatMap((z) => z.alertas)
    .sort((a, b) => Number(b.tono === "crit") - Number(a.tono === "crit"));

  return (
    <section aria-label="El local ahora" className="mb-4">
      <h2 className="mb-1.5 flex items-center gap-2 text-[10px] font-bold tracking-[0.1em] text-ink-3 uppercase">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            sim.activa ? "bg-state-ok l2-pulse" : "bg-line-strong",
          )}
        />
        El local ahora
        <span className="text-[10px] font-medium tracking-normal text-ink-3/80 normal-case">
          {sim.activa ? "se actualiza solo" : "sin actividad"}
        </span>
      </h2>

      {/* ── lo urgente, primero y accionable ── */}
      {alertas.length === 0 ? (
        <p className="mb-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-ok/30 bg-state-ok-bg/35 px-3 py-2 text-[12.5px] text-state-ok">
          <CircleCheckBig size={15} aria-hidden="true" />
          Todo al día: nada pide atención ahora mismo.
        </p>
      ) : (
        /* Una sola franja. `flex-wrap` con `flex-1` y una base mínima hace que
           los avisos REPARTAN el ancho de su fila en vez de dejar un hueco
           cuando son impares, y que al no caber bajen a la siguiente y vuelvan
           a repartirla. La base mínima es lo que garantiza que ninguno se
           estreche hasta dejar de leerse. */
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {alertas.map((a) => (
            <li key={a.texto} className="min-w-[19rem] flex-1">
              <Aviso alerta={a} />
            </li>
          ))}
        </ul>
      )}

      {/* ── las cinco zonas ── */}
      <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Zona
          titulo="Parque"
          icono={<Baby size={13} aria-hidden="true" />}
          href="/monitor"
          principal={`${v.parque.enSala}`}
          unidad={`de ${v.parque.aforo}`}
          tono={tonoDe(v.parque.alertas)}
          datos={[
            { etiqueta: "Por vencer", valor: v.parque.porVencer },
            {
              etiqueta: "Tiempo cumplido",
              valor: v.parque.vencidas,
              urgente: v.parque.vencidas > 0,
            },
          ]}
        />

        <Zona
          titulo="Cocina"
          icono={<ChefHat size={13} aria-hidden="true" />}
          href="/cocina"
          principal={`${v.cocina.enCola + v.cocina.enPreparacion}`}
          unidad="comandas"
          tono={tonoDe(v.cocina.alertas)}
          datos={[
            {
              etiqueta: "En cola · en fuego",
              texto: `${v.cocina.enCola} · ${v.cocina.enPreparacion}`,
            },
            v.cocina.sinTicket > 0
              ? {
                  etiqueta: "Sin ticket",
                  valor: v.cocina.sinTicket,
                  icono: <Printer size={11} aria-hidden="true" />,
                  urgente: true,
                }
              : {
                  etiqueta: "Listas",
                  valor: v.cocina.listas,
                  icono: <BellRing size={11} aria-hidden="true" />,
                },
            {
              etiqueta: "La más antigua",
              texto:
                v.cocina.enCola + v.cocina.enPreparacion > 0 ? reloj(v.cocina.masAntiguaMs) : "—",
            },
          ]}
        />

        <Zona
          titulo="Mesas"
          icono={<UtensilsCrossed size={13} aria-hidden="true" />}
          href="/mesas"
          principal={`${v.mesas.ocupadas}`}
          unidad="ocupadas"
          tono={tonoDe(v.mesas.alertas)}
          datos={[
            {
              etiqueta: "Piden la cuenta",
              valor: v.mesas.pidenCuenta,
              icono: <Receipt size={11} aria-hidden="true" />,
              urgente: v.mesas.pidenCuenta > 0,
            },
            {
              etiqueta: "Por limpiar",
              valor: v.mesas.porLimpiar,
              icono: <Sparkles size={11} aria-hidden="true" />,
            },
            ...(v.mesas.pidenCuenta > 0
              ? [{ etiqueta: "Esperando", texto: `${v.mesas.esperaCuentaMin} min` }]
              : []),
          ]}
        />

        <Zona
          titulo="Caja"
          icono={<Wallet size={13} aria-hidden="true" />}
          href="/caja"
          principal={`${v.caja.porCobrar}`}
          unidad="por cobrar"
          tono={tonoDe(v.caja.alertas)}
          datos={[
            {
              etiqueta: "Pendiente",
              nodo: <MoneyDisplay value={toMajor(v.caja.pendiente)} currency="USD" size="sm" />,
            },
            {
              etiqueta: "Familia ya fuera",
              valor: v.caja.familiasFuera,
              urgente: v.caja.familiasFuera > 0,
            },
            ...(v.caja.porCobrar > 0
              ? [{ etiqueta: "La que más espera", texto: `${v.caja.esperaMax} min` }]
              : []),
          ]}
        />

        {/* Personas conectadas: quién está en cada puesto (D7). */}
        <div className="flex flex-col gap-1 bg-surface px-3 py-2">
          <p className="flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
            <UserRound size={13} aria-hidden="true" />
            Personas
          </p>
          <ul className="flex flex-col gap-0.5 text-[11.5px]">
            {v.personas.puestos.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-2">
                <span className="shrink-0 text-ink-3">{p.nombre}</span>
                {p.quien ? (
                  <span className="min-w-0 truncate text-right font-medium text-ink">{p.quien}</span>
                ) : (
                  <span className={cn("shrink-0", enServicio ? "text-state-warn" : "text-ink-3")}>
                    {enServicio && (
                      <TriangleAlert
                        size={11}
                        className="mr-1 inline align-[-1px]"
                        aria-hidden="true"
                      />
                    )}
                    Sin nadie
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/acceso"
            className="mt-auto flex items-center gap-1 pt-1 text-[10.5px] text-ink-3 no-underline transition-colors hover:text-brand"
          >
            Dispositivos
            <ChevronRight size={11} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Un aviso de la franja.
 *
 * Compacto —una línea, 44 px de alto— y **siempre legible**: el texto puede
 * partirse en dos renglones antes que recortarse, porque un aviso cortado a la
 * mitad obliga a abrir la pantalla para saber qué pasa, que es justo lo que la
 * franja evita.
 *
 * El movimiento va por gravedad (§8.2): lo crítico late sin parar, la
 * advertencia entra y se queda quieta. Ninguno de los dos es la única señal.
 */
function Aviso({ alerta }: { alerta: Alerta }) {
  const critica = alerta.tono === "crit";
  const Icono = critica ? OctagonAlert : TriangleAlert;
  return (
    <Link
      href={alerta.href}
      role="status"
      className={cn(
        "l2-aparece group flex h-full min-h-11 items-center gap-2.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-[12.5px] no-underline",
        "transition-[transform,border-color] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
        "hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        critica
          ? "l2-late border-state-crit/45 bg-state-crit-bg/45 text-state-crit hover:border-state-crit/70"
          : "border-state-warn/45 bg-state-warn-bg/45 text-state-warn hover:border-state-warn/70",
      )}
    >
      <Icono size={15} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-tight font-medium text-pretty">{alerta.texto}</span>
      <span className="flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] bg-surface/60 px-2 py-0.5 text-[11px] whitespace-nowrap transition-colors group-hover:bg-surface">
        {alerta.accion}
        <ArrowRight
          size={11}
          className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

type Dato = Readonly<{
  etiqueta: string;
  valor?: number;
  texto?: string;
  nodo?: React.ReactNode;
  icono?: React.ReactNode;
  urgente?: boolean;
}>;

/**
 * Una zona del tablero: su cifra grande, sus datos y el paso a su pantalla.
 *
 * Las cinco comparten fondo y separador de un píxel —la misma rejilla que las
 * cifras del día— para que se lean como una sola pieza y no como cinco
 * tarjetas flotando.
 */
function Zona({
  titulo,
  icono,
  href,
  principal,
  unidad,
  datos,
  tono,
}: {
  titulo: string;
  icono: React.ReactNode;
  href: Route;
  principal: string;
  unidad: string;
  datos: readonly Dato[];
  tono: "idle" | "warn" | "crit";
}) {
  return (
    <Link
      href={href}
      aria-label={`${titulo}: ${principal} ${unidad}`}
      className={cn(
        "group flex flex-col gap-1 bg-surface px-3 py-2 no-underline",
        "transition-colors duration-[var(--dur-rapida)] hover:bg-surface-2",
        "focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand",
        tono === "crit" && "bg-state-crit-bg/25",
        tono === "warn" && "bg-state-warn-bg/25",
      )}
    >
      <p className="flex items-center gap-1.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        {icono}
        {titulo}
        <ChevronRight
          size={12}
          aria-hidden="true"
          className="ml-auto text-ink-3/0 transition-[color,transform] duration-[var(--dur-rapida)] group-hover:translate-x-0.5 group-hover:text-brand"
        />
      </p>

      <p className="flex items-baseline gap-1.5">
        <span className="tnum font-display text-xl leading-none font-bold tracking-tight text-ink 2xl:text-2xl">
          {principal}
        </span>
        <span className="text-[11px] text-ink-3">{unidad}</span>
      </p>

      <dl className="flex flex-col gap-0.5 text-[11.5px]">
        {datos.map((d) => (
          <div key={d.etiqueta} className="flex items-baseline justify-between gap-2">
            <dt className="flex shrink-0 items-center gap-1 text-ink-3">
              {d.icono}
              {d.etiqueta}
            </dt>
            <dd className={cn("tnum truncate font-semibold", d.urgente ? "text-state-warn" : "text-ink")}>
              {d.nodo ?? d.texto ?? d.valor}
            </dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
