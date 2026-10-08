"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BookOpen, CalendarClock, ChefHat, ClipboardList, EyeOff, Package, PackageX, Plus, Search, Tag, UtensilsCrossed } from "lucide-react";
import type { CatalogoDto, ProductoCommand, ProductoDto, Resultado, TaxCodeDelCatalogo } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { addDays, calendarDay } from "@l2/domain-rates";
import { money, toMajor } from "@l2/domain-money";
import {
  BarraDeFiltros,
  Button,
  CAMPO_DE_FILTRO,
  Cifra,
  Container,
  EmptyState,
  FiltroSegmentado,
  Input,
  Paginacion,
  Resumen,
  Sheet,
  avisar,
  cn,
  formatMoneyVE,
} from "@l2/ui";
import { EncabezadoDePagina } from "../shell/MarcoDeSeccion.tsx";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { aplicarProducto } from "../inventario/productos.acciones";
import { estadoDe } from "../inventario/EstadoStock.tsx";

/**
 * Inventario → Productos → En la carta (B6-1, F6-03; patrón de Ajustes, M-17; junto al precio desde T-18).
 *
 * La carta del restaurante **es el catálogo**: lo que el mesero ofrece es lo que está a la venta y
 * marcado «en la carta». Un solo precio con su calendario, un solo IVA y, si se cuenta, su existencia
 * (ADR-023). Aquí se decide qué entra en la carta, se programa el precio de cada plato y se da de alta
 * un plato nuevo; lo demás de un producto (código, presentación, mínimo) está en Inventario → Productos.
 *
 * Arriba, las cifras que llevan a su filtro; debajo, la lista con filtros y su cuenta, en tabla en el
 * escritorio y en tarjetas en tableta y teléfono, por páginas. Alta y precio, en hoja lateral. Cada
 * cambio pide confirmar identidad; quién puede y si vale lo decide el servidor.
 */

type Filtro = "TODOS" | "EN_CARTA" | "FUERA" | "AGOTADOS";
const POR_PAGINA = [10, 20, 50] as const;
type PorPagina = (typeof POR_PAGINA)[number];

const usd = (minor: bigint | string) => formatMoneyVE(toMajor(money(BigInt(minor), "USD")), "USD");
/** «1,50» o «1.50» → «150» (centavos); `null` si no es un importe mayor que cero. */
function centavos(texto: string): string | null {
  const m = texto.trim() === "" ? null : importeTecleado(texto, "USD");
  return m && m.amount > 0n ? String(m.amount) : null;
}

/** Un plato de la lista: el producto con su precio de hoy y el próximo, si hay uno programado. */
type Fila = Readonly<{
  p: ProductoDto;
  hoy: bigint | null;
  proximo: Readonly<{ minor: bigint; desde: number }> | null;
  /** No se pide: se acabó, o todavía no tiene su inventario inicial (`sinContar`, B9-7). */
  agotado: boolean;
  sinContar: boolean;
}>;

function filasDe(catalogo: CatalogoDto, ahora: number | null): Fila[] {
  return catalogo.productos
    .filter((p) => p.activo)
    .map((p) => {
      const t = ahora ?? 0;
      const vigente = p.precios.find((x) => Date.parse(x.desde) <= t && (x.hasta === null || t < Date.parse(x.hasta)));
      const siguiente = p.precios.filter((x) => Date.parse(x.desde) > t).sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde))[0];
      return {
        p,
        hoy: ahora !== null && vigente ? BigInt(vigente.precio.minor) : null,
        proximo: ahora !== null && siguiente ? { minor: BigInt(siguiente.precio.minor), desde: Date.parse(siguiente.desde) } : null,
        agotado: p.existencia !== null && p.existencia <= 0,
        sinContar: estadoDe(p) === "SIN_INICIAL",
      };
    })
    .sort((a, b) => a.p.categoria.localeCompare(b.p.categoria, "es") || a.p.nombre.localeCompare(b.p.nombre, "es"));
}

