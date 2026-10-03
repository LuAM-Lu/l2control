"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Baby,
  CircleCheckBig,
  Clock,
  DoorOpen,
  HandPlatter,
  Link2,
  NotebookPen,
  Printer,
  Receipt,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { CatalogoDto, EstadoDeComandaDto, FamilyAccountDto, MotivoAnulacionPedido, PedidoDto, Rechazo } from "@l2/contracts";
import Link from "next/link";
import type { Route } from "next";
import { Badge, Button, Confirmacion, Container, StatTile, Stepper, avisar, cn, type Tone } from "@l2/ui";
import { chargeableLines } from "@l2/domain-cash";
import { useAhoraLocal, useOperacion } from "../operacion/OperacionProvider.tsx";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { nombreDeEstancia } from "../park/view-model.ts";
import {
  abrirCuentaDeMesa,
  numeroDeOrden,
  pasarACaja,
} from "../cuentas/cuentas.ts";
import {
  loQuePideAtencion,
  minutosDesde,
  vistaDelPlano,
  type EstadoVisible,
  type LineaBorrador,
  type MesaVista,
} from "./mesas.ts";
import { PlanoLocal } from "./PlanoLocal.tsx";
import { usePlano } from "./PlanoProvider.tsx";
import { cartaDelMesero } from "../inventario/catalogo.ts";
import { TomaPedido } from "./TomaPedido.tsx";
import { VincularPulseras } from "./VincularPulseras.tsx";
import { AnularPedidoDialog } from "./AnularPedidoDialog.tsx";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { usePedidos } from "./PedidosProvider.tsx";
import { liberarMesa, vincularPulseras } from "./mesas.acciones.ts";

/**
 * Estación del mesero: mesas y pedidos — F6-01, F6-02, F6-05, DEC-22.
 *
 * Maestro-detalle a pantalla fija (1366×768 y tablet 1280×800 sin desplazar
 * la página): el plano a la izquierda, lo que pasa en la mesa elegida a la
 * derecha. Tomar un pedido cambia la pantalla a carta + ticket, porque la
 * carta necesita el ancho que ocupa el plano; vincular pulseras abre una hoja
 * lateral porque es una tarea corta sobre la mesa que se está viendo.
 *
 * El plano y la carta son del servidor (B6-1): el plano publicado en Ajustes y la carta, que es el
 * catálogo con lo marcado «en la carta». La cuenta de la mesa también: una mesa tiene una sola abierta
 * (I-05, lo impone el servidor) y lo pedido lleva su producto, cuyo precio comprueba el servidor.
 *
 * El pedido es del servidor (B6-2, ADR-022): al enviarlo entra en la cuenta de la mesa y su comanda en
 * la impresora de comandas, juntos. La cocina trabaja con el papel: aquí no hay «listo» ni «entregado»,
 * sino si la comanda salió; si no salió, se ve y se reimprime. El estado de cada mesa (abierta, pide la
 * cuenta, por limpiar) viaja aún por el bus del local hasta B6-3.
 *
 * El mesero NO toca dinero (DEC-14): marca que la mesa pide la cuenta y la
 * familia paga en caja.
 */


const ESTADO_MESA: Readonly<Record<EstadoVisible, { texto: string; tono: Tone; icono: React.ReactNode }>> = {
  LIBRE: { texto: "Libre", tono: "idle", icono: <Sparkles size={14} aria-hidden="true" /> },
  OCUPADA: { texto: "Ocupada", tono: "idle", icono: <Users size={14} aria-hidden="true" /> },
  PIDE_CUENTA: { texto: "Pide la cuenta", tono: "warn", icono: <Receipt size={14} aria-hidden="true" /> },
  POR_LIMPIAR: { texto: "Por limpiar", tono: "idle", icono: <Sparkles size={14} aria-hidden="true" /> },
};

