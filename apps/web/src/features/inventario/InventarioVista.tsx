"use client";

import { useEffect, useMemo, useState } from "react";
import { ChefHat, ClipboardList, LayoutGrid, LayoutList, Package, PackageX, ScanLine, Search, Ticket, TriangleAlert, Boxes, Wallet } from "lucide-react";
import type { CatalogoDto, ProductoDto, TipoProducto } from "@l2/contracts";
import { categoriesOf, marginBasisPoints, nameKey, periodAt, type PricePeriod, type StockStatus } from "@l2/domain-inventory";
import { convert, money, sum, toMajor, type FrozenRate } from "@l2/domain-money";
import { MoneyDisplay, cn, formatMoneyVE } from "@l2/ui";
import { EstadoStock, estadoDe } from "./EstadoStock.tsx";

/**
 * La vista del inventario (B9-6, M-16): el stock es lo protagonista. Arriba, lo que hay que mirar
 * (sin inventario inicial, agotados, bajo mínimo, unidades y valor al costo), que también filtra; debajo,
 * la tabla o las tarjetas, por tipo (Productos, Preparados, Servicios), con lo que exige atención primero.
 *
 * Solo pinta y filtra: los datos son del servidor (el catálogo con su existencia, costo y mínimo), y
 * el estado lo decide el dominio (`stockStatus`), el mismo que usa Inicio para avisar.
 */

type Vista = "tabla" | "tarjetas";
type FiltroEstado = "TODOS" | StockStatus;

const TIPOS: readonly { id: TipoProducto; nombre: string; Icono: typeof Package }[] = [
  { id: "PRODUCTO", nombre: "Productos", Icono: Package },
  { id: "PREPARADO", nombre: "Preparados", Icono: ChefHat },
  { id: "SERVICIO", nombre: "Servicios", Icono: Ticket },
];
const URGENCIA: Readonly<Record<StockStatus, number>> = { AGOTADO: 0, SIN_INICIAL: 1, BAJO_MINIMO: 2, BIEN: 3 };
const PORCENTAJE = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CAMPO =
  "min-h-9 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13.5px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const CLAVE_VISTA = "l2.inventario.vista";

const usd = (minor: bigint) => formatMoneyVE(toMajor(money(minor, "USD")), "USD");

/** Lo que la vista calcula de cada producto para pintarlo. */
type Fila = Readonly<{
  p: ProductoDto;
  estado: StockStatus | null;
  precio: bigint | null;
  costo: bigint | null;
  margen: number | null;
}>;

