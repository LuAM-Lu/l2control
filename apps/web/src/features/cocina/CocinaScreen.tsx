"use client";

import { Bell, ChefHat, CircleCheckBig, Clock, Eye, Printer, TriangleAlert, Utensils } from "lucide-react";
import type { NivelEspera, UmbralEspera } from "@l2/domain-orders";
import { Badge, Button, Container, avisar, cn, type Tone } from "@l2/ui";
import { useAhoraLocal, useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import { useOperador } from "../identity/operador.ts";
import { cronometro, vistaCocina, type Comanda, type VistaCocina } from "./kds.ts";

/**
 * Cocina (KDS) — F6-07, DEC-19, paso 3 de DEC-22.
 *
 * SE LEE A DOS METROS Y SE TOCA CON GUANTES. Por eso todo aquí es más grande
 * que en el resto del sistema: objetivos táctiles de 64 px (§8.4), cronómetro
 * en cifras tabulares y una sola acción por comanda. Nada de menús ni de
 * navegación: la cocina no busca, atiende lo que tiene delante.
 *
 * TRES COSAS QUE ORDENAN LA PANTALLA
 *
 * 1. **Las anulaciones van primero y en rojo.** Un plato que se sigue
 *    cocinando porque nadie vio la anulación es comida tirada (FLUJOS C5).
 *    Solo desaparecen cuando alguien de cocina confirma que la vio.
 * 2. **La más antigua, arriba a la izquierda.** El orden es el de llegada, no
 *    el de la mesa: lo que más espera es lo que más quema.
 * 3. **Listas aparte.** Lo terminado sale de la rejilla de trabajo y espera al
 *    mesero en su propia columna, con cuánto lleva ahí: un plato listo que se
 *    enfría es tan malo como uno que no sale.
 *
 * La cocina NO entrega: eso lo hace el mesero desde `/mesas` (FLUJOS §2, C).
 * Tampoco anula: anular lo que ya está en producción es del mesero con
 * autorización (§7.3). Aquí solo se confirma que se vio.
 */

const NIVEL: Readonly<Record<NivelEspera, { tono: Tone; texto: string; icono: React.ReactNode }>> = {
  A_TIEMPO: { tono: "ok", texto: "A tiempo", icono: <CircleCheckBig size={15} aria-hidden="true" /> },
  TARDA: { tono: "warn", texto: "Tarda", icono: <Clock size={15} aria-hidden="true" /> },
  ATRASADA: { tono: "crit", texto: "Atrasada", icono: <TriangleAlert size={15} aria-hidden="true" /> },
};

/** El color del reloj según lo que lleva esperando. Nunca solo color: va con su chip. */
const TONO_RELOJ: Readonly<Record<NivelEspera, string>> = {
  A_TIEMPO: "text-ink-2",
  TARDA: "text-state-warn",
  ATRASADA: "text-state-crit",
};

export function CocinaScreen({ umbral }: { umbral: UmbralEspera }) {
  const sim = useSimulacion();
  const ahora = useAhoraLocal();
  const operador = useOperador();
  const vista = vistaCocina(sim.estado, ahora, umbral);

  /** Cada acción de la cocina sale como evento del catálogo (F1-20). */
  const emitir = (ev: Parameters<typeof sim.emitir>[0], exito: string) => {
    const r = sim.emitir(ev);
    if (r.ok) avisar.ok(exito);
    else avisar.error(r.motivo);
  };
  const quien = operador?.nombre;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Cocina</h1>
      <Container
        as="main"
        ancho="muro"
        className="grid flex-1 gap-4 py-4 apaisado:min-h-0 apaisado:grid-cols-[minmax(0,1fr)_clamp(260px,24vw,360px)]"
      >
        {/* ══════════════ lo que hay que cocinar ══════════════ */}
        <section aria-label="Comandas en cocina" className="flex min-h-0 min-w-0 flex-col gap-3">
          <Resumen vista={vista} />

          {vista.anulaciones.length > 0 && (
            <ul aria-label="Anulaciones sin confirmar" className="flex flex-col gap-2">
              {vista.anulaciones.map((c) => (
                <li
                  key={c.pedido.id}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border-2 border-state-crit bg-state-crit-bg px-4 py-3"
                >
                  <TriangleAlert size={22} className="shrink-0 text-state-crit" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-bold text-state-crit">Anulada · Mesa {c.mesa} · no la cocines</p>
                    <p className="text-[14px] text-ink-2">{platos(c)}</p>
                    <p className="text-[13px] text-ink-3">
                      Motivo: {c.pedido.anulacion?.motivo} · autorizó {c.pedido.anulacion?.autorizo}
                    </p>
                  </div>
                  <Button
                    surface="kds"
                    variant="danger"
                    className="shrink-0"
                    onClick={() =>
                      emitir(
                        { type: "pedido.anulacion_vista", orderId: c.pedido.id, by: quien ?? "Cocina" },
                        `Anulación confirmada · mesa ${c.mesa}`,
                      )
                    }
                  >
                    <Eye size={20} aria-hidden="true" />
                    Enterado
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {vista.comandas.length === 0 ? (
            <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 text-center">
              <ChefHat size={36} className="text-ink-3" aria-hidden="true" />
              <p className="font-display text-2xl font-bold text-ink">La cocina está al día</p>
              <p className="text-[15px] text-ink-2">Aquí aparece cada comanda en cuanto el mesero la envía.</p>
            </div>
          ) : (
            <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3 overflow-y-auto pb-1">
              {vista.comandas.map((c) => (
                <TarjetaComanda
                  key={c.pedido.id}
                  comanda={c}
                  onAceptar={() =>
                    emitir(
                      { type: "pedido.aceptado", orderId: c.pedido.id, ...(quien ? { by: quien } : {}) },
                      `En preparación · mesa ${c.mesa}`,
                    )
                  }
                  onListo={() =>
                    emitir(
                      { type: "pedido.listo", orderId: c.pedido.id, ...(quien ? { by: quien } : {}) },
                      `Lista para servir · mesa ${c.mesa}`,
                    )
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {/* ══════════════ lo terminado, esperando al mesero ══════════════ */}
        <aside
          aria-label="Listas para servir"
          className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-display text-[17px] font-bold text-ink">Listas para servir</h2>
            <span className="tnum text-[15px] font-semibold text-ink-3">{vista.listas.length}</span>
          </div>
          {vista.listas.length === 0 ? (
            <p className="px-4 py-4 text-[14px] text-ink-3">Nada esperando al mesero.</p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              {vista.listas.map((c) => (
                <li
                  key={c.pedido.id}
                  className="rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg/40 px-3 py-2"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-[17px] font-bold text-ink">Mesa {c.mesa}</span>
                    <span className="tnum text-[16px] font-bold text-state-ok">{cronometro(c.listaMs)}</span>
                  </span>
                  <span className="block text-[13.5px] text-ink-2">{platos(c)}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
                    <Bell size={12} aria-hidden="true" />
                    Esperando al mesero
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </Container>
    </div>
  );
}

const platos = (c: Comanda) => c.pedido.items.map((i) => `${i.quantity} ${i.name}`).join(" · ");

/** Los números que la cocina mira de reojo: cuántas y cuánto lleva la peor. */
function Resumen({ vista }: { vista: VistaCocina }) {
  const peor = vista.masAntigua;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2.5 shadow-card">
      <Dato etiqueta="En cola" valor={vista.enCola} />
      <Dato etiqueta="En preparación" valor={vista.enPreparacion} />
      <Dato etiqueta="Listas" valor={vista.listas.length} />
      {peor && (
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">La más antigua</span>
          <span className={cn("tnum text-xl font-bold", peor.nivel === "A_TIEMPO" ? "text-ink" : TONO_RELOJ[peor.nivel])}>
            {cronometro(peor.esperaMs)}
          </span>
        </span>
      )}
      {vista.sinTicket > 0 && (
        <Badge tone="warn" icon={<Printer size={14} aria-hidden="true" />} className="ml-auto">
          {vista.sinTicket} sin ticket impreso
        </Badge>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{etiqueta}</span>
      <span className="tnum text-xl font-bold text-ink">{valor}</span>
    </span>
  );
}

/**
 * Una comanda: la mesa, el reloj, los platos y UNA acción.
 *
 * El estado se dice con color, icono y texto (§8.2); el borde cambia con el
 * nivel de espera para distinguirla de lejos sin leer, y la nota del plato va
 * resaltada porque es lo que se olvida.
 */
function TarjetaComanda({
  comanda,
  onAceptar,
  onListo,
}: {
  comanda: Comanda;
  onAceptar: () => void;
  onListo: () => void;
}) {
  const { pedido, mesa, esperaMs, nivel } = comanda;
  const n = NIVEL[nivel];
  const enCola = pedido.estado === "ENVIADO";
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-card)] border-2 bg-surface p-3 shadow-card",
        nivel === "ATRASADA" ? "border-state-crit" : nivel === "TARDA" ? "border-state-warn" : "border-line",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display truncate text-2xl leading-none font-bold text-ink">Mesa {mesa}</span>
        <span className={cn("tnum text-2xl leading-none font-bold", TONO_RELOJ[nivel])}>{cronometro(esperaMs)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={n.tono} icon={n.icono}>
          {n.texto}
        </Badge>
        <Badge tone="idle" icon={enCola ? <Clock size={14} aria-hidden="true" /> : <ChefHat size={14} aria-hidden="true" />}>
          {enCola ? "En cola" : "En preparación"}
        </Badge>
        {!pedido.impreso && (
          <Badge tone="warn" icon={<Printer size={14} aria-hidden="true" />}>
            Sin ticket
          </Badge>
        )}
      </div>

      <ul className="flex flex-1 flex-col gap-1 border-t border-line pt-2">
        {pedido.items.map((i, k) => (
          <li key={k} className="flex gap-2 text-[17px] leading-tight text-ink">
            <span className="tnum w-7 shrink-0 text-right font-bold">{i.quantity}</span>
            <span className="min-w-0">
              {i.name}
              {i.note && <span className="block text-[14px] font-semibold text-state-warn">{i.note}</span>}
            </span>
          </li>
        ))}
      </ul>

      {enCola ? (
        <Button surface="kds" variant="neutral" className="w-full" onClick={onAceptar}>
          <Utensils size={20} aria-hidden="true" />
          Empezar
        </Button>
      ) : (
        <Button surface="kds" variant="primary" className="w-full" onClick={onListo}>
          <Bell size={20} aria-hidden="true" />
          Lista
        </Button>
      )}
    </li>
  );
}