/** La comanda en el papel: lo único que el sistema sabe de la cocina (ADR-022). Color + icono + texto. */
const ESTADO_COMANDA: Readonly<Record<EstadoDeComandaDto, { texto: string; tono: Tone; icono: React.ReactNode }>> = {
  EN_COLA: { texto: "Imprimiendo comanda", tono: "idle", icono: <Clock size={13} aria-hidden="true" /> },
  IMPRESA: { texto: "Comanda impresa", tono: "ok", icono: <Printer size={13} aria-hidden="true" /> },
  NO_SALIO: { texto: "La comanda no salió", tono: "crit", icono: <TriangleAlert size={13} aria-hidden="true" /> },
  DESCARTADA: { texto: "Comanda descartada", tono: "idle", icono: <Ban size={13} aria-hidden="true" /> },
};

const comanda = (n: number) => `#${String(n).padStart(4, "0")}`;

export function MesasScreen({ catalogo }: { catalogo: CatalogoDto }) {
  // El plano lo publica administración desde el panel (V4, B6-1); aquí solo se lee.
  const { plano } = usePlano();
  // La cuenta de la mesa (F6-05, D2): los platos y el parque de esta familia.
  const { cuentas, guardar, adoptar, anularPedido: anularPedidoDeLaCuenta } = useCuentas();
  // Los pedidos y su comanda, del servidor (B6-2).
  const { pedidos, enviar: enviarPedido, reimprimir } = usePedidos();
  const op = useOperacion();
  const ahora = useAhoraLocal();
  const { estado } = op;
  // La carta con el precio de este instante: un precio programado entra a su hora sin recargar.
  const carta = useMemo(() => (ahora > 0 ? cartaDelMesero(catalogo, ahora) : []), [catalogo, ahora]);

  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [vista, setVista] = useState<"plano" | "pedido">("plano");
  /**
   * Plano espacial o «Atender» (V3).
   *
   * «Atender» no repite el plano: enumera solo lo que pide acción, en el orden
   * en que conviene hacerlo. En pantalla estrecha arranca ahí, porque un plano
   * de 8 metros en un teléfono no se lee.
   */
  const [modo, setModo] = useState<"PLANO" | "ATENDER">("PLANO");
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setModo("ATENDER");
  }, []);
  const [borradores, setBorradores] = useState<Readonly<Record<string, LineaBorrador[]>>>({});
  const [vinculando, setVinculando] = useState(false);
  const [anulando, setAnulando] = useState<PedidoDto | null>(null);
  /** La mesa que se va a liberar sin consumo (B6-5), mientras se confirma. */
  const [liberando, setLiberando] = useState<MesaVista | null>(null);
  const [liberandoEnvio, setLiberandoEnvio] = useState(false);
  const [comensales, setComensales] = useState(2);
  /** El id del pedido que se está enviando en cada mesa: reintentarlo (se cortó la red) no pide dos veces. */
  const [envios, setEnvios] = useState<Readonly<Record<string, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const detalle = useRef<HTMLElement>(null);

  // Una mesa retirada ya no está en el salón: no se pinta ni se puede abrir.
  const mesas = useMemo(
    () => vistaDelPlano((plano?.tables ?? []).filter((m) => !m.retiredAt), estado, cuentas, pedidos, ahora),
    [plano, estado, cuentas, pedidos, ahora],
  );
  const elegida = mesas.find((m) => m.mesa.id === seleccion) ?? null;

  const ocupadas = mesas.filter((m) => m.estado !== "LIBRE").length;
  const pidenCuenta = mesas.filter((m) => m.estado === "PIDE_CUENTA").length;
  // Las comandas de hoy que no salieron en papel, de cualquier mesa: la cocina no sabe que existen.
  const sinSalir = pedidos.filter((p) => p.comanda.estado === "NO_SALIO");

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

  const emitir = (ev: Parameters<typeof op.emitir>[0], exito: string): boolean => {
    const r = op.emitir(ev);
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

  /**
   * La cuenta de esta ocupación de la mesa: la de la mesa que no se ha cobrado.
   * Se crea al primer pedido o al primer vínculo, y muere con el cobro: la
   * siguiente familia que se siente abre otra.
   */
  function cuentaDeLaMesa(m: MesaVista): FamilyAccountDto {
    if (!m.ocupacion) throw new Error("La mesa no está abierta");
    // Una incobrable (D-JOR) ya se cerró, como una cobrada: la mesa abre otra.
    return m.cuenta ?? abrirCuentaDeMesa({ tableId: m.mesa.id, tableLabel: m.mesa.label, ahora: new Date().toISOString() });
  }

  /**
   * Vincula pulseras a la mesa, en el servidor (F6-05, D2, B6-3): lo pendiente del parque de esas
   * estancias pasa a la cuenta de la mesa, para que la familia pague de una vez. Devuelve si quedó
   * hecho, para que la hoja se cierre solo si no hubo que avisar de nada.
   */
  async function vincular(m: MesaVista, ids: string[]): Promise<boolean> {
    if (!m.ocupacion || ids.length === 0) return false;
    const r = await vincularPulseras({ idempotencyKey: crypto.randomUUID(), tableId: m.mesa.id, sessionIds: ids });
    if (!r.ok) {
      avisar.error(r.mensaje);
      return false;
    }
    adoptar(r.valor.mesa);
    for (const familia of r.valor.familias) adoptar(familia);
    const movidas = r.valor.familias.reduce((n, f) => n + f.lines.filter((l) => l.movedTo === r.valor.mesa.id).length, 0);
    avisar.ok(`${ids.length === 1 ? "1 niño vinculado" : `${ids.length} niños vinculados`} a la mesa ${m.mesa.label}`);
    if (movidas > 0) {
      avisar.info(`El parque de ${movidas === 1 ? "un niño" : "esos niños"} pasa a la cuenta de la mesa`, {
        detalle: "La familia lo paga todo junto en caja.",
      });
    }
    return true;
  }

  /**
   * Envía el borrador (B6-2): en el servidor, sus platos entran en la cuenta de la mesa y su comanda en
   * la impresora de comandas, juntos o nada. El precio, el IVA y la existencia los comprueba el servidor;
   * lo que la tablet enseñó viaja para comprobarlo. Fail-closed: si algo del borrador ya no está en la
   * carta, no se envía nada.
   */
  async function enviar(m: MesaVista) {
    const lineas = borradores[m.mesa.id] ?? [];
    const platos = lineas.flatMap((l) => {
      const it = carta.find((i) => i.id === l.itemId);
      return it ? [{ it, l }] : [];
    });
    if (platos.length !== lineas.length || platos.length === 0) {
      avisar.error("El borrador tiene platos que ya no están en la carta");
      return;
    }
    const pedidoId = envios[m.mesa.id] ?? globalThis.crypto.randomUUID();
    setEnvios((e) => ({ ...e, [m.mesa.id]: pedidoId }));
    setEnviando(true);
    const r = await enviarPedido({
      pedidoId,
      tableId: m.mesa.id,
      lineas: platos.map(({ it, l }) => ({
        productId: it.id,
        cantidad: l.cantidad,
        ...(l.nota ? { nota: l.nota } : {}),
        precioMinor: String(it.precio.amount),
      })),
    });
    setEnviando(false);
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    const { pedido } = r.valor;
    avisar.ok(`Comanda ${comanda(pedido.numero)} enviada · Mesa ${pedido.mesa}`, {
      detalle: pedido.comanda.impresora ? `Sale en «${pedido.comanda.impresora}».` : "Sale en la impresora de comandas.",
    });
    setEnvios((e) => {
      const { [m.mesa.id]: _, ...resto } = e;
      return resto;
    });
    setBorradores((b) => ({ ...b, [m.mesa.id]: [] }));
    setVista("plano");
  }

  /** Si no salió o se descartó, sale como la primera vez; si ya salió, una copia marcada «reimpresión». */
  async function volverAImprimir(p: PedidoDto) {
    const r = await reimprimir(p.id);
    if (!r.ok) avisar.error(r.mensaje);
    else if (p.comanda.estado === "IMPRESA") avisar.info(`Copia de la comanda ${comanda(p.numero)} a la impresora`, { detalle: "Sale marcada «reimpresión»: que no se prepare dos veces." });
    else avisar.info(`Comanda ${comanda(p.numero)} otra vez a la impresora`, { detalle: "La cocina todavía no la tenía." });
  }

  /**
   * Anula de una vez todos los platos de este pedido que todavía se deban (F6-14, B6-6): la cuenta de la
   * mesa ya no los cobra, el inventario va según si la cocina los preparó y a la cocina le sale un papel
   * «ANULAR». Todo o nada: si otro equipo cambió la cuenta mientras tanto, no se anula ninguno.
   */
  async function aplicarAnulacion(
    pedido: PedidoDto,
    motivo: MotivoAnulacionPedido,
    detalle: string | undefined,
    preparado: boolean,
    autorizacion: unknown,
  ): Promise<Rechazo | null> {
    const cuenta = elegida?.cuenta;
    if (!cuenta) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "La cuenta de la mesa ya no está disponible." };
    const lineIds = cuenta.lines.filter((l) => l.orderId === pedido.id && !l.paid && !l.movedTo && !l.cortesia && !l.anulacion).map((l) => l.id);
    const r = await anularPedidoDeLaCuenta(
      { idempotencyKey: crypto.randomUUID(), accountId: cuenta.id, version: cuenta.version!, lineIds, motivo, preparado, ...(detalle ? { detalle } : {}) },
      autorizacion,
    );
    if (!r.ok) return r;
    avisar.ok(`Comanda ${comanda(pedido.numero)} anulada`, {
      detalle: `${preparado ? "Sale como merma" : "Vuelve al inventario"}. A la cocina le sale el papel «ANULAR».`,
    });
    return null;
  }

  /**
   * Libera una mesa sin nada que cobrar (B6-5, M-18): no pidieron, o todo se anuló o se regaló. Si la
   * mesa tiene cuenta en el servidor, se cierra «sin consumo» allí primero; si no, solo se libera el salón.
   */
  async function liberar(m: MesaVista) {
    const cuenta = m.cuenta;
    if (cuenta?.version !== undefined) {
      setLiberandoEnvio(true);
      const r = await liberarMesa({ idempotencyKey: crypto.randomUUID(), accountId: cuenta.id, version: cuenta.version }).catch(() => null);
      setLiberandoEnvio(false);
      if (!r) {
        avisar.error("Sin conexión con el servidor: la mesa no se liberó. Vuelve a intentarlo.");
        return;
      }
      if (!r.ok) {
        avisar.error(r.mensaje);
        return;
      }
      adoptar(r.valor);
    }
    setLiberando(null);
    emitir({ type: "mesa.libre", tableId: m.mesa.id }, `Mesa ${m.mesa.label} libre: no hubo nada que cobrar`);
  }

  /** La mesa pide la cuenta: el mesero no cobra (DEC-14), la manda a caja. */
  function pedirLaCuenta(m: MesaVista) {
    const cuenta = pasarACaja(cuentaDeLaMesa(m));
    if (cuenta.status !== "POR_COBRAR") {
      avisar.error(`La mesa ${m.mesa.label} no tiene nada que cobrar: libérala`);
      return;
    }
    if (!emitir({ type: "mesa.pide_cuenta", tableId: m.mesa.id }, `Mesa ${m.mesa.label}: la cuenta pasa a caja`)) return;
    guardar(cuenta);
    avisar.info(`${numeroDeOrden(cuenta)} en la cola de la caja`, {
      detalle: "La familia paga ahí: el mesero no toca dinero (DEC-14).",
    });
  }

  const bloqueoEnvio = (m: MesaVista | null): string | null =>
    !m || m.estado === "LIBRE"
      ? "La mesa no está abierta"
      : m.estado === "POR_LIMPIAR"
        ? "La mesa ya pagó y está por limpiar"
        : null;

  /* ── un local sin plano: se dice dónde se dibuja, sin inventar mesas ── */
  if (!plano) {
    return (
      <div className="flex flex-1 flex-col apaisado:min-h-0">
        <Cabecera titulo="Mesas" subtitulo="El salón del local" />
        <Container as="main" ancho="operacion" className="flex flex-1 items-center justify-center py-10">
          <div role="status" className="flex max-w-md flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface px-6 py-10 text-center">
            <HandPlatter size={30} aria-hidden="true" className="text-ink-3" />
            <p className="font-display text-lg font-bold text-ink">Todavía no hay plano del local</p>
            <p className="text-[13.5px] text-ink-2">
              Sin plano no hay mesas que atender. Administración lo dibuja y lo publica en Ajustes → Plano del local, y aparece aquí al momento.
            </p>
            <Link
              href={"/panel/ajustes/plano" as Route}
              className="flex min-h-12 items-center rounded-[var(--radius-control)] border border-line px-4 text-[14px] font-semibold text-ink no-underline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
            >
              Ir a Ajustes → Plano del local
            </Link>
          </div>
        </Container>
      </div>
    );
  }

  /* ── vista de pedido: carta + ticket ── */
  if (vista === "pedido" && elegida) {
    return (
      <div className="flex flex-1 flex-col apaisado:min-h-0">
        <Cabecera titulo={`Pedido · Mesa ${elegida.mesa.label}`} subtitulo="Borrador: la cocina lo verá cuando lo envíes" />
        <Container
          as="main"
          ancho="operacion"
          className="grid flex-1 content-start gap-5 py-4 apaisado:min-h-0 apaisado:grid-cols-[3fr_2fr] apaisado:grid-rows-[minmax(0,1fr)] apaisado:content-stretch"
        >
          <TomaPedido
            mesaLabel={elegida.mesa.label}
            carta={carta}
            lineas={borradores[elegida.mesa.id] ?? []}
            onCambiar={(l) => setBorradores((b) => ({ ...b, [elegida.mesa.id]: l }))}
            onEnviar={() => void enviar(elegida)}
            enviando={enviando}
            onVolver={() => setVista("plano")}
            bloqueo={bloqueoEnvio(elegida)}
          />
        </Container>
      </div>
    );
  }

  /* ── vista de plano: mesas + detalle ── */
  return (
    <div className="flex flex-1 flex-col apaisado:min-h-0">
      <Cabecera
        titulo="Mesas"
        subtitulo="Toca una mesa para ver sus pedidos"
        vista={
          <div role="radiogroup" aria-label="Cómo ver las mesas" className="flex gap-1 rounded-[var(--radius-control)] bg-surface/70 p-1">
            {([["PLANO", "Plano"], ["ATENDER", "Atender"]] as const).map(([id, texto]) => (
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
        }
        cifras={
          <>
            <StatTile label="Ocupadas" value={ocupadas} suffix={`de ${mesas.length}`} />
            <StatTile label="Comandas hoy" value={pedidos.length} icon={<Printer size={11} aria-hidden="true" />} />
            <StatTile
              label="No salieron"
              value={sinSalir.length}
              tone={sinSalir.length > 0 ? "crit" : "idle"}
              icon={<TriangleAlert size={11} aria-hidden="true" />}
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

      {sinSalir.length > 0 && (
        <p
          role="alert"
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-state-crit/40 bg-state-crit-bg px-4 py-2 text-[13px] text-state-crit"
        >
          <Printer size={15} aria-hidden="true" />
          <strong className="font-semibold">
            {sinSalir.length === 1 ? "Una comanda no salió en papel" : `${sinSalir.length} comandas no salieron en papel`}:
          </strong>
          {sinSalir.map((p) => `${comanda(p.numero)} · Mesa ${p.mesa}`).join(", ")}. Vuelve a imprimirla desde su mesa o avisa en cocina.
        </p>
      )}

      <Container
        as="main"
        ancho="operacion"
        className="grid flex-1 content-start gap-5 py-4 apaisado:min-h-0 apaisado:grid-cols-[3fr_2fr] apaisado:grid-rows-[minmax(0,1fr)] apaisado:content-stretch"
      >
        <section aria-label="Plano de mesas" className="flex min-w-0 flex-col gap-3 apaisado:min-h-0 apaisado:overflow-y-auto">
          {modo === "PLANO" ? (
            <PlanoLocal plano={plano} mesas={mesas} elegida={seleccion} onElegir={elegir} className="apaisado:min-h-0" />
          ) : (
            <Atender mesas={mesas} elegida={seleccion} onElegir={elegir} />
          )}
        </section>

        <aside
          ref={detalle}
          aria-label="Detalle de la mesa"
          className="flex min-w-0 scroll-mt-20 flex-col rounded-[var(--radius-card)] border border-line bg-surface apaisado:min-h-0"
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
              <div className="flex flex-1 flex-col gap-4 px-4 py-3 apaisado:min-h-0 apaisado:overflow-y-auto">
                <NinosDeLaMesa vista={elegida} onVincular={() => setVinculando(true)} />
                <PedidosDeLaMesa
                  vista={elegida}
                  ahora={ahora}
                  borrador={(borradores[elegida.mesa.id] ?? []).reduce((n, l) => n + l.cantidad, 0)}
                  onReimprimir={(p) => void volverAImprimir(p)}
                  onAnular={(p) => setAnulando(p)}
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
                    {!elegida.cuenta || chargeableLines(elegida.cuenta).length === 0 ? (
                      // Nada que cobrar (B6-5): no se manda a la caja, se libera.
                      <Button variant="neutral" onClick={() => setLiberando(elegida)} className="w-full">
                        <DoorOpen size={16} aria-hidden="true" />
                        Liberar mesa
                      </Button>
                    ) : elegida.estado === "OCUPADA" ? (
                      <Button
                        variant="neutral"
                        onClick={() => pedirLaCuenta(elegida)}
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
                cuentas={cuentas}
                onVincular={(ids) => vincular(elegida, ids)}
              />
              <Confirmacion
                abierto={liberando !== null}
                onCerrar={() => setLiberando(null)}
                titulo={`Liberar la mesa ${liberando?.mesa.label ?? ""}`}
                confirmar="Sí, liberar"
                ocupado={liberandoEnvio}
                onConfirmar={() => void (liberando && liberar(liberando))}
              >
                <p>
                  {liberando?.cuenta && liberando.cuenta.lines.length > 0
                    ? "Lo que se pidió está anulado o regalado: no hay nada que cobrar. La cuenta se cierra sin consumo y la mesa queda libre."
                    : "No pidieron nada. La mesa queda libre para otra familia."}
                </p>
                {(borradores[liberando?.mesa.id ?? ""] ?? []).length > 0 && (
                  <p className="mt-2 text-state-warn">El pedido sin enviar de esta mesa se descarta.</p>
                )}
              </Confirmacion>
              <AnularPedidoDialog
                pedido={anulando}
                onCerrar={() => setAnulando(null)}
                onAplicar={async (motivo, detalle, preparado, autorizacion) => {
                  const rechazo = await aplicarAnulacion(anulando!, motivo, detalle, preparado, autorizacion);
                  if (!rechazo) setAnulando(null);
                  return rechazo;
                }}
              />
            </>
          )}
        </aside>
      </Container>
    </div>
  );
}

/* ───────────────────────────────────────────────────── piezas ── */

function Cabecera({
  titulo,
  subtitulo,
  vista,
  cifras,
}: {
  titulo: string;
  subtitulo: string;
  /** Conmutador de la pantalla: va aquí arriba, no sobre el contenido. */
  vista?: React.ReactNode;
  cifras?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 py-3">
        {/* El conmutador primero: es lo que más se toca, y en el borde
            izquierdo cae donde ya está la mano al volver del plano. */}
        <div className="flex min-w-0 items-end gap-5">
          {vista}
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">{titulo}</h1>
            <p className="mt-1.5 text-[13px] text-ink-3">{subtitulo}</p>
          </div>
        </div>
        {cifras && <div className="flex items-end gap-6">{cifras}</div>}
      </Container>
    </header>
  );
}

/**
 * «Atender»: solo lo que pide acción, en el orden en que conviene hacerlo.
 *
 * No es el plano en forma de lista —eso sería repetir lo mismo con más ruido—,
 * sino la cola de trabajo del mesero: platos que se enfrían, quien quiere
 * pagar, mesas que bloquean y mesas largas. En el teléfono es la vista de
 * entrada, porque un plano de ocho metros ahí no se lee.
 */
function Atender({
  mesas,
  elegida,
  onElegir,
}: {
  mesas: readonly MesaVista[];
  elegida: string | null;
  onElegir: (id: string) => void;
}) {
  const filas = loQuePideAtencion(mesas);
  if (filas.length === 0) {
    return (
      <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/40 px-6 text-center">
        <CircleCheckBig size={26} className="text-state-ok" aria-hidden="true" />
        <p className="font-display text-lg font-bold text-ink">Nada que atender ahora</p>
        <p className="text-[13px] text-ink-2">Aquí saldrán las comandas que no salgan en papel, quien pida la cuenta y las mesas por limpiar.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((f) => {
        const v = f.vista;
        return (
          <li key={`${v.mesa.id}-${f.orden}`}>
            <button
              type="button"
              aria-pressed={v.mesa.id === elegida}
              onClick={() => onElegir(v.mesa.id)}
              className={cn(
                "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                f.tono === "crit"
                  ? "border-state-crit/40 bg-state-crit-bg/40"
                  : f.tono === "warn"
                    ? "border-state-warn/40 bg-state-warn-bg/40"
                    : "border-line bg-surface",
                v.mesa.id === elegida && "ring-2 ring-brand",
              )}
            >
              <span className="font-display w-10 shrink-0 text-center text-2xl leading-none font-bold text-ink">
                {v.mesa.label}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[14px] font-semibold",
                    f.tono === "crit" ? "text-state-crit" : f.tono === "warn" ? "text-state-warn" : "text-ink",
                  )}
                >
                  {f.que}
                </span>
                <span className="block truncate text-[12px] text-ink-3">
                  {v.mesa.zone}
                  {v.ocupacion ? ` · ${v.ocupacion.comensales} de ${v.mesa.seats} sillas` : ""}
                </span>
              </span>
              {f.tono === "crit" ? (
                <Printer size={18} className="shrink-0 text-state-crit" aria-hidden="true" />
              ) : f.tono === "warn" ? (
                <Receipt size={18} className="shrink-0 text-state-warn" aria-hidden="true" />
              ) : (
                <Sparkles size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CabeceraDetalle({ vista, ahora }: { vista: MesaVista; ahora: number }) {
  const hora = useHora();
  const e = ESTADO_MESA[vista.estado];
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-display text-2xl leading-none font-bold text-ink">Mesa {vista.mesa.label}</h2>
        <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
          {vista.mesa.zone} · {vista.mesa.seats} sillas
          {vista.ocupacion && ahora > 0 && (
            <>
              {" "}· abierta a las {hora(Date.parse(vista.ocupacion.abiertaEn))} ·{" "}
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
  const op = useOperacion();
  const ids = vista.cuenta?.sessionIds ?? [];
  const nombre = (id: string) => {
    const s = op.estado.sesiones.find((x) => x.id === id);
    return s ? nombreDeEstancia(s) : `${op.estado.nombres[id] ?? "Niño"} (ya salió)`;
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
  onReimprimir,
  onAnular,
}: {
  vista: MesaVista;
  ahora: number;
  borrador: number;
  onReimprimir: (p: PedidoDto) => void;
  onAnular: (p: PedidoDto) => void;
}) {
  const hora = useHora();
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
            const e = ESTADO_COMANDA[p.comanda.estado];
            const propias = vista.cuenta?.lines.filter((l) => l.orderId === p.id) ?? [];
            const anulable = propias.some((l) => !l.paid && !l.movedTo && !l.cortesia && !l.anulacion);
            const anulado = propias.length > 0 && propias.every((l) => l.anulacion !== undefined);
            // Una comanda anulada no se reimprime: la cocina no tiene que preparar nada de ella.
            const fallo = p.comanda.estado === "NO_SALIO" && !anulado;
            // El papel «ANULAR» que no salió (B6-6): la cocina no se enteró y hay que decírselo.
            const anulacionSinPapel = p.anulacion?.estado === "NO_SALIO";
            return (
              <li key={p.id} className={cn("rounded-[var(--radius-control)] border px-3 py-2.5", fallo || anulacionSinPapel ? "border-state-crit/50 bg-state-crit-bg" : "border-line bg-base/40")}>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={anulado ? "idle" : e.tono} icon={anulado ? <Ban size={13} aria-hidden="true" /> : e.icono}>
                    {anulado ? "Pedido anulado" : e.texto}
                  </Badge>
                  <span className="tnum text-[12px] text-ink-3">
                    {comanda(p.numero)} · {ahora > 0 ? `${hora(Date.parse(p.enviadoEn))} · hace ${minutosDesde(p.enviadoEn, ahora)} min` : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] text-ink">{p.lineas.map((l) => `${l.cantidad}× ${l.nombre}${l.nota ? ` («${l.nota}»)` : ""}`).join(" · ")}</p>
                {fallo && p.comanda.error && <p className="mt-1 text-[12.5px] text-state-crit">{p.comanda.error}</p>}
                {p.anulacion && (
                  <p
                    role={anulacionSinPapel ? "alert" : undefined}
                    className={cn("mt-1 flex items-start gap-1.5 text-[12.5px]", anulacionSinPapel ? "text-state-crit" : "text-ink-3")}
                  >
                    {anulacionSinPapel ? <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Printer size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    {anulacionSinPapel
                      ? `El papel «ANULAR» no salió${p.anulacion.error ? ` (${p.anulacion.error})` : ""}: avisa a la cocina de palabra.`
                      : p.anulacion.estado === "IMPRESA"
                        ? "Papel «ANULAR» impreso en cocina"
                        : p.anulacion.estado === "DESCARTADA"
                          ? "Papel «ANULAR» descartado"
                          : "Papel «ANULAR» imprimiéndose…"}
                  </p>
                )}
                {(fallo || p.comanda.estado === "DESCARTADA") && (
                  <Button variant={fallo ? "primary" : "neutral"} onClick={() => onReimprimir(p)} className="mt-2 w-full">
                    <RotateCcw size={16} aria-hidden="true" />
                    Volver a imprimir
                  </Button>
                )}
                {p.comanda.estado === "IMPRESA" && !anulado && (
                  <Button variant="ghost" onClick={() => onReimprimir(p)} className="mt-1 -mb-1 w-full text-[13px]">
                    <Printer size={15} aria-hidden="true" />
                    Se perdió el papel: imprimir una copia
                  </Button>
                )}
                {anulable && (
                  <Button variant="ghost" onClick={() => onAnular(p)} className="mt-1 -mb-1 w-full text-[13px] text-state-crit">
                    <Ban size={15} aria-hidden="true" />
                    Anular pedido
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
