"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Baby,
  BellRing,
  ChefHat,
  CircleCheckBig,
  Clock,
  HandPlatter,
  Link2,
  NotebookPen,
  Printer,
  Receipt,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { MenuDto, PlanoLocalDto } from "@l2/contracts";
import { Badge, Button, Container, StatTile, Stepper, avisar, cn, type Tone } from "@l2/ui";
import { useAhoraLocal, useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import type { Pedido } from "../simulacion/proyeccion.ts";
import { minutosDesde, vistaDelPlano, type EstadoVisible, type LineaBorrador, type MesaVista } from "./mesas.ts";
import { PlanoLocal } from "./PlanoLocal.tsx";
import { TomaPedido } from "./TomaPedido.tsx";
import { VincularPulseras } from "./VincularPulseras.tsx";

/**
 * Estación del mesero: mesas y pedidos — F6-01, F6-02, F6-05, DEC-22.
 *
 * Maestro-detalle a pantalla fija (1366×768 y tablet 1280×800 sin desplazar
 * la página): el plano a la izquierda, lo que pasa en la mesa elegida a la
 * derecha. Tomar un pedido cambia la pantalla a carta + ticket, porque la
 * carta necesita el ancho que ocupa el plano; vincular pulseras abre una hoja
 * lateral porque es una tarea corta sobre la mesa que se está viendo.
 *
 * Todo lo que hace el mesero sale como un evento del catálogo (F1-20) y todo
 * lo que ve llega igual, sea del simulador o —mañana— del servidor.
 *
 * El mesero NO toca dinero (DEC-14): marca que la mesa pide la cuenta y la
 * familia paga en caja.
 */

const HORA = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Caracas",
});

const ESTADO_MESA: Readonly<Record<EstadoVisible, { texto: string; tono: Tone; icono: React.ReactNode }>> = {
  LIBRE: { texto: "Libre", tono: "idle", icono: <Sparkles size={14} aria-hidden="true" /> },
  OCUPADA: { texto: "Ocupada", tono: "idle", icono: <Users size={14} aria-hidden="true" /> },
  PIDE_CUENTA: { texto: "Pide la cuenta", tono: "warn", icono: <Receipt size={14} aria-hidden="true" /> },
  POR_LIMPIAR: { texto: "Por limpiar", tono: "idle", icono: <Sparkles size={14} aria-hidden="true" /> },
};

const ESTADO_PEDIDO: Readonly<Record<Pedido["estado"], { texto: string; tono: Tone; icono: React.ReactNode }>> = {
  ENVIADO: { texto: "En cola de cocina", tono: "idle", icono: <Clock size={13} aria-hidden="true" /> },
  EN_PREPARACION: { texto: "En preparación", tono: "idle", icono: <ChefHat size={13} aria-hidden="true" /> },
  LISTO: { texto: "Listo para servir", tono: "ok", icono: <BellRing size={13} aria-hidden="true" /> },
  ENTREGADO: { texto: "Entregado", tono: "idle", icono: <CircleCheckBig size={13} aria-hidden="true" /> },
  ANULADO: { texto: "Anulado", tono: "crit", icono: <TriangleAlert size={13} aria-hidden="true" /> },
};