export function InventarioVista({
  catalogo,
  periodos,
  ahora,
  tasa,
  onAbrir,
  seleccion,
}: {
  catalogo: CatalogoDto;
  periodos: readonly PricePeriod[];
  ahora: number | null;
  /** La tasa del día, de dólares a bolívares, para enseñar el precio también en Bs. */
  tasa: FrozenRate | null;
  onAbrir: (id: string) => void;
  /** B9-9: los elegidos para editarlos en lote (solo en la tabla); sin ella, no se elige. */
  seleccion?: Seleccion | undefined;
}) {
  const [tipo, setTipo] = useState<TipoProducto>("PRODUCTO");
  const [estado, setEstado] = useState<FiltroEstado>("TODOS");
  const [categoria, setCategoria] = useState("");
  const [apartados, setApartados] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<Vista>("tabla");
  // La vista elegida se recuerda en este navegador (una comodidad, no un dato del negocio).
  useEffect(() => {
    try {
      // lint-permitido: sin-simulacion — tabla o tarjetas es una preferencia de la pantalla, no un dato del negocio
      const v = window.localStorage.getItem(CLAVE_VISTA);
      if (v === "tabla" || v === "tarjetas") setVista(v);
    } catch {
      /* sin almacenamiento: se queda la tabla */
    }
  }, []);
  const elegirVista = (v: Vista) => {
    setVista(v);
    try {
      // lint-permitido: sin-simulacion — tabla o tarjetas es una preferencia de la pantalla, no un dato del negocio
      window.localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      /* sin almacenamiento: dura lo que dure la pantalla */
    }
  };

  const filas = useMemo<Fila[]>(
    () =>
      catalogo.productos.map((p) => {
        const tramo = ahora === null ? undefined : periodAt(periodos, p.id, ahora);
        const precio = tramo ? tramo.amountMinor : null;
        const costo = p.costoPromedio ? BigInt(p.costoPromedio.minor) : null;
        return {
          p,
          estado: estadoDe(p),
          precio,
          costo,
          margen: precio === null ? null : marginBasisPoints(precio, costo),
        };
      }),
    [catalogo, periodos, ahora],
  );

  // El resumen es de lo que está a la venta y se cuenta: lo apartado no se ofrece.
  const contables = filas.filter((f) => f.p.tipo === "PRODUCTO" && f.p.activo);
  const sinInicial = contables.filter((f) => f.estado === "SIN_INICIAL").length;
  const agotados = contables.filter((f) => f.estado === "AGOTADO").length;
  const bajoMinimo = contables.filter((f) => f.estado === "BAJO_MINIMO").length;
  const unidades = contables.reduce((n, f) => n + (f.p.existencia ?? 0), 0);
  const valor = sum(contables.map((f) => money(BigInt(f.p.valor?.minor ?? "0"), "USD")), "USD");

  const porTipo = (t: TipoProducto) => filas.filter((f) => f.p.tipo === t && f.p.activo !== apartados).length;
  const categorias = useMemo(() => categoriesOf(filas.filter((f) => f.p.tipo === tipo).map((f) => ({ category: f.p.categoria }))), [filas, tipo]);
  const q = nameKey(busqueda);
  const visibles = filas
    .filter((f) => f.p.tipo === tipo && f.p.activo !== apartados)
    .filter((f) => categoria === "" || nameKey(f.p.categoria) === nameKey(categoria))
    .filter((f) => tipo !== "PRODUCTO" || estado === "TODOS" || f.estado === estado)
    .filter((f) => q === "" || nameKey(f.p.nombre).includes(q) || f.p.sku.toLowerCase().includes(busqueda.trim().toLowerCase()) || (f.p.codigoBarras ?? "").includes(busqueda.trim().toUpperCase()))
    // Lo que exige atención, arriba: agotados, luego bajo mínimo; dentro, por nombre.
    .sort((a, b) => (a.estado && b.estado ? URGENCIA[a.estado] - URGENCIA[b.estado] : 0) || a.p.nombre.localeCompare(b.p.nombre, "es"));

  const filtrarEstado = (e: FiltroEstado) => {
    setTipo("PRODUCTO");
    setApartados(false);
    setEstado((actual) => (actual === e ? "TODOS" : e));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── lo que hay que mirar ── */}
      <section aria-label="Resumen del inventario" className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:grid-cols-5">
        {/* B9-7: el catálogo se cargó sin existencias y lo que falta se cuenta otro día. No se vende, pero no se acabó. */}
        <Cifra
          etiqueta="Sin inventario inicial"
          Icono={ClipboardList}
          tono="idle"
          valor={String(sinInicial)}
          pie={sinInicial > 0 ? "No se venden hasta contarlos" : "Todo lo que se cuenta, contado"}
          activo={estado === "SIN_INICIAL" && tipo === "PRODUCTO"}
          onClick={() => filtrarEstado("SIN_INICIAL")}
        />
        <Cifra
          etiqueta="Agotados"
          Icono={PackageX}
          tono={agotados > 0 ? "crit" : "idle"}
          valor={String(agotados)}
          pie={agotados > 0 ? "No se venden: cargar su entrada" : "Nada agotado"}
          activo={estado === "AGOTADO" && tipo === "PRODUCTO"}
          onClick={() => filtrarEstado("AGOTADO")}
        />
        <Cifra
          etiqueta="Bajo mínimo"
          Icono={TriangleAlert}
          tono={bajoMinimo > 0 ? "warn" : "idle"}
          valor={String(bajoMinimo)}
          pie={bajoMinimo > 0 ? "Hay que reponer" : "Ninguno en su punto de reorden"}
          activo={estado === "BAJO_MINIMO" && tipo === "PRODUCTO"}
          onClick={() => filtrarEstado("BAJO_MINIMO")}
        />
        <Cifra etiqueta="Unidades en stock" Icono={Boxes} tono="idle" valor={unidades.toLocaleString("es-VE")} pie={`De ${contables.length} ${contables.length === 1 ? "producto" : "productos"} a la venta`} />
        <Cifra
          etiqueta="Valor del inventario"
          Icono={Wallet}
          tono="idle"
          valor={<MoneyDisplay value={toMajor(valor)} currency="USD" size="lg" />}
          pie="Al costo promedio"
          className="max-lg:col-span-2"
        />
      </section>

      {/* ── qué ver: el tipo y cómo verlo; debajo, buscar y filtrar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tipo" className="flex gap-1 rounded-[var(--radius-control)] bg-surface-2 p-1">
          {TIPOS.map(({ id, nombre, Icono }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tipo === id}
              onClick={() => {
                setTipo(id);
                setCategoria("");
              }}
              className={cn(
                "tnum flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] transition-colors",
                tipo === id ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
              )}
            >
              <Icono size={14} aria-hidden="true" />
              {nombre} · {porTipo(id)}
            </button>
          ))}
        </div>
        <VistaToggle vista={vista} onElegir={elegirVista} />
      </div>
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-48 flex-1 sm:max-w-72">
          <span className="sr-only">Buscar por nombre, SKU o código</span>
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input type="search" placeholder="Nombre, SKU o código" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={cn(CAMPO, "w-full pl-9")} />
        </label>
        <label className="flex items-center">
          <span className="sr-only">Categoría</span>
          <select className={CAMPO} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {tipo === "PRODUCTO" && (
          <label className="flex items-center">
            <span className="sr-only">Estado del stock</span>
            <select className={CAMPO} value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)}>
              <option value="TODOS">Todo el stock</option>
              <option value="SIN_INICIAL">Sin inventario inicial</option>
              <option value="AGOTADO">Agotados</option>
              <option value="BAJO_MINIMO">Bajo mínimo</option>
              <option value="BIEN">Bien</option>
            </select>
          </label>
        )}
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={apartados} onChange={(e) => setApartados(e.target.checked)} />
          Apartados
        </label>
        <p className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3">
          <ScanLine size={13} aria-hidden="true" />
          Pasa un código por el lector para abrir su ficha.
        </p>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
          {busqueda || categoria || estado !== "TODOS"
            ? "Nada con esos filtros."
            : apartados
              ? "No hay nada apartado de este tipo."
              : tipo === "PRODUCTO"
                ? "Todavía no hay productos que se cuenten."
                : tipo === "PREPARADO"
                  ? "Todavía no hay preparados (lo que se hace al momento)."
                  : "Todavía no hay servicios."}
        </p>
      ) : vista === "tabla" ? (
        <Tabla filas={visibles} tipo={tipo} tasa={tasa} onAbrir={onAbrir} seleccion={seleccion} />
      ) : (
        <Tarjetas filas={visibles} tipo={tipo} onAbrir={onAbrir} />
      )}
    </div>
  );
}

function Cifra({
  etiqueta,
  Icono,
  tono,
  valor,
  pie,
  activo = false,
  onClick,
  className,
}: {
  etiqueta: string;
  Icono: typeof Package;
  tono: "crit" | "warn" | "idle";
  valor: React.ReactNode;
  pie: string;
  activo?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const color = tono === "crit" ? "text-state-crit" : tono === "warn" ? "text-state-warn" : "text-ink";
  const contenido = (
    <>
      <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase", tono === "idle" ? "text-ink-3" : color)}>
        <Icono size={13} aria-hidden="true" />
        {etiqueta}
      </span>
      <span className={cn("tnum font-display text-[26px] leading-tight font-bold", color)}>{valor}</span>
      <span className="text-[12px] text-ink-3">{pie}</span>
    </>
  );
  const clase = cn("flex min-w-0 flex-col items-start gap-0.5 bg-surface px-4 py-3 text-left", activo && "ring-2 ring-brand ring-inset", className);
  return onClick ? (
    <button type="button" aria-pressed={activo} onClick={onClick} className={cn(clase, "cursor-pointer transition-colors hover:bg-surface-2")}>
      {contenido}
    </button>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

const TH = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase whitespace-nowrap";
const TD = "px-3 py-2 align-middle";

/** Los productos elegidos para editarlos en lote (B9-9). */
export type Seleccion = Readonly<{ elegidos: ReadonlySet<string>; onCambiar: (ids: ReadonlySet<string>) => void }>;

function Tabla({ filas, tipo, tasa, onAbrir, seleccion }: { filas: readonly Fila[]; tipo: TipoProducto; tasa: FrozenRate | null; onAbrir: (id: string) => void; seleccion?: Seleccion | undefined }) {
  const cuenta = tipo === "PRODUCTO";
  const todos = filas.length > 0 && filas.every((f) => seleccion?.elegidos.has(f.p.id));
  const alternar = (ids: readonly string[], poner: boolean) => {
    if (!seleccion) return;
    const nuevo = new Set(seleccion.elegidos);
    for (const id of ids) (poner ? nuevo.add(id) : nuevo.delete(id));
    seleccion.onCambiar(nuevo);
  };
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
      <table className="w-full border-collapse text-[13.5px]">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {seleccion && (
              <th className={cn(TH, "w-10")}>
                <input
                  type="checkbox"
                  aria-label={todos ? "No elegir ninguno de los que se ven" : "Elegir todos los que se ven"}
                  checked={todos}
                  onChange={(e) => alternar(filas.map((f) => f.p.id), e.target.checked)}
                  className="size-4 cursor-pointer accent-[var(--color-brand)]"
                />
              </th>
            )}
            {cuenta && <th className={cn(TH, "w-36 max-lg:w-24")}>Stock</th>}
            <th className={TH}>Producto</th>
            <th className={TH}>SKU · código</th>
            <th className={TH}>Categoría</th>
            {/* En una tablet en vertical no caben: siguen en la ficha. */}
            {cuenta && <th className={cn(TH, "text-right max-lg:hidden")}>Mínimo</th>}
            {cuenta && <th className={cn(TH, "text-right max-lg:hidden")}>Costo</th>}
            <th className={cn(TH, "text-right")}>Precio</th>
            {cuenta && <th className={cn(TH, "text-right")}>Margen</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map(({ p, estado, precio, costo, margen }) => (
            <tr key={p.id} onClick={() => onAbrir(p.id)} className={cn("cursor-pointer transition-colors hover:bg-surface-2", seleccion?.elegidos.has(p.id) && "bg-brand/10")}>
              {seleccion && (
                <td className={TD} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Elegir ${p.nombre}`}
                    checked={seleccion.elegidos.has(p.id)}
                    onChange={(e) => alternar([p.id], e.target.checked)}
                    className="size-4 cursor-pointer accent-[var(--color-brand)]"
                  />
                </td>
              )}
              {cuenta && (
                <td className={TD}>
                  <span className="flex items-center gap-2.5 max-lg:flex-col max-lg:items-start max-lg:gap-1">
                    {/* Sin contar no hay un cero que enseñar: no se sabe cuántas hay. */}
                    <span className={cn("tnum min-w-10 font-display text-[22px] leading-none font-bold", estado === "AGOTADO" ? "text-state-crit" : estado === "SIN_INICIAL" ? "text-ink-3" : "text-ink")}>
                      {estado === "SIN_INICIAL" ? "—" : p.existencia}
                    </span>
                    {estado && <EstadoStock estado={estado} />}
                  </span>
                </td>
              )}
              <td className={TD}>
                {/* El nombre es el botón: con el teclado se llega a la ficha igual que con el ratón. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAbrir(p.id);
                  }}
                  className="flex cursor-pointer flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="font-semibold text-ink">{p.nombre}</span>
                  {p.presentacion && <span className="text-[12px] text-ink-3">{p.presentacion}</span>}
                </button>
              </td>
              <td className={TD}>
                <span className="flex flex-col">
                  <span className="tnum font-mono text-[12.5px] text-ink-2">{p.sku}</span>
                  {p.codigoBarras && <span className="tnum font-mono text-[11.5px] text-ink-3">{p.codigoBarras}</span>}
                </span>
              </td>
              <td className={cn(TD, "text-ink-2")}>{p.categoria}</td>
              {cuenta && <td className={cn(TD, "tnum text-right text-ink-2 max-lg:hidden")}>{p.minimo ?? "—"}</td>}
              {cuenta && <td className={cn(TD, "tnum text-right whitespace-nowrap text-ink-2 max-lg:hidden")}>{costo === null ? "—" : usd(costo)}</td>}
              <td className={cn(TD, "text-right")}>
                {precio === null ? (
                  <span className="text-[12px] font-semibold text-state-warn">Sin precio hoy</span>
                ) : (
                  <span className="flex flex-col items-end whitespace-nowrap">
                    <span className="tnum font-bold text-ink">{usd(precio)}</span>
                    {tasa && <span className="tnum text-[11px] text-ink-3">{formatMoneyVE(toMajor(convert(money(precio, "USD"), tasa)), "VES")}</span>}
                  </span>
                )}
              </td>
              {cuenta && (
                <td className={cn(TD, "tnum text-right whitespace-nowrap", margen !== null && margen < 0 ? "font-semibold text-state-crit" : "text-ink-2")}>
                  {margen === null ? "—" : `${PORCENTAJE.format(margen / 100)} %`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tarjetas({ filas, tipo, onAbrir }: { filas: readonly Fila[]; tipo: TipoProducto; onAbrir: (id: string) => void }) {
  const Icono = TIPOS.find((t) => t.id === tipo)!.Icono;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {filas.map(({ p, estado, precio, margen }) => {
        // La barra mide el stock contra el doble del mínimo: en el mínimo, a la mitad.
        const nivel = estado && p.minimo ? Math.min(1, (p.existencia ?? 0) / (p.minimo * 2)) : null;
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onAbrir(p.id)}
              className={cn(
                "flex h-full w-full cursor-pointer flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-3.5 text-left shadow-card transition-colors hover:bg-surface-2",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                estado === "AGOTADO" ? "border-state-crit/40" : estado === "BAJO_MINIMO" ? "border-state-warn/40" : estado === "SIN_INICIAL" ? "border-dashed border-line-strong" : "border-line",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                {estado ? (
                  <EstadoStock estado={estado} />
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-3">
                    <Icono size={12} aria-hidden="true" />
                    {TIPOS.find((t) => t.id === tipo)!.nombre.slice(0, -1)}
                  </span>
                )}
                <span className="tnum font-mono text-[11.5px] text-ink-3">{p.sku}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14.5px] font-bold text-ink">{p.nombre}</span>
                <span className="truncate text-[12px] text-ink-3">{p.presentacion ?? p.categoria}</span>
              </span>
              {estado === "SIN_INICIAL" ? (
                <span className="text-detalle text-ink-3">{p.minimo !== null ? `Sin contar · mín. ${p.minimo}` : "Sin contar: no se vende"}</span>
              ) : estado && (
                <span className="flex flex-col gap-1.5">
                  <span className="flex items-baseline gap-1.5">
                    <span className={cn("tnum font-display text-[32px] leading-none font-bold", estado === "AGOTADO" ? "text-state-crit" : "text-ink")}>{p.existencia}</span>
                    <span className="text-[12px] text-ink-3">{p.existencia === 1 ? "unidad" : "unidades"}</span>
                    {p.minimo !== null && <span className="tnum ml-auto text-[11.5px] text-ink-3">mín. {p.minimo}</span>}
                  </span>
                  {nivel !== null && (
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className={cn("block h-full rounded-full", estado === "AGOTADO" ? "bg-state-crit" : estado === "BAJO_MINIMO" ? "bg-state-warn" : "bg-state-ok")}
                        style={{ width: `${Math.max(nivel * 100, estado === "AGOTADO" ? 0 : 4)}%` }}
                      />
                    </span>
                  )}
                </span>
              )}
              <span className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-2">
                <span className="tnum text-[14px] font-bold text-ink">{precio === null ? <span className="text-[12px] text-state-warn">Sin precio hoy</span> : usd(precio)}</span>
                {estado && <span className={cn("tnum text-[12px]", margen !== null && margen < 0 ? "font-semibold text-state-crit" : "text-ink-3")}>{margen === null ? "sin costo" : `margen ${PORCENTAJE.format(margen / 100)} %`}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function VistaToggle({ vista, onElegir }: { vista: Vista; onElegir: (v: Vista) => void }) {
  return (
    <div role="group" aria-label="Cómo ver" className="ml-auto flex gap-1 rounded-[var(--radius-control)] bg-surface-2 p-1">
      {(
        [
          ["tabla", "Tabla", LayoutList],
          ["tarjetas", "Tarjetas", LayoutGrid],
        ] as const
      ).map(([v, texto, Icono]) => (
        <button
          key={v}
          type="button"
          aria-pressed={vista === v}
          aria-label={`Ver en ${texto.toLowerCase()}`}
          title={texto}
          onClick={() => onElegir(v)}
          className={cn(
            "grid size-8 cursor-pointer place-content-center rounded-[var(--radius-control)] transition-colors",
            vista === v ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
          )}
        >
          <Icono size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
