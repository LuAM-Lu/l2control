"use client";

import { useEffect, useState, type RefObject } from "react";
import { Baby, Cake, Check, Clock, Combine, HandCoins, Users, Keyboard, Plus, Receipt, Search, ShoppingBag, Sparkles, Ticket, UserSearch, UserX, UtensilsCrossed, X } from "lucide-react";
import { money, sum, toMajor } from "@l2/domain-money";
import { joinProblem, type JoinProblem } from "@l2/domain-cash";
import { WristbandCodeSchema, type DeudaDto, type FamilyAccountDto } from "@l2/contracts";
import { Button, Marquesina, MoneyDisplay, ScannerField, cn, formatMoneyVE } from "@l2/ui";
import { esDeMesa, esVentaDirecta, nombreDeCuenta, numeroDeOrden, pendiente } from "../cuentas/cuentas.ts";
import { PistaTecla } from "./AtajosDialog.tsx";

/**
 * La cola de cuentas por cobrar — DEC-21, UX-MEJORAS §9 (C1, C2, C5).
 *
 * Maestro-detalle: a la izquierda lo que espera, a la derecha el cobro de la
 * elegida. Tres cosas la hacen rápida con cola de verdad:
 *
 *  · **La más antigua arriba**, con cuánto lleva esperando. A los 10 minutos
 *    el tiempo se marca en ámbar: una familia que espera es la que se queja.
 *  · **Encontrar sin recorrer**: pasar la pulsera abre la cuenta de ese niño;
 *    «/» busca por familia o número de orden; los filtros separan parque y
 *    mostrador. El buscador solo ocupa sitio cuando hace falta.
 *  · **Se ve lo que llega**: una cuenta nueva destella al entrar a la cola.
 *
 * Y **cobrar juntas** (B3-16): «Juntar» (o Mayús+clic) pasa la cola a marcar; un toque marca o desmarca una cuenta y
 * Mayús+clic, un rango. «Cobrar juntas» las lleva a una sola, con un solo recibo.
 *
 * El estado se dice con icono + texto, nunca solo con color (§8.2).
 */

export type FiltroCola = "TODAS" | "PARQUE" | "MESAS" | "MOSTRADOR";

const FILTROS: readonly { id: FiltroCola; texto: string }[] = [
  { id: "TODAS", texto: "Todas" },
  { id: "PARQUE", texto: "Parque" },
  { id: "MESAS", texto: "Mesas" },
  { id: "MOSTRADOR", texto: "Mostrador" },
];

/** A partir de cuántos minutos la espera se marca. */
export const ESPERA_LARGA_MIN = 10;

/** Con más cuentas que esta, el buscador se queda a la vista. */
export const COLA_LARGA = 5;

/** Por qué una cuenta no se puede marcar para cobrar juntas (B3-16), corto, para la cola. */
const NO_SE_JUNTA: Record<JoinProblem, string> = {
  EVENTO: "Cumpleaños: se cobra sola",
  CERRADA: "Ya no está por cobrar",
  COBRO_EN_CURSO: "Tiene partes cobradas",
  CON_DESCUENTO: "Lleva un descuento",
  SIN_PENDIENTE: "Nada que cobrar",
};

/**
 * Marca o desmarca `id` (B3-16); con `rango`, todas las que se pueden juntar entre la última marcada (`ancla`) y
 * ella, en el orden de la cola. Las marcadas guardan el orden en que se marcaron: la primera es la que queda.
 */