export function MesasScreen({ plano, carta }: { plano: PlanoLocalDto; carta: MenuDto }) {
  const sim = useSimulacion();
  const ahora = useAhoraLocal();
  const { estado } = sim;

  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [vista, setVista] = useState<"plano" | "pedido">("plano");
  /** Plano espacial o lista por zonas (V3). La lista es la vista de móvil y de lector de pantalla. */
  const [modo, setModo] = useState<"PLANO" | "LISTA">("PLANO");
  const [borradores, setBorradores] = useState<Readonly<Record<string, LineaBorrador[]>>>({});
  const [vinculando, setVinculando] = useState(false);
  const [comensales, setComensales] = useState(2);
  const detalle = useRef<HTMLElement>(null);

  const mesas = useMemo(() => vistaDelPlano(plano.tables, estado, ahora), [plano, estado, ahora]);
  const elegida = mesas.find((m) => m.mesa.id === seleccion) ?? null;
  const zonas = [...new Set(plano.tables.map((m) => m.zone))];

  const ocupadas = mesas.filter((m) => m.estado !== "LIBRE").length;
  const pidenCuenta = mesas.filter((m) => m.estado === "PIDE_CUENTA").length;
  const listos = mesas.reduce((n, m) => n + m.listos, 0);
  const enCocina = mesas.reduce((n, m) => n + m.enCocina, 0);
  const impresorasCaidas = Object.entries(estado.impresoras).filter(([, i]) => i.estado === "FALLO");

  // El borrador de una mesa que se libera no pasa a la familia siguiente.
  useEffect(() => {
    setBorradores((b) => {
      const huerfanos = Object.keys(b).filter((id) => !estado.mesas[id]);
      if (huerfanos.length === 0) return b;
      const limpio = { ...b };
      for (const id of huerfanos) delete limpio[id];
      return limpio;
    });
  }, [estado.mesas]);

  // Si la mesa del pedido deja de estar abierta, se vuelve al plano: no se
  // toma un pedido para una mesa que ya no existe.
  useEffect(() => {
    if (vista === "pedido" && (!elegida || elegida.estado === "LIBRE")) setVista("plano");
  }, [vista, elegida]);

  const elegir = (id: string) => {
    setSeleccion(id);
    setComensales(2);
    // En pantallas estrechas el detalle queda debajo del plano.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => detalle.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const emitir = (ev: Parameters<typeof sim.emitir>[0], exito: string): boolean => {
    const r = sim.emitir(ev);
    if (r.ok) avisar.ok(exito);
    else avisar.error(r.motivo);
    return r.ok;
  };

  /* ── acciones: cada una comprueba su precondición antes de emitir ── */

  function abrir(m: MesaVista) {
    if (m.estado !== "LIBRE") {
      // I-05: una mesa no tiene dos sesiones abiertas.
      avisar.error(`La mesa ${m.mesa.label} ya está abierta`);
      return;
    }
    emitir(
      { type: "mesa.abierta", tableId: m.mesa.id, label: m.mesa.label, guests: comensales },
      `Mesa ${m.mesa.label} abierta · ${comensales} ${comensales === 1 ? "persona" : "personas"}`,
    );
  }

  function vincular(m: MesaVista, ids: string[]) {
    if (!m.ocupacion || ids.length === 0) return;
    emitir(
      { type: "mesa.vinculada", tableId: m.mesa.id, sessionIds: ids },
      `${ids.length === 1 ? "1 niño vinculado" : `${ids.length} niños vinculados`} a la mesa ${m.mesa.label}`,
    );
  }

  function enviar(m: MesaVista) {
    const lineas = borradores[m.mesa.id] ?? [];
    const items = lineas.flatMap((l) => {
      const it = carta.find((i) => i.id === l.itemId);
      return it?.available ? [{ name: it.name, quantity: l.cantidad, ...(l.nota ? { note: l.nota } : {}) }] : [];
    });
    // Fail-closed: si algo del borrador no se puede enviar, no se envía nada.
    if (items.length !== lineas.length || items.length === 0) {
      avisar.error("El borrador tiene platos que no se pueden enviar");
      return;
    }
    const ok = emitir(
      { type: "pedido.enviado", orderId: globalThis.crypto.randomUUID(), tableId: m.mesa.id, items },
      `Pedido enviado a cocina · Mesa ${m.mesa.label}`,
    );
    if (ok) {
      setBorradores((b) => ({ ...b, [m.mesa.id]: [] }));
      setVista("plano");
    }
  }

  const bloqueoEnvio = (m: MesaVista | null): string | null =>
    !m || m.estado === "LIBRE"
      ? "La mesa no está abierta"
      : m.estado === "POR_LIMPIAR"
        ? "La mesa ya pagó y está por limpiar"
        : null;

  /* ── vista de pedido: carta + ticket ── */
  if (vista === "pedido" && elegida) {
    return (
      <div className="flex flex-1 flex-col lg:min-h-0">
        <BannerSimulacion />
        <Cabecera titulo={`Pedido · Mesa ${elegida.mesa.label}`} subtitulo="Borrador: la cocina lo verá cuando lo envíes" />
        <Container
          as="main"
          ancho="operacion"
          className="grid flex-1 content-start gap-5 py-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)] lg:content-stretch"
        >
          <TomaPedido
            mesaLabel={elegida.mesa.label}
            carta={carta}
            lineas={borradores[elegida.mesa.id] ?? []}
            onCambiar={(l) => setBorradores((b) => ({ ...b, [elegida.mesa.id]: l }))}
            onEnviar={() => enviar(elegida)}
            onVolver={() => setVista("plano")}
            bloqueo={bloqueoEnvio(elegida)}
          />
        </Container>
      </div>
    );
  }

  /* ── vista de plano: mesas + detalle ── */
  return (
    <div className="flex flex-1 flex-col lg:min-h-0">
      <BannerSimulacion />
      <Cabecera
        titulo="Mesas"
        subtitulo="Toca una mesa para ver sus pedidos"
       
        cifras={
          <>
            <StatTile label="Ocupadas" value={ocupadas} suffix={`de ${plano.tables.length}`} />
            <StatTile label="En cocina" value={enCocina} icon={<ChefHat size={11} aria-hidden="true" />} />
            <StatTile
              label="Para servir"
              value={listos}
              tone={listos > 0 ? "ok" : "idle"}
              icon={<BellRing size={11} aria-hidden="true" />}
            />
            <StatTile
              label="Piden cuenta"
              value={pidenCuenta}
              tone={pidenCuenta > 0 ? "warn" : "idle"}
              icon={<Receipt size={11} aria-hidden="true" />}
            />
          </>
        }
      />

      {impresorasCaidas.map(([nombre, imp]) => (
        <p
          key={nombre}
          role="alert"
          className="flex items-center justify-center gap-2 border-b border-state-crit/40 bg-state-crit-bg px-4 py-2 text-[13px] text-state-crit"
        >
          <Printer size={15} aria-hidden="true" />
          <strong className="font-semibold">Impresora de {nombre.toLowerCase()}: {imp.detalle}.</strong>
          Los pedidos que envíes pueden no salir en papel: avisa en cocina.
        </p>
      ))}

      <Container
        as="main"
        ancho="operacion"
        className="grid flex-1 content-start gap-5 py-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)] lg:content-stretch"
      >
        <section aria-label="Plano de mesas" className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          {/* El plano se parece al local; la lista se lee mejor en móvil y con
              lector de pantalla. Misma información, dos formas de mirarla. */}
          <div role="radiogroup" aria-label="Cómo ver las mesas" className="flex gap-1 self-start rounded-[var(--radius-control)] bg-surface/70 p-1">
            {([["PLANO", "Plano"], ["LISTA", "Lista"]] as const).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={modo === id}
                onClick={() => setModo(id)}
                className={cn(
                  "min-h-12 cursor-pointer rounded-[0.4rem] px-4 text-[13.5px] transition-colors",
                  modo === id ? "bg-brand text-on-brand font-semibold" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {texto}
              </button>
            ))}
          </div>

          {modo === "PLANO" ? (
            <PlanoLocal plano={plano} mesas={mesas} elegida={seleccion} onElegir={elegir} className="lg:min-h-0" />
          ) : (
          <div className="flex flex-col gap-4">
          {zonas.map((zona) => (
            <div key={zona}>
              <h2 className="mb-2 text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">{zona}</h2>
              <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {mesas
                  .filter((m) => m.mesa.zone === zona)
                  .map((m) => (
                    <li key={m.mesa.id}>
                      <BaldosaMesa vista={m} elegida={m.mesa.id === seleccion} onElegir={() => elegir(m.mesa.id)} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          </div>
          )}
        </section>

        <aside
          ref={detalle}
          aria-label="Detalle de la mesa"
          className="flex min-w-0 scroll-mt-20 flex-col rounded-[var(--radius-card)] border border-line bg-surface lg:min-h-0"
        >
          {!elegida ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <HandPlatter size={34} aria-hidden="true" className="text-ink-3" />
              <p className="font-display text-lg font-semibold text-ink">Elige una mesa</p>
              <p className="max-w-[16rem] text-[13px] text-ink-2">
                Una libre para sentar a una familia; una ocupada para tomar su pedido o servir lo que está listo.
              </p>
            </div>
          ) : elegida.estado === "LIBRE" ? (
            <>
              <CabeceraDetalle vista={elegida} ahora={ahora} />
              <div className="flex flex-1 flex-col gap-4 px-4 py-4">
                <div>
                  <p className="mb-2 text-[13px] text-ink-2">¿Cuántas personas se sientan?</p>
                  <Stepper
                    value={comensales}
                    onChange={setComensales}
                    label={`Personas en la mesa ${elegida.mesa.label}`}
                    min={1}
                    max={20}
                  />
                  {comensales > elegida.mesa.seats && (
                    <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-state-warn">
                      <TriangleAlert size={13} aria-hidden="true" />
                      La mesa tiene {elegida.mesa.seats} sillas: harán falta más
                    </p>
                  )}
                </div>
              </div>
              <footer className="border-t border-line px-4 py-3">
                <Button variant="primary" onClick={() => abrir(elegida)} className="w-full">
                  <Users size={17} aria-hidden="true" />
                  Abrir la mesa {elegida.mesa.label}
                </Button>
              </footer>
            </>
          ) : (
            <>
              <CabeceraDetalle vista={elegida} ahora={ahora} />
              <div className="flex flex-1 flex-col gap-4 px-4 py-3 lg:min-h-0 lg:overflow-y-auto">
                <NinosDeLaMesa vista={elegida} onVincular={() => setVinculando(true)} />
                <PedidosDeLaMesa
                  vista={elegida}
                  ahora={ahora}
                  borrador={(borradores[elegida.mesa.id] ?? []).reduce((n, l) => n + l.cantidad, 0)}
                  onEntregar={(p) =>
                    p.estado === "LISTO" &&
                    emitir({ type: "pedido.entregado", orderId: p.id }, `Entregado en la mesa ${elegida.mesa.label}`)
                  }
                />
              </div>
              <footer className="flex flex-col gap-2 border-t border-line px-4 py-3">
                {elegida.estado === "POR_LIMPIAR" ? (
                  <Button
                    variant="primary"
                    onClick={() =>
                      emitir({ type: "mesa.libre", tableId: elegida.mesa.id }, `Mesa ${elegida.mesa.label} libre`)
                    }
                    className="w-full"
                  >
                    <Sparkles size={17} aria-hidden="true" />
                    Mesa limpia: dejarla libre
                  </Button>
                ) : (
                  <>
                    <Button variant="primary" onClick={() => setVista("pedido")} className="w-full">
                      <NotebookPen size={17} aria-hidden="true" />
                      {(borradores[elegida.mesa.id] ?? []).length > 0 ? "Seguir con el pedido" : "Tomar pedido"}
                    </Button>
                    {elegida.estado === "OCUPADA" ? (
                      <Button
                        variant="neutral"
                        onClick={() =>
                          emitir(
                            { type: "mesa.pide_cuenta", tableId: elegida.mesa.id },
                            `Mesa ${elegida.mesa.label}: la cuenta pasa a caja`,
                          )
                        }
                        className="w-full"
                      >
                        <Receipt size={16} aria-hidden="true" />
                        Pide la cuenta
                      </Button>
                    ) : (
                      <p className="text-center text-[12.5px] text-ink-3">
                        La familia paga en caja. El mesero no cobra (DEC-14).
                      </p>
                    )}
                  </>
                )}
              </footer>

              <VincularPulseras
                abierto={vinculando}
                onCerrar={() => setVinculando(false)}
                mesa={elegida.mesa}
                estado={estado}
                onVincular={(ids) => vincular(elegida, ids)}
              />
            </>
          )}
        </aside>
      </Container>
    </div>
  );
}

/* ───────────────────────────────────────────────────── piezas ── */

function BannerSimulacion() {
  const sim = useSimulacion();
  if (!sim.activa || !sim.escenario) return null;
  return (
    // Nunca se confunde una tarde simulada con el local de verdad.
    <p className="border-b border-brand/30 bg-brand/10 py-1 text-center text-[12px] font-semibold tracking-wide text-brand uppercase">
      Simulación · {sim.escenario.nombre}
    </p>
  );
}

function Cabecera({
  titulo,
  subtitulo,
  cifras,
}: {
  titulo: string;
  subtitulo: string;
  cifras?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 py-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">{titulo}</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">{subtitulo}</p>
        </div>
        {cifras && <div className="flex items-end gap-6">{cifras}</div>}
      </Container>
    </header>
  );
}

function BaldosaMesa({ vista, elegida, onElegir }: { vista: MesaVista; elegida: boolean; onElegir: () => void }) {
  const e = ESTADO_MESA[vista.estado];
  const libre = vista.estado === "LIBRE";
  return (
    <button
      type="button"
      aria-pressed={elegida}
      onClick={onElegir}
      aria-label={`Mesa ${vista.mesa.label}, ${e.texto}${vista.listos > 0 ? `, ${vista.listos} para servir` : ""}`}
      className={cn(
        "flex min-h-[8.25rem] w-full cursor-pointer flex-col justify-between gap-2 rounded-[var(--radius-card)] border p-3 text-left",
        "transition-[border-color,background-color,box-shadow] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        vista.estado === "PIDE_CUENTA"
          ? "border-state-warn/50 bg-state-warn-bg"
          : vista.estado === "POR_LIMPIAR"
            ? "border-dashed border-line-strong bg-base/40"
            : libre
              ? "border-line bg-base/40 hover:border-line-strong"
              : "border-line-strong bg-surface hover:border-ink-3",
        elegida && "ring-2 ring-brand ring-offset-2 ring-offset-base",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={cn("font-display text-3xl leading-none font-bold", libre ? "text-ink-3" : "text-ink")}>
          {vista.mesa.label}
        </span>
        <span className="tnum flex flex-col items-end gap-0.5 text-[12px] text-ink-3">
          <span className="flex items-center gap-1">
            <Users size={12} aria-hidden="true" />
            {vista.ocupacion ? `${vista.ocupacion.comensales}/${vista.mesa.seats}` : vista.mesa.seats}
          </span>
          {(vista.ocupacion?.sesiones.length ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Baby size={12} aria-hidden="true" />
              {vista.ocupacion!.sesiones.length === 1 ? "1 niño" : `${vista.ocupacion!.sesiones.length} niños`}
            </span>
          )}
        </span>
      </span>

      <span className="flex flex-col gap-1.5">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[13px] font-medium",
            e.tono === "warn" ? "text-state-warn" : libre ? "text-ink-3" : "text-ink-2",
          )}
        >
          {e.icono}
          <span className="truncate">
            {e.texto}
            {vista.minutos !== null && <span className="tnum font-normal text-ink-3"> · {vista.minutos} min</span>}
          </span>
        </span>
        {(vista.listos > 0 || vista.enCocina > 0) && (
          <span className="flex flex-wrap gap-1">
            {vista.listos > 0 && (
              <Badge tone="ok" icon={<BellRing size={11} aria-hidden="true" />}>
                {vista.listos} para servir
              </Badge>
            )}
            {vista.enCocina > 0 && (
              <Badge tone="idle" icon={<ChefHat size={11} aria-hidden="true" />}>
                {vista.enCocina} en cocina
              </Badge>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

function CabeceraDetalle({ vista, ahora }: { vista: MesaVista; ahora: number }) {
  const e = ESTADO_MESA[vista.estado];
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-display text-2xl leading-none font-bold text-ink">Mesa {vista.mesa.label}</h2>
        <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
          {vista.mesa.zone} · {vista.mesa.seats} sillas
          {vista.ocupacion && ahora > 0 && (
            <>
              {" "}· abierta a las {HORA.format(Date.parse(vista.ocupacion.abiertaEn))} ·{" "}
              {vista.ocupacion.comensales} {vista.ocupacion.comensales === 1 ? "persona" : "personas"}
            </>
          )}
        </p>
      </div>
      <Badge tone={e.tono} icon={e.icono}>
        {e.texto}
      </Badge>
    </header>
  );
}

function NinosDeLaMesa({ vista, onVincular }: { vista: MesaVista; onVincular: () => void }) {
  const sim = useSimulacion();
  const ids = vista.ocupacion?.sesiones ?? [];
  const nombre = (id: string) => {
    const s = sim.estado.sesiones.find((x) => x.id === id);
    return s ? (s.kid.nickname ?? s.kid.name) : `${sim.estado.nombres[id] ?? "Niño"} (ya salió)`;
  };
  return (
    <section aria-label="Niños vinculados">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Niños vinculados</h3>
        {vista.estado !== "POR_LIMPIAR" && (
          <Button variant="ghost" onClick={onVincular} className="-mr-2 text-[13px]">
            <Link2 size={15} aria-hidden="true" />
            Vincular
          </Button>
        )}
      </div>
      {ids.length === 0 ? (
        <p className="text-[13px] text-ink-3">Ninguno. Si la familia tiene niños jugando, vincúlalos: pagan todo junto.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {ids.map((id) => (
            <li key={id}>
              <Badge tone="idle" icon={<Baby size={12} aria-hidden="true" />}>
                {nombre(id)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PedidosDeLaMesa({
  vista,
  ahora,
  borrador,
  onEntregar,
}: {
  vista: MesaVista;
  ahora: number;
  borrador: number;
  onEntregar: (p: Pedido) => void;
}) {
  return (
    <section aria-label="Pedidos de la mesa">
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Pedidos</h3>
      {borrador > 0 && (
        <p className="mb-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2 text-[13px] text-ink-2">
          <NotebookPen size={14} aria-hidden="true" />
          Borrador sin enviar · {borrador === 1 ? "1 plato" : `${borrador} platos`}
        </p>
      )}
      {vista.pedidos.length === 0 ? (
        <p className="text-[13px] text-ink-3">Todavía no ha pedido nada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vista.pedidos.map((p) => {
            const e = ESTADO_PEDIDO[p.estado];
            const listo = p.estado === "LISTO";
            return (
              <li
                key={p.id}
                className={cn(
                  "rounded-[var(--radius-control)] border px-3 py-2.5",
                  listo ? "border-state-ok/50 bg-state-ok-bg" : "border-line bg-base/40",
                  (p.estado === "ENTREGADO" || p.estado === "ANULADO") && "opacity-70",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={e.tono} icon={e.icono}>
                    {e.texto}
                  </Badge>
                  <span className="tnum text-[12px] text-ink-3">
                    {ahora > 0 && `enviado hace ${minutosDesde(p.enviadoEn, ahora)} min`}
                  </span>
                </div>
                <p className={cn("mt-1.5 text-[13px] text-ink", p.estado === "ANULADO" && "line-through")}>
                  {p.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
                </p>
                {listo && (
                  <Button variant="primary" onClick={() => onEntregar(p)} className="mt-2 w-full">
                    <HandPlatter size={16} aria-hidden="true" />
                    Entregado en la mesa
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
