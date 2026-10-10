"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Baby,
  CircleCheckBig,
  Clock,
  FileX,
  Hourglass,
  DoorOpen,
  HandPlatter,
  Link2,
  Unlink,
  NotebookPen,
  PersonStanding,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Undo2,
  Users,
  UserX,
  UserSearch,
  X,
} from "lucide-react";
import type {
  AreaDeComandaDto,
  CatalogoDto,
  ComandaDelPedidoDto,
  DatosDelClienteDto,
  EstadoDelPedidoDto,
  FamilyAccountDto,
  MotivoAnulacionPedido,
  PedidoDto,
  Rechazo,
} from "@l2/contracts";
import Link from "next/link";
import type { Route } from "next";
import { Badge, Button, Confirmacion, Container, Dialog, MoneyDisplay, StatTile, Stepper, avisar, cn, type Tone } from "@l2/ui";
import { chargeableLines } from "@l2/domain-cash";
import { toMajor } from "@l2/domain-money";
import { useAhoraLocal, useOperacion } from "../operacion/OperacionProvider.tsx";
import { DESHACER_SERVIDO_MS } from "@l2/domain-orders";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { nombreDeEstancia } from "../park/view-model.ts";
import { ninosDeLaMesa, nombreDeCuenta, numeroDeOrden, pasarACaja, pendiente } from "../cuentas/cuentas.ts";
import {
  loQuePideAtencion,
  minutosDesde,
  paraAtender,
  platoAnulado,
  platosSinServir,
  textoDePlatos,
  vistaDePie,
  vistaDelPlano,
  type EstadoVisible,
  type LineaBorrador,
  type MesaVista,
  type PieVista,
  type Urgencia,
} from "./mesas.ts";
import { PlanoLocal } from "./PlanoLocal.tsx";
import { usePlano } from "./PlanoProvider.tsx";
import { cartaDelMesero } from "../inventario/catalogo.ts";
import { TomaPedido } from "./TomaPedido.tsx";
import { VincularPulseras } from "./VincularPulseras.tsx";
import { DesvincularNino } from "./DesvincularNino.tsx";
import { AnularPedidoDialog } from "./AnularPedidoDialog.tsx";
import { useHora, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { usePedidos } from "./PedidosProvider.tsx";
import { abrirCuentaDelSalon, liberarMesa, vincularPulseras } from "./mesas.acciones.ts";
import { useSinGuardar } from "../shell/PuestaAlDia.tsx";
import { DatosDelCliente, SIN_DATOS, problemasDelCliente } from "../clientes/DatosDelCliente.tsx";
import { MarcarDeudaDialog } from "../deudas/MarcarDeudaDialog.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { usePorLimpiar } from "./porLimpiar.ts";
import { AvisosDelSalon } from "./AvisosDelSalon.tsx";
import { BuscadorDeClientes } from "../clientes/BuscadorDeClientes.tsx";

/**
 * Estación del mesero: mesas, cuentas y pedidos — F6-01, F6-02, F6-05, DEC-22, B6-7.
 *
 * Maestro-detalle a pantalla fija (1366×768 y tablet 1280×800 sin desplazar
 * la página): el plano a la izquierda, lo que pasa en la mesa elegida a la
 * derecha. Tomar un pedido cambia la pantalla a carta + ticket, porque la
 * carta necesita el ancho que ocupa el plano; vincular pulseras abre una hoja
 * lateral porque es una tarea corta sobre la mesa que se está viendo.
 *
 * TODO ES DEL SERVIDOR (B6-7). Sentar a una familia abre su cuenta en la mesa, con cuántas personas son;
 * desde ahí el plano sabe que la mesa está ocupada y desde cuándo. Una mesa compartida (familias distintas
 * en la misma mesa, por el aforo) tiene **una cuenta por familia**, cada una con su nombre: el mesero elige
 * a cuál pide, la comanda la nombra y cada una se cobra y se libera por separado. Quien pide de pie, sin
 * mesa, tiene su **cuenta de pie**. Del bus del salón queda solo «por limpiar».
 *
 * El pedido es del servidor (B6-2, ADR-022): al enviarlo entra en su cuenta y su comanda en la impresora
 * de comandas, juntos. La cocina trabaja con el papel: aquí no hay «listo» ni «entregado», sino si la
 * comanda salió; si no salió, se ve y se reimprime.
 *
 * El mesero NO toca dinero (DEC-14): marca que la cuenta se pide y la
 * familia paga en caja.
 */

const ESTADO_MESA: Readonly<Record<EstadoVisible, { texto: string; tono: Tone; icono: React.ReactNode }>> = {
  LIBRE: { texto: "Libre", tono: "idle", icono: <Sparkles size={14} aria-hidden="true" /> },
  OCUPADA: { texto: "Ocupada", tono: "idle", icono: <Users size={14} aria-hidden="true" /> },
  PIDE_CUENTA: { texto: "Pide la cuenta", tono: "warn", icono: <Receipt size={14} aria-hidden="true" /> },
  POR_LIMPIAR: { texto: "Por limpiar", tono: "idle", icono: <Sparkles size={14} aria-hidden="true" /> },
};

/** La comanda en el papel: lo único que el sistema sabe de la cocina (ADR-022). Color + icono + texto. */
const ESTADO_COMANDA: Readonly<Record<EstadoDelPedidoDto, { texto: string; corto: string; tono: Tone; icono: React.ReactNode }>> = {
  EN_COLA: { texto: "Imprimiendo comanda", corto: "imprimiéndose", tono: "idle", icono: <Clock size={13} aria-hidden="true" /> },
  IMPRESA: { texto: "Comanda impresa", corto: "impresa", tono: "ok", icono: <Printer size={13} aria-hidden="true" /> },
  NO_SALIO: { texto: "La comanda no salió", corto: "no salió", tono: "crit", icono: <TriangleAlert size={13} aria-hidden="true" /> },
  DESCARTADA: { texto: "Comanda descartada", corto: "descartada", tono: "idle", icono: <Ban size={13} aria-hidden="true" /> },
  // B6-10: todo lo del pedido se sirve sin papel.
  SIN_PAPEL: { texto: "Sin comanda", corto: "sin papel", tono: "idle", icono: <FileX size={13} aria-hidden="true" /> },
};

/** Cómo se nombra cada papel (B6-10); el de un pedido de antes, sin área, es «la comanda». */
const AREA: Readonly<Record<AreaDeComandaDto, { nombre: string; la: string }>> = { COCINA: { nombre: "Cocina", la: "la cocina" }, BARRA: { nombre: "Barra", la: "la barra" } };
const aQuien = (areas: readonly (AreaDeComandaDto | null)[]) => {
  const nombres = [...new Set(areas.map((a) => (a ? AREA[a].la : "la cocina")))];
  return nombres.length === 0 ? "nadie" : nombres.join(" y a ");
};

const comanda = (n: number) => `#${String(n).padStart(4, "0")}`;
/** «Mesa 3», «Mesa 3 · Familia Pérez» o «De pie · Sr. Luis»: cómo se nombra un pedido. */
const rotuloDePedido = (p: PedidoDto) => (p.tableId === null ? `De pie · ${p.nombreCuenta ?? ""}` : p.nombreCuenta ? `Mesa ${p.mesa} · ${p.nombreCuenta}` : `Mesa ${p.mesa}`);

/** Lo elegido en el salón: una mesa del plano o las cuentas de pie. */
const PIE = "PIE";

/** Un lugar del salón visto en el detalle: una mesa o «De pie». */
type Lugar = Readonly<{ tipo: "MESA"; vista: MesaVista } | { tipo: "PIE"; vista: PieVista }>;

export function MesasScreen({ catalogo }: { catalogo: CatalogoDto }) {
  // El plano lo publica administración desde el panel (V4, B6-1); aquí solo se lee.
  const { plano } = usePlano();
  // Las cuentas del salón (F6-05, D2, B6-7): una por familia en cada mesa, y las de pie.
  const { cuentas, guardar, adoptar, anularPedido: anularPedidoDeLaCuenta, cerrarSinCobrar } = useCuentas();
  // B6-13: cerrar la mesa sin cobrar es de supervisión y administración (M-35).
  const actor = useActorEnSesion();
  // B6-14: las mesas por limpiar, del servidor.
  const { porId: porLimpiar, marcarLimpia } = usePorLimpiar();
  const cierraSinCobrar = actor?.role === "ADMIN" || actor?.role === "SUPERVISOR";
  // Los pedidos y su comanda, del servidor (B6-2).
  const { pedidos, enviar: enviarPedido, reimprimir, servir, deshacer } = usePedidos();
  // Los umbrales de la atención en el salón (B6-8).
  const { atencionSinPedirMin, atencionEsperaMin } = useSucursal().ajustes;
  const op = useOperacion();
  const ahora = useAhoraLocal();
  const { estado } = op;
  // La carta con el precio de este instante: un precio programado entra a su hora sin recargar.
  const carta = useMemo(() => (ahora > 0 ? cartaDelMesero(catalogo, ahora) : []), [catalogo, ahora]);

  /** La mesa elegida (su id) o `PIE`. */
  const [seleccion, setSeleccion] = useState<string | null>(null);
  /** La cuenta elegida dentro del lugar; sin ella, la primera. */
  const [cuentaSel, setCuentaSel] = useState<string | null>(null);
  /** Sentando a una familia más en una mesa ya ocupada, o abriendo otra cuenta de pie. */
  const [sentando, setSentando] = useState(false);
  /** El buscador de clientes (T-19): ¿dónde está sentado, qué tiene abierto, qué debe? */
  const [buscandoCliente, setBuscandoCliente] = useState(false);
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
  /** El borrador del pedido de cada cuenta. */
  const [borradores, setBorradores] = useState<Readonly<Record<string, LineaBorrador[]>>>({});
  // Un pedido sin enviar no se pierde porque llegue una versión nueva (T-8b).
  useSinGuardar(Object.values(borradores).some((l) => l.length > 0));
  const [vinculando, setVinculando] = useState(false);
  const [anulando, setAnulando] = useState<PedidoDto | null>(null);
  /** La cuenta que se va a liberar sin consumo (B6-5), mientras se confirma. */
  const [liberando, setLiberando] = useState<FamilyAccountDto | null>(null);
  const [liberandoEnvio, setLiberandoEnvio] = useState(false);
  /** La cuenta cuyo cliente se fue sin pagar (B3-11), mientras se autoriza dejarla en deuda. */
  const [seFue, setSeFue] = useState<FamilyAccountDto | null>(null);
  /** B6-13: la mesa que se cierra sin cobrar (elegir: deuda o anular) y la que se anula entera. */
  const [cerrandoSinCobrar, setCerrandoSinCobrar] = useState<FamilyAccountDto | null>(null);
  const [anulandoMesa, setAnulandoMesa] = useState<FamilyAccountDto | null>(null);
  /** B6-13: al pedir la cuenta con platos sin marcar servidos, «¿Ya se sirvió todo?». */
  const [sinServir, setSinServir] = useState<{ cuenta: FamilyAccountDto; platos: { pedido: PedidoDto; lineas: number[] }[] } | null>(null);
  const [sirviendoTodo, setSirviendoTodo] = useState(false);
  /** El formulario de sentar: el cliente, con nombre, cédula y teléfono (B6-9, M-33), y cuántas personas. */
  const [cliente, setCliente] = useState<DatosDelClienteDto>(SIN_DATOS);
  /** Lo que falta o no vale, después de intentar sentar. */
  const [erroresCliente, setErroresCliente] = useState<ReturnType<typeof problemasDelCliente>>(null);
  const [comensales, setComensales] = useState(2);
  /** El id de la cuenta que se está abriendo: reintentarlo (se cortó la red) no abre dos. */
  const altaId = useRef<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  /** El id del pedido que se está enviando en cada cuenta: reintentarlo no pide dos veces. */
  const [envios, setEnvios] = useState<Readonly<Record<string, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const detalle = useRef<HTMLElement>(null);

  // Una mesa retirada ya no está en el salón: no se pinta ni se puede abrir.
  const mesas = useMemo(
    () => vistaDelPlano((plano?.tables ?? []).filter((m) => !m.retiredAt), porLimpiar, cuentas, pedidos, ahora),
    [plano, porLimpiar, cuentas, pedidos, ahora],
  );
  const pie = useMemo(() => vistaDePie(cuentas, pedidos, ahora), [cuentas, pedidos, ahora]);
  const lugar: Lugar | null =
    seleccion === PIE ? { tipo: "PIE", vista: pie } : (() => {
      const v = mesas.find((m) => m.mesa.id === seleccion);
      return v ? { tipo: "MESA", vista: v } : null;
    })();
  const cuentasDelLugar = lugar?.vista.cuentas ?? [];
  const cuenta = cuentasDelLugar.find((c) => c.id === cuentaSel) ?? cuentasDelLugar[0] ?? null;
  const formulario = lugar !== null && (sentando || cuentasDelLugar.length === 0);

  const ocupadas = mesas.filter((m) => m.cuentas.length > 0).length;
  const pidenCuenta = [...mesas.flatMap((m) => m.cuentas), ...pie.cuentas].filter((c) => c.status === "POR_COBRAR").length;
  // Las comandas de hoy que no salieron en papel, de cualquier cuenta: la cocina no sabe que existen.
  const sinSalir = pedidos.filter((p) => p.comanda.estado === "NO_SALIO");

  // El borrador de una cuenta que se cerró (cobrada, liberada) no pasa a nadie.
  const abiertas = useMemo(() => new Set([...mesas.flatMap((m) => m.cuentas), ...pie.cuentas].map((c) => c.id)), [mesas, pie]);
  useEffect(() => {
    setBorradores((b) => {
      const huerfanos = Object.keys(b).filter((id) => !abiertas.has(id));
      if (huerfanos.length === 0) return b;
      const limpio = { ...b };
      for (const id of huerfanos) delete limpio[id];
      return limpio;
    });
  }, [abiertas]);

  // Si la cuenta del pedido deja de estar abierta, se vuelve al plano: no se pide para una cuenta cerrada.
  useEffect(() => {
    if (vista === "pedido" && !cuenta) setVista("plano");
  }, [vista, cuenta]);

  const reiniciarFormulario = (lugarNuevo: string | null) => {
    setCliente(SIN_DATOS);
    setErroresCliente(null);
    setComensales(lugarNuevo === PIE ? 1 : 2);
    altaId.current = null;
  };

  const elegir = (id: string, cuentaId: string | null = null) => {
    if (id !== seleccion) {
      setSentando(false);
      reiniciarFormulario(id);
    }
    setSeleccion(id);
    setCuentaSel(cuentaId);
    // En pantallas estrechas el detalle queda debajo del plano.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => detalle.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  /* ── acciones: cada una va al servidor y adopta lo que devuelve ── */

  /**
   * Sienta a una familia (B6-7): abre su cuenta en la mesa —una más si ya tiene— o una cuenta de pie. El
   * servidor comprueba que la mesa tenga las cuentas que se ven aquí: si otro equipo abrió una, choca.
   */
  async function sentar(l: Lugar) {
    // Quien consume primero y paga al final deja sus datos (B6-9, M-33): sin ellos no se abre la cuenta.
    const problemas = problemasDelCliente(cliente);
    setErroresCliente(problemas);
    if (problemas) {
      avisar.error("Faltan los datos del cliente", { detalle: "Nombre, cédula y teléfono: sin ellos no se abre la cuenta." });
      return;
    }
    altaId.current ??= globalThis.crypto.randomUUID();
    setAbriendo(true);
    const r = await abrirCuentaDelSalon({
      cuentaId: altaId.current,
      ...(l.tipo === "MESA" ? { tableId: l.vista.mesa.id } : {}),
      cliente,
      comensales,
      vistas: l.vista.cuentas.length,
    }).catch(() => null);
    setAbriendo(false);
    if (!r) {
      avisar.error("Sin conexión con el servidor: la cuenta no se abrió. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      avisar.error(r.mensaje);
      // Un choque con otro equipo no se reintenta con el mismo id: la próxima vez se mira de nuevo.
      if (r.motivo === "CONFLICTO") altaId.current = null;
      return;
    }
    adoptar(r.valor);
    setCuentaSel(r.valor.id);
    setSentando(false);
    reiniciarFormulario(seleccion);
    avisar.ok(`${nombreDeCuenta(r.valor)} · ${comensales} ${comensales === 1 ? "persona" : "personas"}`, { detalle: "Ya se le puede tomar el pedido." });
  }

  /**
   * Vincula pulseras a la cuenta elegida de la mesa, en el servidor (F6-05, D2, B6-3, B6-7): lo pendiente
   * del parque de esas estancias pasa a esa cuenta, para que la familia pague de una vez. Devuelve si quedó
   * hecho, para que la hoja se cierre solo si no hubo que avisar de nada.
   */
  async function vincular(c: FamilyAccountDto, ids: string[]): Promise<boolean> {
    if (!c.tableId || ids.length === 0) return false;
    const r = await vincularPulseras({ idempotencyKey: crypto.randomUUID(), tableId: c.tableId, cuentaId: c.id, sessionIds: ids });
    if (!r.ok) {
      avisar.error(r.mensaje);
      return false;
    }
    adoptar(r.valor.mesa);
    for (const familia of r.valor.familias) adoptar(familia);
    const movidas = r.valor.familias.reduce((n, f) => n + f.lines.filter((l) => l.movedTo === r.valor.mesa.id).length, 0);
    avisar.ok(`${ids.length === 1 ? "1 niño vinculado" : `${ids.length} niños vinculados`} · ${nombreDeCuenta(r.valor.mesa)}`);
    if (movidas > 0) {
      avisar.info(`El parque de ${movidas === 1 ? "un niño" : "esos niños"} pasa a esta cuenta`, {
        detalle: "La familia lo paga todo junto en caja.",
      });
    }
    return true;
  }

  /**
   * Envía el borrador (B6-2): en el servidor, sus platos entran en la cuenta elegida y su comanda en la
   * impresora de comandas, juntos. El precio, el IVA y la existencia los comprueba el servidor; lo que la
   * tablet enseñó viaja para comprobarlo. Fail-closed: si algo del borrador ya no está en la carta, no se
   * envía nada.
   */
  async function enviar(c: FamilyAccountDto) {
    const lineas = borradores[c.id] ?? [];
    const platos = lineas.flatMap((l) => {
      const it = carta.find((i) => i.id === l.itemId);
      return it ? [{ it, l }] : [];
    });
    if (platos.length !== lineas.length || platos.length === 0) {
      avisar.error("El borrador tiene platos que ya no están en la carta");
      return;
    }
    const pedidoId = envios[c.id] ?? globalThis.crypto.randomUUID();
    setEnvios((e) => ({ ...e, [c.id]: pedidoId }));
    setEnviando(true);
    const r = await enviarPedido({
      pedidoId,
      ...(c.tableId ? { tableId: c.tableId } : {}),
      cuentaId: c.id,
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
    // Un papel por área (B6-10): dónde sale cada uno.
    avisar.ok(`Comanda ${comanda(pedido.numero)} enviada · ${rotuloDePedido(pedido)}`, {
      detalle:
        pedido.comandas.length === 0
          ? "Todo se sirve sin comanda: no sale papel."
          : pedido.comandas.map((c) => `${c.area ? `${AREA[c.area].nombre}: ` : ""}sale en «${c.impresora ?? "la impresora de comandas"}»`).join(" · ") + ".",
    });
    setEnvios((e) => {
      const { [c.id]: _, ...resto } = e;
      return resto;
    });
    setBorradores((b) => ({ ...b, [c.id]: [] }));
    setVista("plano");
  }

  /** Si no salió o se descartó, sale como la primera vez; si ya salió, una copia marcada «reimpresión». */
  async function volverAImprimir(p: PedidoDto, c: ComandaDelPedidoDto) {
    const r = await reimprimir(p.id, c.area);
    const cual = `${comanda(p.numero)}${c.area ? ` de ${AREA[c.area].nombre.toLowerCase()}` : ""}`;
    if (!r.ok) avisar.error(r.mensaje);
    else if (c.estado === "IMPRESA") avisar.info(`Copia de la comanda ${cual} a la impresora`, { detalle: "Sale marcada «reimpresión»: que no se prepare dos veces." });
    else avisar.info(`Comanda ${cual} otra vez a la impresora`, { detalle: `${aQuien([c.area]).replace(/^la /, "La ")} todavía no la tenía.` });
  }

  /**
   * Anula de una vez todos los platos de este pedido que todavía se deban (F6-14, B6-6): la cuenta ya no
   * los cobra, el inventario va según si la cocina los preparó y a la cocina le sale un papel «ANULAR».
   * Todo o nada: si otro equipo cambió la cuenta mientras tanto, no se anula ninguno.
   */
  async function aplicarAnulacion(
    pedido: PedidoDto,
    motivo: MotivoAnulacionPedido,
    detalleMotivo: string | undefined,
    preparado: boolean,
    autorizacion: unknown,
  ): Promise<Rechazo | null> {
    const suya = cuentas.find((c) => c.id === pedido.cuentaId);
    if (!suya) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "La cuenta del pedido ya no está disponible." };
    const lineIds = suya.lines.filter((l) => l.orderId === pedido.id && !l.paid && !l.movedTo && !l.cortesia && !l.anulacion).map((l) => l.id);
    const r = await anularPedidoDeLaCuenta(
      { idempotencyKey: crypto.randomUUID(), accountId: suya.id, version: suya.version!, lineIds, motivo, preparado, ...(detalleMotivo ? { detalle: detalleMotivo } : {}) },
      autorizacion,
    );
    if (!r.ok) return r;
    avisar.ok(`Comanda ${comanda(pedido.numero)} anulada`, {
      detalle: `${preparado ? "Sale como merma" : "Vuelve al inventario"}.${pedido.comandas.length > 0 ? ` A ${aQuien(pedido.comandas.map((c) => c.area))} le sale su papel «ANULAR».` : ""}`,
    });
    return null;
  }

  /**
   * Libera una cuenta sin nada que cobrar (B6-5, M-18): no pidieron, o todo se anuló o se regaló. Se cierra
   * «sin consumo» en el servidor. Si era la última de su mesa, la mesa queda libre.
   */
  async function liberar(c: FamilyAccountDto) {
    setLiberandoEnvio(true);
    const r = await liberarMesa({ idempotencyKey: crypto.randomUUID(), accountId: c.id, version: c.version! }).catch(() => null);
    setLiberandoEnvio(false);
    if (!r) {
      avisar.error("Sin conexión con el servidor: no se liberó. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    adoptar(r.valor);
    setLiberando(null);
    setCuentaSel(null);
    avisar.ok(`${nombreDeCuenta(c)}: libre, no hubo nada que cobrar`);
  }

  /**
   * B6-13: antes de pedir la cuenta, lo que falta por marcar servido. Si hay algo, «¿Ya se sirvió todo?»: «Sí» lo marca
   * servido sin hora exacta (la atención no lo mide) y pide la cuenta; «Pedir la cuenta igual» la pide sin marcar nada.
   */
  function pedirLaCuentaConServido(c: FamilyAccountDto) {
    const platos = platosSinServir(c, pedidos);
    if (platos.length === 0) return pedirLaCuenta(c);
    setSinServir({ cuenta: c, platos });
  }

  async function servirTodoYPedir() {
    if (!sinServir) return;
    setSirviendoTodo(true);
    for (const { pedido, lineas } of sinServir.platos) {
      const r = await servir(pedido.id, lineas, true);
      if (!r.ok) {
        setSirviendoTodo(false);
        avisar.error(r.mensaje);
        return;
      }
    }
    setSirviendoTodo(false);
    const c = sinServir.cuenta;
    setSinServir(null);
    pedirLaCuenta(c);
  }

  /** La cuenta se pide: el mesero no cobra (DEC-14), la manda a caja. */
  function pedirLaCuenta(c: FamilyAccountDto) {
    const lista = pasarACaja(c);
    if (lista.status !== "POR_COBRAR") {
      avisar.error(`${nombreDeCuenta(c)} no tiene nada que cobrar: libérala`);
      return;
    }
    guardar(lista);
    avisar.info(`${numeroDeOrden(lista)} · ${nombreDeCuenta(lista)} en la cola de la caja`, {
      detalle: "Pagan ahí: el mesero no toca dinero (DEC-14).",
    });
  }

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
  if (vista === "pedido" && cuenta) {
    return (
      <div className="flex flex-1 flex-col apaisado:min-h-0">
        <Cabecera titulo={`Pedido · ${nombreDeCuenta(cuenta)}`} subtitulo="Borrador: la cocina lo verá cuando lo envíes" />
        <Container
          as="main"
          ancho="operacion"
          className="grid flex-1 content-start gap-5 py-4 apaisado:min-h-0 apaisado:grid-cols-[3fr_2fr] apaisado:grid-rows-[minmax(0,1fr)] apaisado:content-stretch"
        >
          <TomaPedido
            rotulo={nombreDeCuenta(cuenta)}
            carta={carta}
            lineas={borradores[cuenta.id] ?? []}
            onCambiar={(l) => setBorradores((b) => ({ ...b, [cuenta.id]: l }))}
            onEnviar={() => void enviar(cuenta)}
            enviando={enviando}
            onVolver={() => setVista("plano")}
            bloqueo={null}
          />
        </Container>
      </div>
    );
  }

  /* ── vista de plano: mesas + detalle ── */
  const enEspera = (borradores[cuenta?.id ?? ""] ?? []).length > 0;
  return (
    <div className="flex flex-1 flex-col apaisado:min-h-0">
      {/* B6-14: los avisos suaves al salón (sin pedir, esperando, por limpiar). */}
      <AvisosDelSalon para="SALON" porLimpiar={porLimpiar} />
      <Cabecera
        titulo="Mesas"
        subtitulo="Toca una mesa, o «De pie», para atenderla"
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
            <Button variant="neutral" onClick={() => setBuscandoCliente(true)} className="self-center">
              <UserSearch size={16} aria-hidden="true" />
              Buscar cliente
            </Button>
            <StatTile label="Ocupadas" value={ocupadas} suffix={`de ${mesas.length}`} />
            <StatTile label="De pie" value={pie.cuentas.length} icon={<PersonStanding size={11} aria-hidden="true" />} />
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

      <BuscadorDeClientes
        abierto={buscandoCliente}
        onCerrar={() => setBuscandoCliente(false)}
        // El salón abre las cuentas de sus mesas y las de pie; la de una familia del parque es de la caja.
        puedeAbrir={(c) => c.kind === "MESA" || (c.kind === "MOSTRADOR" && c.dePie === true)}
        alAbrirCuenta={(c) => {
          setBuscandoCliente(false);
          setModo("PLANO");
          elegir(c.tableId ?? PIE, c.id);
        }}
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
          {sinSalir.map((p) => `${comanda(p.numero)} · ${rotuloDePedido(p)}`).join(", ")}. Vuelve a imprimirla desde su cuenta o avisa en cocina.
        </p>
      )}

      <Container
        as="main"
        ancho="operacion"
        className="grid flex-1 content-start gap-5 py-4 apaisado:min-h-0 apaisado:grid-cols-[3fr_2fr] apaisado:grid-rows-[minmax(0,1fr)] apaisado:content-stretch"
      >
        <section data-recorrido="mesas-plano" aria-label="Plano de mesas" className="flex min-w-0 flex-col gap-3 apaisado:min-h-0 apaisado:overflow-y-auto">
          {modo === "PLANO" ? (
            <>
              <BotonDePie pie={pie} activo={seleccion === PIE} onElegir={() => elegir(PIE)} />
              <PlanoLocal plano={plano} mesas={mesas} elegida={seleccion === PIE ? null : seleccion} onElegir={(id) => elegir(id)} className="apaisado:min-h-0" />
            </>
          ) : (
            <Atender filas={loQuePideAtencion(mesas, pie, ahora, { pedidos: pedidos.map((p) => paraAtender(p, cuentas)), umbrales: { sinPedirMin: atencionSinPedirMin, esperaMin: atencionEsperaMin } })} elegida={seleccion} onElegir={(f) => elegir(f.lugar, f.cuentaId)} onDePie={() => elegir(PIE)} pie={pie} />
          )}
        </section>

        <aside
          ref={detalle}
          data-recorrido="mesas-detalle"
          aria-label="Detalle"
          className="flex min-w-0 scroll-mt-20 flex-col rounded-[var(--radius-card)] border border-line bg-surface apaisado:min-h-0"
        >
          {!lugar ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <HandPlatter size={34} aria-hidden="true" className="text-ink-3" />
              <p className="font-display text-lg font-semibold text-ink">Elige una mesa</p>
              <p className="max-w-[18rem] text-[13px] text-ink-2">
                Una libre para sentar a una familia; una ocupada para tomar su pedido. Quien pide sin mesa, en «De pie».
              </p>
            </div>
          ) : (
            <>
              <CabeceraDetalle lugar={lugar} ahora={ahora} />
              {cuentasDelLugar.length > 0 && (
                <CuentasDelLugar
                  lugar={lugar}
                  elegida={formulario ? null : (cuenta?.id ?? null)}
                  onElegir={(id) => {
                    setSentando(false);
                    setCuentaSel(id);
                  }}
                  nueva={sentando}
                  onNueva={() => {
                    reiniciarFormulario(seleccion);
                    setSentando(true);
                  }}
                />
              )}

              {formulario ? (
                <FormularioSentar
                  lugar={lugar}
                  cliente={cliente}
                  // Después del primer intento, lo que falta se recalcula al escribir: un error corregido se va solo.
                  onCliente={(c) => {
                    setCliente(c);
                    if (erroresCliente) setErroresCliente(problemasDelCliente(c));
                  }}
                  errores={erroresCliente}
                  comensales={comensales}
                  onComensales={setComensales}
                  onEnviar={() => void sentar(lugar)}
                />
              ) : (
                cuenta && (
                  <div className="flex flex-1 flex-col gap-4 px-4 py-3 apaisado:min-h-0 apaisado:overflow-y-auto">
                    <ResumenDeCuenta cuenta={cuenta} ahora={ahora} />
                    {lugar.tipo === "MESA" && <NinosDeLaCuenta cuenta={cuenta} onVincular={() => setVinculando(true)} />}
                    <PedidosDeLaCuenta
                      pedidos={pedidos.filter((p) => p.cuentaId === cuenta.id)}
                      cuenta={cuenta}
                      ahora={ahora}
                      borrador={(borradores[cuenta.id] ?? []).reduce((n, l) => n + l.cantidad, 0)}
                      onReimprimir={(p, c) => void volverAImprimir(p, c)}
                      onAnular={(p) => setAnulando(p)}
                      esperaMin={atencionEsperaMin}
                      onServir={(p, lineas) =>
                        void servir(p.id, lineas).then((r) => {
                          if (!r.ok) avisar.error(r.mensaje);
                        })
                      }
                      onDeshacer={(p, linea) =>
                        void deshacer(p.id, linea).then((r) => {
                          if (!r.ok) avisar.error(r.mensaje);
                        })
                      }
                    />
                  </div>
                )
              )}

              <footer className="flex flex-col gap-2 border-t border-line px-4 py-3">
                {formulario ? (
                  <>
                    <Button variant="primary" disabled={abriendo} onClick={() => void sentar(lugar)} className="w-full">
                      {lugar.tipo === "PIE" ? <PersonStanding size={17} aria-hidden="true" /> : <Users size={17} aria-hidden="true" />}
                      {abriendo
                        ? "Abriendo la cuenta…"
                        : lugar.tipo === "PIE"
                          ? "Abrir la cuenta de pie"
                          : cuentasDelLugar.length > 0
                            ? `Sentar a otra familia en la mesa ${lugar.vista.mesa.label}`
                            : `Sentar en la mesa ${lugar.vista.mesa.label}`}
                    </Button>
                    {cuentasDelLugar.length > 0 && (
                      <Button variant="ghost" onClick={() => setSentando(false)} className="w-full">
                        <X size={16} aria-hidden="true" />
                        Cancelar
                      </Button>
                    )}
                    {lugar.tipo === "MESA" && lugar.vista.estado === "POR_LIMPIAR" && (
                      <Button
                        variant="neutral"
                        onClick={() =>
                          void marcarLimpia(lugar.vista.mesa.id).then((r) => (r.ok ? avisar.ok(`Mesa ${lugar.vista.mesa.label} limpia y libre`) : avisar.error(r.mensaje)))
                        }
                        className="w-full"
                      >
                        <Sparkles size={16} aria-hidden="true" />
                        Mesa limpia: dejarla libre
                      </Button>
                    )}
                  </>
                ) : (
                  cuenta && (
                    <>
                      <Button variant="primary" onClick={() => setVista("pedido")} className="w-full">
                        <NotebookPen size={17} aria-hidden="true" />
                        {enEspera ? "Seguir con el pedido" : "Tomar pedido"}
                      </Button>
                      {chargeableLines(cuenta).length === 0 ? (
                        // Nada que cobrar (B6-5): no se manda a la caja, se libera.
                        <Button variant="neutral" onClick={() => setLiberando(cuenta)} className="w-full">
                          <DoorOpen size={16} aria-hidden="true" />
                          {lugar.tipo === "PIE" || cuentasDelLugar.length > 1 ? "Liberar esta cuenta" : "Liberar mesa"}
                        </Button>
                      ) : cuenta.status === "ABIERTA" ? (
                        <Button variant="neutral" onClick={() => pedirLaCuentaConServido(cuenta)} className="w-full">
                          <Receipt size={16} aria-hidden="true" />
                          Pide la cuenta
                        </Button>
                      ) : (
                        <p className="text-center text-[12.5px] text-ink-3">Pagan en caja. El mesero no cobra (DEC-14).</p>
                      )}
                      {/* B6-13: cerrar la mesa sin cobrar, de supervisión y administración: se fue sin pagar (deuda, B3-11) o
                          no consumió / fue un error (se anula todo). */}
                      {cierraSinCobrar && chargeableLines(cuenta).length > 0 && !cuenta.lines.some((l) => l.paid) && (
                        <Button variant="ghost" onClick={() => setCerrandoSinCobrar(cuenta)} className="w-full" aria-haspopup="dialog">
                          <UserX size={16} aria-hidden="true" />
                          Cerrar la mesa sin cobrar…
                        </Button>
                      )}
                    </>
                  )
                )}
              </footer>
              <MarcarDeudaDialog
                cuenta={seFue}
                onCerrar={() => setSeFue(null)}
                onHecha={(r) => {
                  setSeFue(null);
                  // Incobrable: la mesa queda libre (o con sus otras cuentas).
                  adoptar(r.cuenta);
                }}
              />

              {cuenta && lugar.tipo === "MESA" && (
                <VincularPulseras
                  abierto={vinculando}
                  onCerrar={() => setVinculando(false)}
                  cuenta={cuenta}
                  estado={estado}
                  cuentas={cuentas}
                  onVincular={(ids) => vincular(cuenta, ids)}
                />
              )}
              <Confirmacion
                abierto={liberando !== null}
                onCerrar={() => setLiberando(null)}
                titulo={`Liberar · ${liberando ? nombreDeCuenta(liberando) : ""}`}
                confirmar="Sí, liberar"
                ocupado={liberandoEnvio}
                onConfirmar={() => void (liberando && liberar(liberando))}
              >
                <p>
                  {liberando && liberando.lines.length > 0
                    ? "Lo que se pidió está anulado o regalado: no hay nada que cobrar. La cuenta se cierra sin consumo."
                    : "No pidieron nada. La cuenta se cierra sin consumo."}
                </p>
                {(borradores[liberando?.id ?? ""] ?? []).length > 0 && (
                  <p className="mt-2 text-state-warn">El pedido sin enviar de esta cuenta se descarta.</p>
                )}
              </Confirmacion>
              {/* B6-13: cerrar la mesa sin cobrar: elegir el camino. */}
              <Dialog
                abierto={cerrandoSinCobrar !== null}
                onCerrar={() => setCerrandoSinCobrar(null)}
                titulo={`Cerrar sin cobrar · ${cerrandoSinCobrar ? nombreDeCuenta(cerrandoSinCobrar) : ""}`}
                descripcion="Nada se borra: queda como deuda a su nombre, o se anula con su motivo. Lo autoriza tu PIN."
                pie={
                  <Button surface="pos" variant="neutral" className="w-full" onClick={() => setCerrandoSinCobrar(null)}>
                    Volver
                  </Button>
                }
              >
                <div className="flex flex-col gap-2">
                  {[
                    {
                      titulo: "Se fue sin pagar",
                      detalle: "Lo que debe queda como deuda a nombre de su cliente, y se cobra cuando vuelva.",
                      icono: <UserX size={18} aria-hidden="true" />,
                      ir: () => {
                        setSeFue(cerrandoSinCobrar);
                        setCerrandoSinCobrar(null);
                      },
                    },
                    {
                      titulo: "No consumió o fue un error",
                      detalle: "Se anula todo lo que pidió (vuelve al estante o va a merma) y a cada área le sale su papel «ANULAR».",
                      icono: <Ban size={18} aria-hidden="true" />,
                      ir: () => {
                        setAnulandoMesa(cerrandoSinCobrar);
                        setCerrandoSinCobrar(null);
                      },
                    },
                  ].map((o) => (
                    <button
                      key={o.titulo}
                      type="button"
                      onClick={o.ir}
                      className="flex min-h-14 cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong"
                    >
                      <span className="mt-0.5 text-ink-2">{o.icono}</span>
                      <span>
                        <span className="block text-cuerpo font-semibold text-ink">{o.titulo}</span>
                        <span className="block text-detalle text-ink-3">{o.detalle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </Dialog>
              <AnularPedidoDialog
                pedido={
                  anulandoMesa
                    ? {
                        id: anulandoMesa.id,
                        numero: anulandoMesa.orderNumber ?? 0,
                        lineas: [...chargeableLines(anulandoMesa).reduce((m, l) => m.set(l.concept, (m.get(l.concept) ?? 0) + 1), new Map<string, number>())].map(([nombre, cantidad]) => ({ nombre, cantidad })),
                      }
                    : null
                }
                titulo={anulandoMesa ? `Anular todo · ${nombreDeCuenta(anulandoMesa)}` : undefined}
                descripcion="Se anula todo lo que debe esta cuenta, de todos sus pedidos, con su motivo, y la mesa queda libre. A cada área le sale su papel «ANULAR»."
                onCerrar={() => setAnulandoMesa(null)}
                onAplicar={async (motivo, detalle, preparado, autorizacion) => {
                  const c = anulandoMesa!;
                  const r = await cerrarSinCobrar(
                    { idempotencyKey: crypto.randomUUID(), accountId: c.id, version: c.version!, motivo, preparado, ...(detalle ? { detalle } : {}) },
                    autorizacion,
                  );
                  if (!r.ok) return r;
                  setAnulandoMesa(null);
                  avisar.ok(`${nombreDeCuenta(c)}: cerrada sin cobrar`, { detalle: `Se anuló lo que debía. ${preparado ? "Sale como merma." : "Vuelve al inventario."}` });
                  return null;
                }}
              />
              {/* B6-13: «¿Ya se sirvió todo?» al pedir la cuenta. */}
              <Dialog
                abierto={sinServir !== null}
                onCerrar={() => setSinServir(null)}
                titulo="¿Ya se sirvió todo?"
                descripcion={
                  sinServir
                    ? `Falta marcar servido: ${textoDePlatos(sinServir.platos)}.`
                    : ""
                }
                pie={
                  <div className="flex flex-col gap-2">
                    <Button surface="pos" variant="primary" disabled={sirviendoTodo} onClick={() => void servirTodoYPedir()}>
                      <HandPlatter size={17} aria-hidden="true" />
                      {sirviendoTodo ? "Marcando…" : "Sí, todo servido"}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button surface="pos" variant="neutral" disabled={sirviendoTodo} onClick={() => setSinServir(null)}>
                        Volver
                      </Button>
                      <Button
                        surface="pos"
                        variant="ghost"
                        disabled={sirviendoTodo}
                        onClick={() => {
                          const c = sinServir!.cuenta;
                          setSinServir(null);
                          pedirLaCuenta(c);
                        }}
                      >
                        Pedir la cuenta igual
                      </Button>
                    </div>
                  </div>
                }
              >
                <p className="text-detalle text-ink-2">Se marcan servidos sin hora exacta: la atención en el salón no los cuenta como espera.</p>
              </Dialog>
              <AnularPedidoDialog
                pedido={anulando}
                onCerrar={() => setAnulando(null)}
                onAplicar={async (motivo, detalleMotivo, preparado, autorizacion) => {
                  const rechazoAnular = await aplicarAnulacion(anulando!, motivo, detalleMotivo, preparado, autorizacion);
                  if (!rechazoAnular) setAnulando(null);
                  return rechazoAnular;
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

/** «De pie»: el lugar de quien pide sin mesa (B6-7), encima del plano. Dice cuántas cuentas hay y si alguna pide. */
function BotonDePie({ pie, activo, onElegir }: { pie: PieVista; activo: boolean; onElegir: () => void }) {
  const piden = pie.cuentas.filter((c) => c.status === "POR_COBRAR").length;
  return (
    <button
      type="button"
      data-recorrido="mesas-de-pie"
      aria-pressed={activo}
      onClick={onElegir}
      className={cn(
        "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left",
        "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        piden > 0 ? "border-state-warn/50 bg-state-warn-bg/40" : "border-line bg-surface hover:border-line-strong",
        activo && "ring-2 ring-brand",
      )}
    >
      <PersonStanding size={20} aria-hidden="true" className={piden > 0 ? "text-state-warn" : "text-brand"} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">De pie</span>
        <span className="block text-[12px] text-ink-3">
          {pie.cuentas.length === 0
            ? "Quien pide sin mesa: ábrele una cuenta"
            : `${pie.cuentas.length === 1 ? "1 cuenta abierta" : `${pie.cuentas.length} cuentas abiertas`}${piden > 0 ? ` · ${piden === 1 ? "1 pide" : `${piden} piden`} la cuenta` : ""}`}
        </span>
      </span>
      {piden > 0 ? <Receipt size={18} className="shrink-0 text-state-warn" aria-hidden="true" /> : <Plus size={18} className="shrink-0 text-ink-3" aria-hidden="true" />}
    </button>
  );
}

/**
 * «Atender»: solo lo que pide acción, en el orden en que conviene hacerlo.
 *
 * No es el plano en forma de lista —eso sería repetir lo mismo con más ruido—,
 * sino la cola de trabajo del mesero: comandas que no salieron, quien quiere
 * pagar, mesas por limpiar y mesas largas, con las cuentas de pie entre ellas.
 * En el teléfono es la vista de entrada, porque un plano de ocho metros ahí no
 * se lee.
 */
function Atender({
  filas,
  elegida,
  onElegir,
  onDePie,
  pie,
}: {
  filas: readonly Urgencia[];
  elegida: string | null;
  onElegir: (f: Urgencia) => void;
  onDePie: () => void;
  pie: PieVista;
}) {
  return (
    <div className="flex flex-col gap-2">
      <BotonDePie pie={pie} activo={elegida === PIE} onElegir={onDePie} />
      {filas.length === 0 ? (
        <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/40 px-6 text-center">
          <CircleCheckBig size={26} className="text-state-ok" aria-hidden="true" />
          <p className="font-display text-lg font-bold text-ink">Nada que atender ahora</p>
          <p className="text-[13px] text-ink-2">Aquí saldrán las comandas que no salgan en papel, quien pida la cuenta y las mesas por limpiar.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((f) => (
            <li key={`${f.lugar}-${f.cuentaId ?? ""}-${f.orden}`}>
              <button
                type="button"
                aria-pressed={f.lugar === elegida}
                onClick={() => onElegir(f)}
                className={cn(
                  "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                  "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  f.tono === "crit"
                    ? "border-state-crit/40 bg-state-crit-bg/40"
                    : f.tono === "warn"
                      ? "border-state-warn/40 bg-state-warn-bg/40"
                      : "border-line bg-surface",
                  f.lugar === elegida && "ring-2 ring-brand",
                )}
              >
                <span className={cn("font-display w-12 shrink-0 text-center leading-none font-bold text-ink", f.lugar === PIE ? "text-[13px]" : "text-2xl")}>
                  {f.rotulo}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[14px] leading-tight font-semibold",
                      f.tono === "crit" ? "text-state-crit" : f.tono === "warn" ? "text-state-warn" : "text-ink",
                    )}
                  >
                    {f.que}
                  </span>
                  <span className="block text-[12px] leading-tight text-ink-3">{f.detalle}</span>
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
          ))}
        </ul>
      )}
    </div>
  );
}

function CabeceraDetalle({ lugar, ahora }: { lugar: Lugar; ahora: number }) {
  const hora = useHora();
  const v = lugar.vista;
  const e = ESTADO_MESA[v.estado];
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="font-display text-2xl leading-none font-bold text-ink">{lugar.tipo === "PIE" ? "De pie" : `Mesa ${lugar.vista.mesa.label}`}</h2>
        <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
          {lugar.tipo === "PIE" ? "Quien pide sin mesa" : `${lugar.vista.mesa.zone} · ${lugar.vista.mesa.seats} sillas`}
          {v.cuentas.length > 0 && ahora > 0 && (
            <>
              {" "}· {v.comensales} {v.comensales === 1 ? "persona" : "personas"}
              {lugar.tipo === "MESA" && v.desde ? ` · desde las ${hora(Date.parse(v.cuentas[0]!.openedAt))}` : ""}
            </>
          )}
        </p>
      </div>
      {lugar.tipo === "MESA" && (
        <Badge tone={e.tono} icon={e.icono}>
          {e.texto}
        </Badge>
      )}
    </header>
  );
}

/**
 * Las cuentas del lugar, para elegir a cuál se atiende (B6-7): en una mesa compartida, una por familia.
 * Cada una dice su nombre, cuántas personas y si pide la cuenta (color + icono + texto). La última opción
 * sienta a otra familia, o abre otra cuenta de pie.
 */
function CuentasDelLugar({
  lugar,
  elegida,
  onElegir,
  nueva,
  onNueva,
}: {
  lugar: Lugar;
  elegida: string | null;
  onElegir: (id: string) => void;
  nueva: boolean;
  onNueva: () => void;
}) {
  const nombreCorto = (c: FamilyAccountDto) => (c.dePie || c.family !== `Mesa ${c.tableLabel ?? ""}` ? c.family : "Primera cuenta");
  return (
    <div role="radiogroup" aria-label="Cuentas" className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
      {lugar.vista.cuentas.map((c) => {
        const activa = c.id === elegida;
        const pide = c.status === "POR_COBRAR";
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onElegir(c.id)}
            className={cn(
              "flex min-h-12 max-w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-left",
              "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              activa ? "border-brand bg-brand/15" : pide ? "border-state-warn/50 bg-state-warn-bg/40" : "border-line bg-base/40 hover:border-line-strong",
            )}
          >
            {pide ? <Receipt size={15} aria-hidden="true" className="shrink-0 text-state-warn" /> : <Users size={15} aria-hidden="true" className="shrink-0 text-ink-3" />}
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold text-ink">{nombreCorto(c)}</span>
              <span className="tnum block text-[11.5px] text-ink-3">
                {numeroDeOrden(c)}
                {c.comensales ? ` · ${c.comensales} ${c.comensales === 1 ? "persona" : "personas"}` : ""}
                {pide ? " · pide la cuenta" : ""}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={nueva}
        onClick={onNueva}
        className={cn(
          "flex min-h-12 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-dashed px-3 text-[13px] font-semibold",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          nueva ? "border-brand bg-brand/15 text-ink" : "border-line-strong text-ink-2 hover:text-ink",
        )}
      >
        <Plus size={15} aria-hidden="true" />
        {lugar.tipo === "PIE" ? "Otra cuenta de pie" : "Otra familia"}
      </button>
    </div>
  );
}

/**
 * Sentar a una familia, o abrir una cuenta de pie (B6-7). El nombre es obligatorio de pie y cuando la mesa ya
 * tiene otra cuenta (para no confundirlas); la primera de una mesa puede ir sin él y se llama como la mesa.
 */
function FormularioSentar({
  lugar,
  cliente,
  onCliente,
  errores,
  comensales,
  onComensales,
  onEnviar,
}: {
  lugar: Lugar;
  cliente: DatosDelClienteDto;
  onCliente: (c: DatosDelClienteDto) => void;
  errores: ReturnType<typeof problemasDelCliente>;
  comensales: number;
  onComensales: (n: number) => void;
  onEnviar: () => void;
}) {
  const sillas = lugar.tipo === "MESA" ? lugar.vista.mesa.seats - lugar.vista.comensales : null;
  return (
    <form
      className="flex flex-1 flex-col gap-4 px-4 py-4 apaisado:min-h-0 apaisado:overflow-y-auto"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
    >
      {lugar.tipo === "MESA" && lugar.vista.cuentas.length > 0 && (
        <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2 text-[12.5px] text-ink-2">
          <Users size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
          Mesa compartida: cada familia tiene su cuenta, su pedido y su cobro.
        </p>
      )}
      {/* Quien consume primero y paga al final deja sus datos (B6-9, M-33): la cuenta se llama como él. */}
      <DatosDelCliente valor={cliente} onCambio={onCliente} errores={errores} surface="tablet" />
      <div>
        <p className="mb-2 text-[13px] text-ink-2">¿Cuántas personas?</p>
        <Stepper value={comensales} onChange={onComensales} label="Personas" min={1} max={30} />
        {sillas !== null && comensales > sillas && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-state-warn">
            <TriangleAlert size={13} aria-hidden="true" />
            {sillas > 0 ? `Quedan ${sillas} ${sillas === 1 ? "silla" : "sillas"} libres: harán falta más` : "La mesa no tiene sillas libres: harán falta más"}
          </p>
        )}
      </div>
    </form>
  );
}

/** El número de orden de la cuenta, desde cuándo y lo que debe: lo que el mesero dice si le preguntan. */
function ResumenDeCuenta({ cuenta, ahora }: { cuenta: FamilyAccountDto; ahora: number }) {
  const hora = useHora();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="tnum text-[12.5px] text-ink-3">
        {nombreDeCuenta(cuenta)} · {numeroDeOrden(cuenta)}
        {ahora > 0 ? ` · ${hora(Date.parse(cuenta.openedAt))} · hace ${minutosDesde(cuenta.openedAt, ahora)} min` : ""}
      </p>
      <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        Debe
        <MoneyDisplay value={toMajor(pendiente(cuenta))} currency="USD" size="sm" />
      </span>
    </div>
  );
}

function NinosDeLaCuenta({ cuenta, onVincular }: { cuenta: FamilyAccountDto; onVincular: () => void }) {
  const op = useOperacion();
  const { cuentas, adoptar } = useCuentas();
  /** El niño que se está desvinculando (B6-15). */
  const [desvinculando, setDesvinculando] = useState<string | null>(null);
  const ids = cuenta.sessionIds;
  const nombre = (id: string) => {
    const s = op.estado.sesiones.find((x) => x.id === id);
    return s ? nombreDeEstancia(s) : `${op.estado.nombres[id] ?? "Niño"} (ya salió)`;
  };
  return (
    <section aria-label="Niños vinculados">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Niños vinculados</h3>
        <Button variant="ghost" onClick={onVincular} className="-mr-2 text-[13px]">
          <Link2 size={15} aria-hidden="true" />
          Vincular
        </Button>
      </div>
      {ids.length === 0 ? (
        <p className="text-[13px] text-ink-3">Ninguno. Si la familia tiene niños jugando, vincúlalos: pagan todo junto.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ninosDeLaMesa(cuenta).map((n) => (
            <li key={n.sessionId} className="flex items-center justify-between gap-2">
              {/* Lo suyo en esta cuenta, o ya pagado aparte (B4-14): un prepago vinculado no se cobra otra vez. */}
              <Badge tone={n.enLaCuenta ? "idle" : "ok"} icon={<Baby size={12} aria-hidden="true" />}>
                {nombre(n.sessionId)} · {n.enLaCuenta ? "en la cuenta" : "pagado"}
              </Badge>
              {/* B6-15: vuelve a su familia o pasa a otra mesa, con lo que se debe de él. */}
              <Button variant="ghost" onClick={() => setDesvinculando(n.sessionId)} className="-mr-2 text-[13px]" aria-label={`Desvincular a ${nombre(n.sessionId)}`}>
                <Unlink size={15} aria-hidden="true" />
                Desvincular
              </Button>
            </li>
          ))}
        </ul>
      )}
      {desvinculando && (
        <DesvincularNino
          abierto
          onCerrar={() => setDesvinculando(null)}
          sesionId={desvinculando}
          nombre={nombre(desvinculando)}
          desde={cuenta}
          cuentas={cuentas}
          adoptar={adoptar}
        />
      )}
    </section>
  );
}

function PedidosDeLaCuenta({
  pedidos,
  cuenta,
  ahora,
  borrador,
  onReimprimir,
  onAnular,
  onServir,
  onDeshacer,
  esperaMin,
}: {
  pedidos: readonly PedidoDto[];
  cuenta: FamilyAccountDto;
  ahora: number;
  borrador: number;
  /** Un papel del pedido (B6-10): el de cocina o el de barra. */
  onReimprimir: (p: PedidoDto, c: ComandaDelPedidoDto) => void;
  onAnular: (p: PedidoDto) => void;
  /** Marca servidos platos del pedido (B6-11) o, sin decirlos, todo lo que falte (B6-8, D-SERV). */
  onServir: (p: PedidoDto, lineas?: readonly number[]) => void;
  /** Deshace, en el momento, un plato marcado servido (B6-11). */
  onDeshacer: (p: PedidoDto, linea: number) => void;
  /** A partir de cuántos minutos esperando se avisa. */
  esperaMin: number;
}) {
  const hora = useHora();
  return (
    <section aria-label="Pedidos de la cuenta">
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Pedidos</h3>
      {borrador > 0 && (
        <p className="mb-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2 text-[13px] text-ink-2">
          <NotebookPen size={14} aria-hidden="true" />
          Borrador sin enviar · {borrador === 1 ? "1 plato" : `${borrador} platos`}
        </p>
      )}
      {pedidos.length === 0 ? (
        <p className="text-[13px] text-ink-3">Todavía no ha pedido nada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pedidos.map((p) => {
            const e = ESTADO_COMANDA[p.comanda.estado];
            const propias = cuenta.lines.filter((l) => l.orderId === p.id);
            const anulable = propias.some((l) => !l.paid && !l.movedTo && !l.cortesia && !l.anulacion);
            const anulado = propias.length > 0 && propias.every((l) => l.anulacion !== undefined);
            // Una comanda anulada no se reimprime: la cocina no tiene que preparar nada de ella.
            const fallo = p.comanda.estado === "NO_SALIO" && !anulado;
            // El papel «ANULAR» que no salió (B6-6): esa área no se enteró y hay que decírselo.
            const anulacionSinPapel = p.anulacion?.estado === "NO_SALIO";
            const anulacionesFallidas = p.anulaciones.filter((a) => a.estado === "NO_SALIO").map((a) => a.area);
            // Con cocina y barra (B6-10), cada papel con su estado y su reimpresión; con uno, como siempre.
            const unaSola = p.comandas.length === 1 ? p.comandas[0]! : null;
            return (
              <li key={p.id} className={cn("rounded-[var(--radius-control)] border px-3 py-2.5", fallo || anulacionSinPapel ? "border-state-crit/50 bg-state-crit-bg" : "border-line bg-base/40")}>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={anulado ? "idle" : e.tono} icon={anulado ? <Ban size={13} aria-hidden="true" /> : e.icono}>
                    {anulado ? "Pedido anulado" : unaSola?.area ? `${e.texto} · ${AREA[unaSola.area].nombre}` : e.texto}
                  </Badge>
                  <span className="tnum text-[12px] text-ink-3">
                    {comanda(p.numero)} · {ahora > 0 ? `${hora(Date.parse(p.enviadoEn))} · hace ${minutosDesde(p.enviadoEn, ahora)} min` : ""}
                  </span>
                </div>
                {/* B6-11: cada plato con su «Servido»; servido, su hora y, en el momento, «Deshacer». */}
                <ul aria-label={`Platos del pedido ${comanda(p.numero)}`} className="mt-1.5 flex flex-col divide-y divide-line/60">
                  {p.lineas.map((l, i) => {
                    const fuera = anulado || platoAnulado(l.productId, propias);
                    const deshacible = l.servido !== null && ahora > 0 && ahora - Date.parse(l.servido.en) <= DESHACER_SERVIDO_MS;
                    return (
                      <li key={i} className="flex min-h-12 items-center gap-2 py-1">
                        <span className={cn("min-w-0 flex-1 text-[13px]", fuera ? "text-ink-3 line-through" : "text-ink")}>
                          {l.cantidad}× {l.nombre}
                          {l.nota ? <span className="text-ink-3"> («{l.nota}»)</span> : null}
                        </span>
                        {!fuera &&
                          (l.servido ? (
                            <>
                              {/* Con la tinta del bloque: dentro de un aviso rojo, el verde no se lee. */}
                              <span className="tnum flex items-center gap-1 text-[12.5px] font-medium text-ink-2">
                                <CircleCheckBig size={14} aria-hidden="true" />
                                Servido{ahora > 0 ? ` ${hora(Date.parse(l.servido.en))}` : ""}
                              </span>
                              {deshacible && (
                                <Button variant="ghost" onClick={() => onDeshacer(p, i)} aria-label={`Deshacer: ${l.nombre} no está servido`}>
                                  <Undo2 size={15} aria-hidden="true" />
                                  Deshacer
                                </Button>
                              )}
                            </>
                          ) : (
                            <Button variant="neutral" onClick={() => onServir(p, [i])} aria-label={`Servido: ${l.nombre}`}>
                              <HandPlatter size={16} aria-hidden="true" />
                              Servido
                            </Button>
                          ))}
                      </li>
                    );
                  })}
                </ul>
                {/* B6-8 (D-SERV): el pedido servido con su último plato, o cuánto lleva esperando y «Servir todo». */}
                {!anulado &&
                  (p.servido ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-state-ok">
                      <CircleCheckBig size={14} aria-hidden="true" />
                      Servido{ahora > 0 ? ` a las ${hora(Date.parse(p.servido.en))} · esperó ${Math.max(0, Math.floor((Date.parse(p.servido.en) - Date.parse(p.enviadoEn)) / 60_000))} min` : ""}
                    </p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-[12.5px]",
                          minutosDesde(p.enviadoEn, ahora) >= esperaMin ? "font-semibold text-state-warn" : "text-ink-3",
                        )}
                      >
                        <Hourglass size={14} aria-hidden="true" />
                        Esperando · {minutosDesde(p.enviadoEn, ahora)} min
                      </span>
                      {p.lineas.filter((l) => l.servido === null && !platoAnulado(l.productId, propias)).length > 1 && (
                        <Button variant="primary" onClick={() => onServir(p)} className="ml-auto">
                          <HandPlatter size={16} aria-hidden="true" />
                          Servir todo
                        </Button>
                      )}
                    </div>
                  ))}
                {!anulado && p.comandas.length > 1 && (
                  <ul aria-label="Comandas del pedido" className="mt-2 flex flex-col gap-1.5">
                    {p.comandas.map((c) => {
                      const ec = ESTADO_COMANDA[c.estado];
                      const falloC = c.estado === "NO_SALIO";
                      return (
                        <li key={c.area ?? "todo"} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge tone={ec.tono} icon={ec.icono}>
                            {c.area ? AREA[c.area].nombre : "Comanda"}: {ec.corto}
                          </Badge>
                          {falloC && c.error && <span className="text-[12.5px] text-state-crit">{c.error}</span>}
                          {(falloC || c.estado === "DESCARTADA") && (
                            <Button variant={falloC ? "primary" : "neutral"} onClick={() => onReimprimir(p, c)} className="ml-auto">
                              <RotateCcw size={16} aria-hidden="true" />
                              Volver a imprimir
                            </Button>
                          )}
                          {c.estado === "IMPRESA" && (
                            <Button variant="ghost" onClick={() => onReimprimir(p, c)} className="ml-auto text-[13px]">
                              <Printer size={15} aria-hidden="true" />
                              Se perdió: una copia
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {fallo && unaSola && p.comanda.error && <p className="mt-1 text-[12.5px] text-state-crit">{p.comanda.error}</p>}
                {p.anulacion && (
                  <p
                    role={anulacionSinPapel ? "alert" : undefined}
                    className={cn("mt-1 flex items-start gap-1.5 text-[12.5px]", anulacionSinPapel ? "text-state-crit" : "text-ink-3")}
                  >
                    {anulacionSinPapel ? <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : <Printer size={14} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    {anulacionSinPapel
                      ? `El papel «ANULAR» no salió${p.anulacion.error ? ` (${p.anulacion.error})` : ""}: avisa a ${aQuien(anulacionesFallidas)} de palabra.`
                      : p.anulacion.estado === "IMPRESA"
                        ? `Papel «ANULAR» impreso en ${aQuien(p.anulaciones.map((a) => a.area)).replaceAll("la ", "")}`
                        : p.anulacion.estado === "DESCARTADA"
                          ? "Papel «ANULAR» descartado"
                          : "Papel «ANULAR» imprimiéndose…"}
                  </p>
                )}
                {unaSola && (fallo || p.comanda.estado === "DESCARTADA") && (
                  <Button variant={fallo ? "primary" : "neutral"} onClick={() => onReimprimir(p, unaSola)} className="mt-2 w-full">
                    <RotateCcw size={16} aria-hidden="true" />
                    Volver a imprimir
                  </Button>
                )}
                {unaSola && p.comanda.estado === "IMPRESA" && !anulado && (
                  <Button variant="ghost" onClick={() => onReimprimir(p, unaSola)} className="mt-1 -mb-1 w-full text-[13px]">
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