export function marcarParaJuntar(
  marcadas: readonly string[],
  id: string,
  cola: readonly FamilyAccountDto[],
  ancla: string | null,
  rango: boolean,
): string[] {
  const orden = cola.map((c) => c.id);
  const i = ancla ? orden.indexOf(ancla) : -1;
  const j = orden.indexOf(id);
  if (rango && i >= 0 && j >= 0) {
    const [desde, hasta] = i <= j ? [i, j] : [j, i];
    const tramo = cola.slice(desde, hasta + 1).filter((c) => joinProblem(c) === null).map((c) => c.id);
    return [...marcadas, ...tramo.filter((x) => !marcadas.includes(x))];
  }
  return marcadas.includes(id) ? marcadas.filter((x) => x !== id) : [...marcadas, id];
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** La cola en el orden en que se atiende: primero la que más lleva esperando. */
export function ordenarCola(cuentas: readonly FamilyAccountDto[]): FamilyAccountDto[] {
  const desde = (c: FamilyAccountDto) => Date.parse(c.pendingSince ?? c.openedAt);
  return [...cuentas].sort((a, b) => desde(a) - desde(b) || (a.orderNumber ?? 0) - (b.orderNumber ?? 0));
}

/** Filtra por origen y por texto: familia, número de orden («#0012», «12») o «mostrador». */
export function filtrarCola(cuentas: readonly FamilyAccountDto[], texto: string, filtro: FiltroCola): FamilyAccountDto[] {
  const q = sinAcentos(texto.trim()).replace(/^#/, "");
  return cuentas.filter((c) => {
    // La cuenta de una persona (B3-20) va con el mostrador: es del mostrador, aunque no sea una venta directa.
    const directa = esVentaDirecta(c) || c.divididaDe !== undefined;
    const deMesa = esDeMesa(c);
    if (filtro === "PARQUE" && (directa || deMesa)) return false;
    if (filtro === "MESAS" && !deMesa) return false;
    if (filtro === "MOSTRADOR" && !directa) return false;
    if (q === "") return true;
    const numero = String(c.orderNumber ?? "");
    const nombre = sinAcentos(nombreDeCuenta(c));
    // La cédula o el teléfono del cliente de la cuenta (B6-9): desde cinco cifras, en cualquier parte.
    const cifras = q.replace(/\D/g, "");
    const delCliente = c.cliente !== undefined && cifras.length >= 5 && [c.cliente.cedula, c.cliente.telefono].some((d) => d.replace(/\D/g, "").includes(cifras));
    return nombre.includes(q) || delCliente || (/^\d+$/.test(q) && (numero === q.replace(/^0+/, "") || numero.startsWith(q)));
  });
}

/**
 * Las deudas pendientes que coinciden con la búsqueda (B3-11): por el nombre del cliente o, desde cinco cifras, por su
 * cédula o su teléfono. Cuando vuelve, la caja lo ve al buscarlo.
 */
export function deudasQueCoinciden(deudas: readonly DeudaDto[], texto: string): DeudaDto[] {
  const q = sinAcentos(texto.trim());
  if (q === "") return [];
  const cifras = q.replace(/\D/g, "");
  return deudas.filter(
    (d) => sinAcentos(d.cliente.nombre).includes(q) || (cifras.length >= 5 && [d.cliente.cedula, d.cliente.telefono].some((x) => x.replace(/\D/g, "").includes(cifras))),
  );
}

export function ColaCuentas({
  className,
  cuentas,
  total,
  actual,
  onElegir,
  onNuevaVentaDirecta,
  onEntrada,
  onBuscarCliente,
  ventaNueva,
  puntoDeCobro,
  recientes,
  busqueda,
  onBusqueda,
  filtro,
  onFiltro,
  buscando,
  onBuscando,
  buscadorRef,
  onEscanear,
  ultimoCobro,
  onVerRecibo,
  onVerAtajos,
  deudas = [],
  onCobrarDeuda,
  porLimpiar = [],
  onMesaLimpia,
  juntando = false,
  onJuntando,
  marcadas = [],
  onMarcadas,
  todas,
  onCobrarJuntas,
}: {
  className?: string;
  /** Ya ordenadas y filtradas. */
  cuentas: readonly FamilyAccountDto[];
  /** Cuántas esperan en total, sin filtro. */
  total: number;
  actual: string | null;
  onElegir: (id: string) => void;
  onNuevaVentaDirecta: () => void;
  /** La entrada al parque desde la caja (B3-9); `null` para quien no registra entradas. */
  onEntrada: (() => void) | null;
  /** El buscador de clientes (T-19): por nombre, cédula o teléfono, con lo que tienen abierto y lo que deben. */
  onBuscarCliente: () => void;
  ventaNueva: boolean;
  /** El equipo desde el que se cobra (su turno, B3-1); `null` sin turno abierto. */
  puntoDeCobro: string | null;
  /** Cuentas que acaban de llegar: destellan una vez. */
  recientes: ReadonlySet<string>;
  busqueda: string;
  onBusqueda: (texto: string) => void;
  filtro: FiltroCola;
  onFiltro: (f: FiltroCola) => void;
  /** Si el buscador está desplegado aunque la cola sea corta. */
  buscando: boolean;
  onBuscando: (abierto: boolean) => void;
  buscadorRef: RefObject<HTMLInputElement | null>;
  onEscanear: (codigo: string) => void;
  ultimoCobro: { orden: string; total: string } | null;
  onVerRecibo: () => void;
  onVerAtajos: () => void;
  /** Lo que sus clientes dejaron sin pagar (B3-11): sale al buscarlos, con «Cobrar». */
  deudas?: readonly DeudaDto[];
  onCobrarDeuda?: (d: DeudaDto) => void;
  /** Las mesas por limpiar (B6-14): la caja las deja limpias con un toque, por si el mesero se olvidó. */
  porLimpiar?: readonly { tableId: string; label: string }[];
  onMesaLimpia?: (mesa: { tableId: string; label: string }) => void;
  /** Cobrar juntas (B3-16): si la cola está marcando, y las marcadas en el orden en que se marcaron. */
  juntando?: boolean;
  onJuntando?: (si: boolean) => void;
  marcadas?: readonly string[];
  onMarcadas?: (ids: string[]) => void;
  /** Toda la cola, sin filtro: una marcada sigue marcada aunque la búsqueda la oculte. */
  todas?: readonly FamilyAccountDto[];
  onCobrarJuntas?: () => void;
}) {
  const [ancla, setAncla] = useState<string | null>(null);
  const cola = todas ?? cuentas;
  const lasMarcadas = marcadas.flatMap((id) => cola.find((c) => c.id === id) ?? []);
  const puedeJuntar = onJuntando !== undefined && onMarcadas !== undefined && onCobrarJuntas !== undefined;
  function marcar(id: string, rango: boolean) {
    onMarcadas?.(marcarParaJuntar(marcadas, id, cuentas, ancla, rango));
    setAncla(id);
  }
  function dejarDeJuntar() {
    onMarcadas?.([]);
    onJuntando?.(false);
    setAncla(null);
  }
  // Escape suelta la selección, si no hay un diálogo abierto que lo use antes.
  useEffect(() => {
    if (!juntando) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open], [role=dialog]")) dejarDeJuntar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [juntando]);
  // El reloj de la espera. Arranca en 0 para que servidor y navegador pinten
  // lo mismo; la espera aparece tras hidratar y se refresca cada 30 s.
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const conBuscador = buscando || total > COLA_LARGA || busqueda !== "" || filtro !== "TODAS";

  // Pedir el buscador (lupa o «/») es para escribir ya: el foco va a él en
  // cuanto existe.
  useEffect(() => {
    if (buscando) buscadorRef.current?.focus();
  }, [buscando, buscadorRef]);

  function cerrarBuscador() {
    onBusqueda("");
    onFiltro("TODAS");
    onBuscando(false);
  }

  return (
    <section
      data-recorrido="caja-cola"
      aria-label="Cuentas por cobrar"
      className={cn("flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-2 pl-4">
        <h2
          className="font-display text-base font-bold whitespace-nowrap text-ink"
          title={puntoDeCobro ? `Cobrando desde ${puntoDeCobro}` : "Sin turno abierto en este equipo"}
        >
          Por cobrar <span className="tnum ml-1 text-[13px] font-semibold text-ink-3">{total}</span>
        </h2>
        <span className="flex items-center gap-0.5">
          {!conBuscador && (
            <button
              type="button"
              onClick={() => onBuscando(true)}
              aria-label="Buscar en la cola"
              title="Buscar (/)"
              className="grid size-14 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Search size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onBuscarCliente}
            aria-label="Buscar cliente"
            title="Buscar cliente por nombre, cédula o teléfono (C)"
            className="grid size-14 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <UserSearch size={16} aria-hidden="true" />
          </button>
          {/* B3-16: marcar varias cuentas para cobrarlas juntas. */}
          {puedeJuntar && (
            <button
              type="button"
              onClick={() => (juntando ? dejarDeJuntar() : onJuntando!(true))}
              aria-pressed={juntando}
              aria-label="Cobrar juntas varias cuentas"
              title="Cobrar juntas: marca las cuentas (Mayús+clic, un rango)"
              className={cn(
                "grid size-14 cursor-pointer place-content-center rounded-[var(--radius-control)] transition-colors",
                juntando ? "bg-brand/20 text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Combine size={16} aria-hidden="true" />
            </button>
          )}
          {/* Solo donde hay teclado: en la tablet no hay teclas que enseñar. */}
          <button
            type="button"
            onClick={onVerAtajos}
            aria-label="Atajos de teclado"
            title="Atajos de teclado (?)"
            className="hidden size-14 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink pointer-fine:grid"
          >
            <Keyboard size={16} aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-2 border-b border-line/40 p-2">
        {/* Neutros: son acciones secundarias de la cola, no la acción principal de la pantalla, que es cobrar. Lado a
            lado donde la cola es ancha; una sobre otra en la columna estrecha de escritorio. */}
        <div className={cn("grid gap-2", onEntrada && "grid-cols-2 lg:grid-cols-1 lg:bajo:grid-cols-2 xl:bajo:grid-cols-1")}>
          <button
            type="button"
            onClick={onNuevaVentaDirecta}
            aria-pressed={ventaNueva}
            className={cn(
              "flex min-h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              ventaNueva ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:border-line-strong hover:text-ink",
            )}
          >
            <Plus size={15} aria-hidden="true" />
            <span>Venta directa</span>
            <PistaTecla tecla="N" />
          </button>
          {/* B3-9 (M-31): la entrada de niños que llegan directo a la caja, sin salir de ella. */}
          {onEntrada && (
            <button
              type="button"
              data-recorrido="caja-entrada"
              onClick={onEntrada}
              className={cn(
                "flex min-h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:border-line-strong hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              )}
            >
              <Ticket size={15} aria-hidden="true" />
              <span>Entrada</span>
              <PistaTecla tecla="A" />
            </button>
          )}
        </div>

        <ScannerField
          onScan={onEscanear}
          validate={(c) => WristbandCodeSchema.safeParse(c).success}
          placeholder="Pasa una pulsera"
          className="min-h-12 gap-2 px-3 py-2 [&_[data-pista]]:hidden [&>span[role=status]]:truncate [&>span[role=status]]:text-[12.5px]"
        />

        {conBuscador && (
          <div className="flex flex-col gap-1.5">
            <label className="flex h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base px-2.5 focus-within:border-brand">
              <Search size={15} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="sr-only">Buscar por familia o número de orden</span>
              <input
                ref={buscadorRef}
                type="search"
                value={busqueda}
                onChange={(e) => onBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cerrarBuscador();
                    e.currentTarget.blur();
                  } else if (e.key === "Enter" && cuentas.length > 0) {
                    // La primera de lo encontrado (B3-8): buscar y cobrar sin soltar el teclado.
                    e.preventDefault();
                    onElegir(cuentas[0]!.id);
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Nombre, cédula o #orden"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
              />
              {(busqueda !== "" || total <= COLA_LARGA) && (
                <button
                  type="button"
                  onClick={cerrarBuscador}
                  aria-label="Cerrar la búsqueda"
                  className="grid size-14 shrink-0 cursor-pointer place-content-center rounded text-ink-3 hover:text-ink"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </label>
            <div role="radiogroup" aria-label="Origen de la cuenta" className="grid grid-cols-3 gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filtro === f.id}
                  onClick={() => onFiltro(f.id)}
                  className={cn(
                    "min-h-10 cursor-pointer rounded-[var(--radius-control)] text-[12px] font-semibold transition-colors",
                    filtro === f.id ? "bg-surface-2 text-ink ring-1 ring-line-strong" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {f.texto}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* B6-14: las mesas que quedaron por limpiar; un toque la deja limpia y libre. */}
      {onMesaLimpia && porLimpiar.length > 0 && (
        <section aria-label="Mesas por limpiar" className="mx-2 mt-2 flex flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-base/50 px-2 py-1.5">
          <h3 className="flex items-center gap-1 pr-1 text-etiqueta font-semibold text-ink-3 uppercase">
            <Sparkles className="size-(--icono-etiqueta)" aria-hidden="true" />
            Por limpiar
          </h3>
          {porLimpiar.map((m) => (
            <button
              key={m.tableId}
              type="button"
              onClick={() => onMesaLimpia(m)}
              aria-label={`Mesa ${m.label} limpia`}
              title={`Mesa ${m.label}: marcarla limpia y libre`}
              className="tnum grid min-h-14 min-w-14 cursor-pointer place-content-center rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[14px] font-bold text-ink-2 transition-colors hover:border-brand hover:text-ink"
            >
              {m.label}
            </button>
          ))}
        </section>
      )}

      {/* Debe de antes (B3-11): al buscar a un cliente que se fue sin pagar, su deuda sale aquí, con «Cobrar». */}
      {onCobrarDeuda && deudasQueCoinciden(deudas, busqueda).length > 0 && (
        <section aria-label="Deudas que coinciden" className="mx-2 mt-2 flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-state-warn/50 bg-state-warn-bg/40 p-2">
          <h3 className="flex items-center gap-1 text-etiqueta font-semibold text-state-warn uppercase">
            <HandCoins className="size-(--icono-etiqueta)" aria-hidden="true" />
            Debe de antes
          </h3>
          {deudasQueCoinciden(deudas, busqueda).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onCobrarDeuda(d)}
              className="flex min-h-14 w-full cursor-pointer flex-col gap-0.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-left hover:border-brand"
            >
              <span className="flex items-baseline justify-between gap-2">
                <Marquesina className="flex-1 text-[13.5px] font-semibold text-ink">{d.cliente.nombre}</Marquesina>
                <MoneyDisplay value={toMajor(money(BigInt(d.monto.minor), "USD"))} currency="USD" size="sm" />
              </span>
              <span className="tnum text-[11.5px] text-ink-3">
                #{String(d.orden).padStart(4, "0")} · {d.lugar} · Cobrar la deuda
              </span>
            </button>
          ))}
        </section>
      )}

      {cuentas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">
          {total === 0 ? "La cola está vacía." : "Ninguna cuenta coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {cuentas.map((c) => {
            const activa = c.id === actual && !ventaNueva;
            const marcada = marcadas.includes(c.id);
            const noSeJunta = juntando ? joinProblem(c) : null;
            const esDirecta = esVentaDirecta(c);
            const deMesa = esDeMesa(c);
            const Origen = esDirecta ? ShoppingBag : deMesa ? UtensilsCrossed : c.divididaDe ? Users : c.kind === "EVENTO" ? Cake : Baby;
            const minutos =
              ahora > 0 && c.pendingSince ? Math.max(0, Math.floor((ahora - Date.parse(c.pendingSince)) / 60_000)) : null;
            const larga = minutos !== null && minutos >= ESPERA_LARGA_MIN;
            // Una venta del mostrador que se dejó sin cobrar y sin datos (B6-9): no hay a quién cobrarle si se va.
            const sinDatos = esDirecta && !c.cliente && !activa;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={juntando ? marcada : activa}
                  aria-disabled={noSeJunta !== null || undefined}
                  title={noSeJunta ? NO_SE_JUNTA[noSeJunta] : undefined}
                  onClick={(e) => {
                    // B3-16: marcando, un toque marca o desmarca (Mayús+clic, un rango); fuera, Mayús+clic empieza a
                    // marcar desde la cuenta abierta.
                    if (juntando) {
                      if (!noSeJunta) marcar(c.id, e.shiftKey);
                    } else if (e.shiftKey && puedeJuntar && actual && joinProblem(c) === null) {
                      onJuntando!(true);
                      const desde = cuentas.find((x) => x.id === actual);
                      onMarcadas!(marcarParaJuntar(desde && joinProblem(desde) === null ? [actual] : [], c.id, cuentas, actual, true));
                      setAncla(c.id);
                    } else onElegir(c.id);
                  }}
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                    "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    juntando
                      ? marcada
                        ? "border-brand bg-brand/20"
                        : noSeJunta
                          ? "cursor-not-allowed border-transparent opacity-55"
                          : "border-line hover:bg-surface-2"
                      : activa
                        ? "border-brand bg-brand/20"
                        : "border-transparent hover:bg-surface-2",
                    recientes.has(c.id) && "l2-destello",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    {juntando && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-5 shrink-0 place-content-center self-center rounded border",
                          marcada ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-base",
                        )}
                      >
                        {marcada && <Check size={13} />}
                      </span>
                    )}
                    {/* Un nombre largo no se corta: va y vuelve (T-15, P-9). */}
                    <Marquesina className="flex-1 text-[13.5px] font-semibold text-ink">{nombreDeCuenta(c)}</Marquesina>
                    <MoneyDisplay value={toMajor(pendiente(c))} currency="USD" size="sm" />
                  </span>
                  <span className="flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="tnum font-semibold text-ink-2">{numeroDeOrden(c)}</span>
                      <Origen size={12} className="ml-0.5 shrink-0" aria-hidden="true" />
                      <span className={cn("truncate", sinDatos && "sr-only")}>
                        {esDirecta
                          ? "Mostrador"
                          : deMesa
                            ? c.dePie
                              ? "De pie"
                              : "Mesa"
                            : c.divididaDe
                              ? `De #${String(c.divididaDe.orderNumber ?? 0).padStart(4, "0")}`
                              : c.kind === "EVENTO"
                                ? "Cumpleaños"
                                : c.mode === "PREPAGO"
                                  ? "Prepago"
                                  : "Cuenta abierta"}
                        {!esDirecta && c.sessionIds.length > 0 &&
                          ` · ${c.sessionIds.length} ${c.sessionIds.length === 1 ? "niño" : "niños"}`}
                      </span>
                      {noSeJunta && <span className="shrink-0 font-semibold text-ink-2">· {NO_SE_JUNTA[noSeJunta]}</span>}
                      {sinDatos && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded bg-state-warn-bg px-1 font-semibold whitespace-nowrap text-state-warn">
                          <UserX size={11} aria-hidden="true" />
                          Sin datos
                        </span>
                      )}
                    </span>
                    {minutos !== null && (
                      <span
                        className={cn(
                          "tnum flex shrink-0 items-center gap-1 whitespace-nowrap",
                          larga && "rounded bg-state-warn-bg px-1 font-semibold text-state-warn",
                        )}
                        title={larga ? "Lleva mucho esperando" : "Tiempo en la cola"}
                      >
                        {larga && <Clock size={11} aria-hidden="true" />}
                        {minutos === 0 ? "ahora" : `${minutos} min`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* B3-16: lo marcado y «Cobrar juntas». */}
      {juntando && (
        <div className="flex flex-col gap-1.5 border-t border-line p-2">
          <p className="px-1 text-[12.5px] text-ink-2" role="status">
            {lasMarcadas.length === 0 ? (
              "Toca las cuentas que se cobran juntas (Mayús+clic, un rango)."
            ) : (
              <>
                <span className="tnum font-semibold text-ink">{lasMarcadas.length}</span> marcadas ·{" "}
                <span className="tnum font-semibold text-ink">{formatMoneyVE(toMajor(sum(lasMarcadas.map(pendiente), "USD")), "USD")}</span>
                {lasMarcadas.length === 1 && " · marca otra"}
              </>
            )}
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button surface="pos" variant="neutral" className="w-14 px-0" onClick={dejarDeJuntar} aria-label="Cancelar: soltar las marcadas" title="Cancelar (Esc)">
              <X size={18} aria-hidden="true" />
            </Button>
            <Button surface="pos" variant="primary" className="px-3 whitespace-nowrap" disabled={lasMarcadas.length < 2} onClick={onCobrarJuntas}>
              <Combine size={16} aria-hidden="true" />
              Cobrar juntas
            </Button>
          </div>
        </div>
      )}

      {ultimoCobro && !juntando && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line py-1.5 pr-1.5 pl-4 text-[12px]">
          <span className="min-w-0 truncate text-ink-3" title={`Último cobro ${ultimoCobro.orden} · ${ultimoCobro.total}`}>
            Último <span className="tnum font-semibold text-ink-2">{ultimoCobro.orden}</span>
          </span>
          <button
            type="button"
            onClick={onVerRecibo}
            className="inline-flex min-h-14 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Receipt size={14} aria-hidden="true" />
            Recibo
            <PistaTecla tecla="R" />
          </button>
        </div>
      )}
    </section>
  );
}