const TH = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase whitespace-nowrap";
const TD = "px-3 py-2 align-middle";

export function CartaScreen({ catalogo: inicial }: { catalogo: CatalogoDto }) {
  const actor = useActorEnSesion();
  const puede = actor !== null && can(actor, "catalogo.modificar") !== "DENEGADO";
  const conElevacion = useConElevacion();
  const ahoraLocal = useAhoraLocal();
  const ahora = ahoraLocal === 0 ? null : ahoraLocal;
  const reloj = useReloj();

  // Lo que devuelve el servidor tras un cambio se adopta; si la página se vuelve a pintar con otro
  // catálogo (otro equipo lo cambió: tema `catalogo`), también.
  const [catalogo, setCatalogo] = useState(inicial);
  const huella = JSON.stringify(inicial);
  useEffect(() => setCatalogo(inicial), [huella]);

  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [categoria, setCategoria] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState<PorPagina>(20);
  const [hoja, setHoja] = useState<{ kind: "nuevo" } | { kind: "precio"; id: string } | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const aplicar = async (cmd: ProductoCommand, que: string): Promise<Resultado<CatalogoDto> | null> => {
    setEnviando(que);
    try {
      const r = await conElevacion(() => aplicarProducto(cmd));
      if (r.ok) setCatalogo(r.valor);
      return r;
    } catch {
      avisar.error("No se pudo hablar con el servidor. No se guardó nada.");
      return null;
    } finally {
      setEnviando(null);
    }
  };

  const filas = useMemo(() => filasDe(catalogo, ahora), [catalogo, ahora]);
  const categorias = useMemo(() => [...new Set(filas.map((f) => f.p.categoria))], [filas]);
  const enCarta = filas.filter((f) => f.p.enCarta);
  const cuentas: Record<Filtro, number> = {
    TODOS: filas.length,
    EN_CARTA: enCarta.length,
    FUERA: filas.length - enCarta.length,
    AGOTADOS: enCarta.filter((f) => f.agotado).length,
  };
  const sinContar = enCarta.filter((f) => f.sinContar).length;
  const programados = enCarta.filter((f) => f.proximo !== null);

  const texto = busqueda.trim().toLocaleLowerCase("es");
  const vistas = filas.filter(
    (f) =>
      (filtro === "TODOS" || (filtro === "EN_CARTA" && f.p.enCarta) || (filtro === "FUERA" && !f.p.enCarta) || (filtro === "AGOTADOS" && f.p.enCarta && f.agotado)) &&
      (categoria === "" || f.p.categoria === categoria) &&
      (texto === "" || f.p.nombre.toLocaleLowerCase("es").includes(texto) || f.p.sku.toLocaleLowerCase("es").includes(texto)),
  );
  const paginas = Math.max(1, Math.ceil(vistas.length / porPagina));
  const enPagina = Math.min(pagina, paginas);
  const pagina_ = vistas.slice((enPagina - 1) * porPagina, enPagina * porPagina);
  const hayFiltros = filtro !== "TODOS" || categoria !== "" || texto !== "";
  const limpiar = () => {
    setFiltro("TODOS");
    setCategoria("");
    setBusqueda("");
    setPagina(1);
  };
  const filtrar = (f: Filtro) => {
    setFiltro(f);
    setPagina(1);
  };

  async function alternar(f: Fila) {
    const r = await aplicar({ kind: "EN_CARTA", productId: f.p.id, enCarta: !f.p.enCarta }, `carta-${f.p.id}`);
    if (!r) return;
    if (r.ok) avisar.ok(f.p.enCarta ? `${f.p.nombre}: fuera de la carta` : `${f.p.nombre}: en la carta`, { detalle: f.p.enCarta ? "La caja lo sigue vendiendo; el mesero ya no lo ofrece." : "El mesero ya lo ofrece en las mesas." });
    else avisar.error(r.mensaje);
  }

  const enLaHoja = hoja?.kind === "precio" ? (filas.find((f) => f.p.id === hoja.id) ?? null) : null;

  const interruptor = (f: Fila, surface: "admin" | "tablet") => (
    <Button
      type="button"
      variant={f.p.enCarta ? "neutral" : "ghost"}
      surface={surface}
      role="switch"
      aria-checked={f.p.enCarta}
      aria-label={`${f.p.nombre}: ${f.p.enCarta ? "en la carta" : "fuera de la carta"}`}
      disabled={!puede || enviando === `carta-${f.p.id}`}
      onClick={() => void alternar(f)}
      className="gap-2 whitespace-nowrap"
    >
      <span aria-hidden="true" className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", f.p.enCarta ? "bg-brand" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 size-3 rounded-full bg-surface transition-[left]", f.p.enCarta ? "left-3.5" : "left-0.5")} />
      </span>
      {f.p.enCarta ? "En la carta" : "Fuera"}
    </Button>
  );

  const precio = (f: Fila) => (
    <span className="flex flex-col">
      <span className="tnum font-semibold text-ink">{f.hoy === null ? "Sin precio hoy" : usd(f.hoy)}</span>
      {f.proximo && (
        <span className="tnum flex items-center gap-1 text-[12px] text-ink-3">
          <CalendarClock size={12} aria-hidden="true" />
          {usd(f.proximo.minor)} desde el {reloj.dia(f.proximo.desde)}
        </span>
      )}
    </span>
  );

  const existencia = (f: Fila) =>
    f.p.existencia === null ? (
      <span className="text-ink-3">Sin stock</span>
    ) : f.sinContar ? (
      <span className="flex items-center gap-1 font-semibold text-ink-2">
        <ClipboardList size={13} aria-hidden="true" /> Sin inventario inicial
      </span>
    ) : f.agotado ? (
      <span className="flex items-center gap-1 font-semibold text-state-crit">
        <PackageX size={13} aria-hidden="true" /> Agotado
      </span>
    ) : (
      <span className="tnum text-ink-2">Quedan {f.p.existencia}</span>
    );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <EncabezadoDePagina
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Carta y precios" }]}
        titulo="Carta y precios"
        descripcion="Lo que el mesero ofrece en las mesas, del mismo catálogo que vende la caja. Cambiar un precio no altera lo ya pedido."
        acciones={
          puede ? (
            <Button type="button" variant="primary" surface="admin" onClick={() => setHoja({ kind: "nuevo" })}>
              <Plus size={15} aria-hidden="true" /> Nuevo plato
            </Button>
          ) : undefined
        }
      />

      <Resumen etiqueta="Resumen de la carta">
        <Cifra
          etiqueta="En la carta"
          icono={<BookOpen aria-hidden="true" />}
          valor={String(cuentas.EN_CARTA)}
          pie={`De ${filas.length} a la venta · ${categorias.length} ${categorias.length === 1 ? "categoría" : "categorías"}`}
          activo={filtro === "EN_CARTA"}
          onClick={() => filtrar("EN_CARTA")}
        />
        <Cifra
          etiqueta="Fuera de la carta"
          icono={<EyeOff aria-hidden="true" />}
          valor={String(cuentas.FUERA)}
          pie="Los vende la caja; el mesero no"
          activo={filtro === "FUERA"}
          onClick={() => filtrar("FUERA")}
        />
        <Cifra
          etiqueta="No se piden"
          icono={<PackageX aria-hidden="true" />}
          tono={cuentas.AGOTADOS > sinContar ? "crit" : "idle"}
          valor={String(cuentas.AGOTADOS)}
          pie={
            cuentas.AGOTADOS === 0
              ? "Todo lo de la carta se puede pedir"
              : sinContar === 0
                ? "En la carta y agotados"
                : sinContar === cuentas.AGOTADOS
                  ? "En la carta, sin inventario inicial"
                  : `${cuentas.AGOTADOS - sinContar} agotados y ${sinContar} sin inventario inicial`
          }
          activo={filtro === "AGOTADOS"}
          onClick={() => filtrar("AGOTADOS")}
        />
        <Cifra
          etiqueta="Precios programados"
          icono={<CalendarClock aria-hidden="true" />}
          valor={String(programados.length)}
          pie={programados.length > 0 ? `El próximo: ${programados.map((f) => f.p.nombre).slice(0, 2).join(", ")}` : "Ningún cambio de precio por venir"}
        />
      </Resumen>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <BarraDeFiltros hayFiltros={hayFiltros} onLimpiar={limpiar} cuenta={hayFiltros ? `${vistas.length} de ${filas.length}` : undefined}>
          <FiltroSegmentado
            etiqueta="Qué platos"
            valor={filtro}
            onCambiar={filtrar}
            opciones={[
              { id: "TODOS", nombre: "Todo", cuenta: cuentas.TODOS },
              { id: "EN_CARTA", nombre: "En la carta", cuenta: cuentas.EN_CARTA },
              { id: "FUERA", nombre: "Fuera", cuenta: cuentas.FUERA },
              { id: "AGOTADOS", nombre: "No se piden", cuenta: cuentas.AGOTADOS, alerta: true },
            ]}
          />
          <select
            aria-label="Categoría"
            className={CAMPO_DE_FILTRO}
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-2.5 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar un plato"
              placeholder="Buscar"
              className={cn(CAMPO_DE_FILTRO, "w-44 pl-8")}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
            />
          </label>
        </BarraDeFiltros>

        <div className="flex min-h-0 flex-1 flex-col">
          {filas.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed size={20} />}
              title="Todavía no hay nada a la venta"
              hint="La carta sale del catálogo. Da de alta el primer plato con su precio y el mesero ya lo ofrece."
              action={
                puede ? (
                  <Button type="button" variant="primary" surface="admin" onClick={() => setHoja({ kind: "nuevo" })}>
                    <Plus size={15} aria-hidden="true" /> Nuevo plato
                  </Button>
                ) : undefined
              }
            />
          ) : vistas.length === 0 ? (
            <EmptyState icon={<Search size={20} />} title="Nada con estos filtros" hint="Cambia o limpia los filtros." />
          ) : (
            <>
              {/* Escritorio: una línea por plato; la cabecera queda fija al desplazarse. */}
              <div className="hidden min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card lg:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr>
                      <th className={cn(TH, "w-full")}>Plato</th>
                      <th className={TH}>Categoría</th>
                      <th className={TH}>Precio</th>
                      <th className={TH}>Existencia</th>
                      <th className={TH}>Carta</th>
                      <th className={TH}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagina_.map((f) => (
                      <tr key={f.p.id} className={cn("border-t border-line", !f.p.enCarta && "text-ink-2")}>
                        <td className={cn(TD, "max-w-0")}>
                          <span className="flex min-w-0 items-center gap-2">
                            {f.p.tipo === "PREPARADO" ? (
                              <ChefHat size={14} className="shrink-0 text-ink-3" aria-label="Preparado" />
                            ) : (
                              <Package size={14} className="shrink-0 text-ink-3" aria-label="Producto" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-ink">{f.p.nombre}</span>
                              <span className="tnum block truncate text-[12px] text-ink-3">
                                {f.p.sku}
                                {f.p.presentacion ? ` · ${f.p.presentacion}` : ""}
                                {f.p.taxCode === "EXENTA" ? " · exento de IVA" : ""}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className={cn(TD, "whitespace-nowrap")}>{f.p.categoria}</td>
                        <td className={cn(TD, "whitespace-nowrap")}>{precio(f)}</td>
                        <td className={cn(TD, "whitespace-nowrap")}>{existencia(f)}</td>
                        <td className={cn(TD, "py-1")}>{interruptor(f, "admin")}</td>
                        <td className={cn(TD, "py-1")}>
                          {puede && (
                            <Button type="button" variant="ghost" surface="admin" onClick={() => setHoja({ kind: "precio", id: f.p.id })}>
                              <Tag size={14} aria-hidden="true" /> Precio
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tableta y teléfono: una tarjeta por plato, con su interruptor y su precio a mano. */}
              <ul className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto lg:hidden">
                {pagina_.map((f) => (
                  <li key={f.p.id} className="shrink-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-ink">{f.p.nombre}</span>
                        <span className="block text-[12px] text-ink-3">
                          {f.p.categoria} · {f.p.tipo === "PREPARADO" ? "preparado" : f.p.tipo === "SERVICIO" ? "servicio" : "producto"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[13px]">{precio(f)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                      {existencia(f)}
                      <span className="ml-auto flex items-center gap-1">
                        {puede && (
                          <Button type="button" variant="ghost" surface="tablet" onClick={() => setHoja({ kind: "precio", id: f.p.id })}>
                            <Tag size={14} aria-hidden="true" /> Precio
                          </Button>
                        )}
                        {interruptor(f, "tablet")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {vistas.length > 0 && (
          <Paginacion
            etiqueta="Páginas de la carta"
            pagina={enPagina}
            porPagina={porPagina}
            opciones={POR_PAGINA}
            total={vistas.length}
            onCambiar={(c) => {
              if (c.porPagina) {
                setPorPagina(c.porPagina);
                setPagina(1);
              } else if (c.pagina) setPagina(c.pagina);
            }}
          />
        )}
        <p className="shrink-0 text-[12.5px] text-ink-3">
          {puede ? "Un plato no se borra: se saca de la carta, y si ya no se vende, se aparta en la pestaña " : "La carta la arma la administración. Los productos completos están en la pestaña "}
          <Link href={"/panel/inventario/productos" as Route} className="font-semibold text-ink underline-offset-2 hover:underline">
            Productos
          </Link>
          .
        </p>
      </div>

      <PlatoNuevo abierto={hoja?.kind === "nuevo"} onCerrar={() => setHoja(null)} categorias={categorias} enviando={enviando} aplicar={aplicar} />
      <CambiarPrecio fila={enLaHoja} onCerrar={() => setHoja(null)} catalogo={catalogo} ahora={ahora} enviando={enviando} aplicar={aplicar} />
    </Container>
  );
}

type Aplicar = (cmd: ProductoCommand, que: string) => Promise<Resultado<CatalogoDto> | null>;

/** Los errores del servidor, por campo; lo que no es de un campo, en `general`. */
function porCampo(r: Resultado<unknown>, campos: readonly string[]): { errores: Record<string, string>; general: string | null } {
  if (r.ok) return { errores: {}, general: null };
  const errores: Record<string, string> = {};
  for (const p of r.problemas ?? []) {
    const campo = String(p.path.at(-1) ?? "");
    if (campos.includes(campo)) errores[campo] ??= p.message;
  }
  return { errores, general: Object.keys(errores).length === 0 ? r.mensaje : null };
}

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-[13px] font-medium text-state-crit">
      {mensaje}
    </p>
  );
}

/**
 * Alta de un plato: la ficha corta (nombre, categoría, precio e IVA) de un PREPARADO, o de un PRODUCTO
 * que se cuenta (entonces se vende cuando entre su mercancía). Nace en la carta.
 */
function PlatoNuevo({
  abierto,
  onCerrar,
  categorias,
  enviando,
  aplicar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  categorias: readonly string[];
  enviando: string | null;
  aplicar: Aplicar;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [taxCode, setTaxCode] = useState<TaxCodeDelCatalogo>("GENERAL");
  const [tipo, setTipo] = useState<"PREPARADO" | "PRODUCTO">("PREPARADO");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const cerrar = () => {
    setNombre("");
    setCategoria("");
    setPrecio("");
    setTaxCode("GENERAL");
    setTipo("PREPARADO");
    setErrores({});
    setGeneral(null);
    onCerrar();
  };

  const crear = async () => {
    const precioMinor = centavos(precio);
    if (!precioMinor) {
      setErrores({ precioMinor: "Un precio en dólares mayor que cero, con hasta dos decimales (1,50)" });
      return;
    }
    const r = await aplicar({ kind: "CREAR", producto: { nombre, categoria, taxCode, tipo, precioMinor, enCarta: true } }, "crear");
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${nombre.trim()} en la carta a ${usd(precioMinor)}`, tipo === "PRODUCTO" ? { detalle: "Se puede pedir cuando entre su mercancía." } : undefined);
      cerrar();
      return;
    }
    const e = porCampo(r, ["nombre", "categoria", "taxCode", "precioMinor"]);
    setErrores(e.errores);
    setGeneral(e.general);
  };

  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Nuevo plato"
      descripcion="Entra en la carta y en la caja con su precio desde que lo guardes."
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" disabled={enviando === "crear"} onClick={() => void crear()}>
            {enviando === "crear" ? "Guardando…" : "Guardar plato"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input surface="admin" label="Nombre" maxLength={80} value={nombre} error={errores["nombre"]} onChange={(e) => setNombre(e.target.value)} />
        <Input
          surface="admin"
          label="Categoría"
          maxLength={40}
          list="carta-categorias"
          placeholder="Pasapalos, Bebidas…"
          value={categoria}
          error={errores["categoria"]}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <datalist id="carta-categorias">
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <Input
            surface="admin"
            label="Precio ($)"
            placeholder="1,50"
            inputMode="decimal"
            autoComplete="off"
            value={precio}
            error={errores["precioMinor"]}
            onChange={(e) => {
              setPrecio(e.target.value);
              setErrores(({ precioMinor: _, ...resto }) => resto);
            }}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="plato-iva" className={ETIQUETA}>
              IVA
            </label>
            <select id="plato-iva" className={CAMPO} value={taxCode} onChange={(e) => setTaxCode(e.target.value as TaxCodeDelCatalogo)}>
              <option value="GENERAL">IVA general</option>
              <option value="EXENTA">Exento de IVA</option>
            </select>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(ETIQUETA, "mb-1.5")}>Cómo se hace</legend>
          {(
            [
              ["PREPARADO", "Se prepara al momento", "Sin stock: siempre se puede pedir.", ChefHat],
              ["PRODUCTO", "Se vende tal cual", "Lleva stock: se pide mientras quede.", Package],
            ] as const
          ).map(([id, nombreTipo, detalle, Icono]) => (
            <label
              key={id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-[13px]",
                tipo === id ? "border-brand bg-surface-2" : "border-line hover:bg-surface-2",
              )}
            >
              <input type="radio" name="plato-tipo" className="sr-only" checked={tipo === id} onChange={() => setTipo(id)} />
              <Icono size={16} className="shrink-0 text-ink-2" aria-hidden="true" />
              <span>
                <span className="block font-semibold text-ink">{nombreTipo}</span>
                <span className="block text-[12px] text-ink-3">{detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {general && <Aviso mensaje={general} />}
      </div>
    </Sheet>
  );
}

/** Programar el precio de un plato: rige desde ahora (hoy) o desde la medianoche del día que se elija. */
function CambiarPrecio({
  fila,
  onCerrar,
  catalogo,
  ahora,
  enviando,
  aplicar,
}: {
  fila: Fila | null;
  onCerrar: () => void;
  catalogo: CatalogoDto;
  ahora: number | null;
  enviando: string | null;
  aplicar: Aplicar;
}) {
  const reloj = useReloj();
  const [precio, setPrecio] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const id = fila?.p.id ?? null;
  useEffect(() => {
    setPrecio("");
    setDia(null);
    setErrores({});
    setGeneral(null);
  }, [id]);

  // Al cerrar, la hoja sigue enseñando el último plato mientras se va (su salida es animada).
  const [ultima, setUltima] = useState(fila);
  if (fila && fila !== ultima) setUltima(fila);
  const f = fila ?? ultima;
  const hoy = ahora === null ? null : calendarDay(new Date(ahora).toISOString(), catalogo.zonaHoraria);
  const diaElegido = dia ?? hoy;

  const programar = async () => {
    if (!f || !diaElegido) return;
    const precioMinor = centavos(precio);
    if (!precioMinor) {
      setErrores({ precioMinor: "Un precio en dólares mayor que cero, con hasta dos decimales (1,50)" });
      return;
    }
    const r = await aplicar({ kind: "PROGRAMAR_PRECIO", productId: f.p.id, precioMinor, dia: diaElegido }, "precio");
    if (!r) return;
    if (r.ok) {
      avisar.ok(diaElegido === hoy ? `${f.p.nombre} a ${usd(precioMinor)}: rige desde ahora` : `${f.p.nombre} a ${usd(precioMinor)} desde el ${diaElegido.split("-").reverse().join("/")}`);
      onCerrar();
      return;
    }
    const e = porCampo(r, ["precioMinor", "dia"]);
    setErrores(e.errores);
    setGeneral(e.general);
  };

  return (
    <Sheet
      abierto={fila !== null}
      onCerrar={onCerrar}
      titulo={f ? `Precio · ${f.p.nombre}` : "Precio"}
      descripcion="Lo ya pedido conserva su precio. Un cambio para otro día rige desde su medianoche."
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" disabled={enviando === "precio" || !precio.trim() || !hoy} onClick={() => void programar()}>
            {enviando === "precio" ? "Programando…" : "Programar precio"}
          </Button>
        </div>
      }
    >
      {f && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 rounded-[var(--radius-control)] border border-line p-3 text-[13px]">
            <div>
              <dt className={ETIQUETA}>Rige hoy</dt>
              <dd className="tnum text-[16px] font-bold text-ink">{f.hoy === null ? "Sin precio" : usd(f.hoy)}</dd>
            </div>
            <div>
              <dt className={ETIQUETA}>Próximo</dt>
              <dd className="tnum text-ink-2">{f.proximo ? `${usd(f.proximo.minor)} desde el ${reloj.dia(f.proximo.desde)}` : "Ninguno"}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <Input
              surface="admin"
              label="Nuevo precio ($)"
              placeholder="1,50"
              inputMode="decimal"
              autoComplete="off"
              value={precio}
              error={errores["precioMinor"]}
              onChange={(e) => {
                setPrecio(e.target.value);
                setErrores(({ precioMinor: _, ...resto }) => resto);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="carta-dia" className={ETIQUETA}>
                Rige desde
              </label>
              <input
                id="carta-dia"
                type="date"
                className={cn(CAMPO, "tnum")}
                value={diaElegido ?? ""}
                min={hoy ?? undefined}
                max={hoy ? addDays(hoy, catalogo.diasPorAdelantado) : undefined}
                disabled={!hoy}
                onChange={(e) => setDia(e.target.value || null)}
              />
              {errores["dia"] && <p className="text-[12px] font-medium text-state-crit">{errores["dia"]}</p>}
            </div>
          </div>
          <p className="text-[12px] text-ink-3">
            {diaElegido === hoy
              ? "Hoy: rige desde que lo guardes, en la caja y en las mesas."
              : "Rige desde la medianoche de ese día (hora del local). Para cancelarlo, programa ese día el precio que rige."}
          </p>
          {general && <Aviso mensaje={general} />}
        </div>
      )}
    </Sheet>
  );
}
