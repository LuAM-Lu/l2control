"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, History, PackageOpen, PackagePlus, PackageX, Plus, Search } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { CatalogoDto, ProductoCommand, ProductoDto, Resultado, TaxCode, TaxCodeDelCatalogo } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { categoriesOf, marginBasisPoints, nameKey, periodAt } from "@l2/domain-inventory";
import { addDays, calendarDay } from "@l2/domain-rates";
import { convert, invertRate, money, toMajor, type Money } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, Sheet, avisar, cn, formatMoneyVE } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { useTasaVigente } from "../cash/TasasProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { aplicarProducto } from "./productos.acciones";
import { periodosDe } from "./catalogo.ts";

/**
 * Panel → Inventario → Productos (B9-1, F8-02). Lo que la caja vende en el mostrador o añade a una
 * cuenta, leído del servidor. Un producto no se borra (lo vendido lo nombra): se aparta. Un precio
 * no se edita: se programa el siguiente con su día, y lo ya vendido se queda con el que tenía.
 * Cada cambio pide confirmar identidad; quién puede y si el día vale lo decide el servidor.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-9 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

/** Lo que se elige: el IVA reducido no se usa en el local (v0.30.1) y el servidor no lo acepta. */
const TRATOS: readonly { code: TaxCodeDelCatalogo; nombre: string }[] = [
  { code: "GENERAL", nombre: "IVA general" },
  { code: "EXENTA", nombre: "Exento de IVA" },
];
/** Lo que se lee: un producto viejo con el reducido se sigue nombrando bien. */
const nombreTrato = (code: TaxCode) => (code === "REDUCIDA" ? "IVA reducido" : TRATOS.find((t) => t.code === code)!.nombre);

const usd = (m: Money) => formatMoneyVE(toMajor(m), "USD");
const precioDe = (minor: string) => money(BigInt(minor), "USD");
/** «1,50» o «1.50» → «150» (centavos); `null` si no es un importe mayor que cero. */
function centavos(texto: string): string | null {
  const m = texto.trim() === "" ? null : importeTecleado(texto, "USD");
  return m && m.amount > 0n ? String(m.amount) : null;
}

/** «jue 1 oct»: un día en palabras, en la zona del local. */
function diaEnPalabras(instante: number, zona: string): string {
  const partes = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: zona }).formatToParts(instante);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value.replace(".", "") ?? "";
  return `${de("weekday")} ${de("day")} ${de("month")}`;
}

type Aplicar = (cmd: ProductoCommand, que: string) => Promise<Resultado<CatalogoDto> | null>;

export function ProductosScreen({ catalogo: inicial }: { catalogo: CatalogoDto }) {
  const actor = useActorEnSesion();
  const puedeModificar = actor !== null && can(actor, "catalogo.modificar") !== "DENEGADO";
  const conElevacion = useConElevacion();
  const ahoraLocal = useAhoraLocal();
  const ahora = ahoraLocal === 0 ? null : ahoraLocal;
  const { congelada } = useTasaVigente("USD/VES");
  // La tasa se guarda de bolívares a dólares; para enseñar el precio en bolívares se invierte.
  const tasa = congelada ? (congelada.from === "USD" ? congelada : invertRate(congelada)) : null;

  // Lo que devuelve el servidor tras un cambio se adopta; si la página se vuelve a pintar con otro
  // catálogo (se cambió en otro equipo y se navegó), también. La huella dice si cambió algo.
  const [catalogo, setCatalogo] = useState(inicial);
  const huella = JSON.stringify(inicial);
  useEffect(() => setCatalogo(inicial), [huella]);

  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"venta" | "apartados">("venta");
  const [creando, setCreando] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  /** Qué se está guardando: bloquea ese control mientras el servidor responde. */
  const [enviando, setEnviando] = useState<string | null>(null);

  const cambiar: Aplicar = async (cmd, que) => {
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

  const periodos = useMemo(() => periodosDe(catalogo.productos), [catalogo]);
  const categorias = useMemo(() => categoriesOf(catalogo.productos.map((p) => ({ category: p.categoria }))), [catalogo]);
  const aLaVenta = catalogo.productos.filter((p) => p.activo);
  const apartados = catalogo.productos.filter((p) => !p.activo);
  const visibles = (vista === "venta" ? aLaVenta : apartados).filter((p) => nameKey(p.nombre).includes(nameKey(busqueda)));
  const grupos = categorias
    .map((c) => ({ categoria: c, productos: visibles.filter((p) => nameKey(p.categoria) === nameKey(c)) }))
    .filter((g) => g.productos.length > 0);
  const abierto = catalogo.productos.find((p) => p.id === abiertoId) ?? null;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Inventario", href: "/panel/inventario" }, { texto: "Productos" }]}
        titulo="Productos"
        descripcion="Lo que la caja vende en el mostrador o añade a una cuenta. El precio se programa con su día: cambiarlo no altera lo ya vendido."
        acciones={
          puedeModificar && (
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setCreando(true)}>
              <Plus size={15} aria-hidden="true" />
              Nuevo producto
            </Button>
          )
        }
      />

      {catalogo.productos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
          <PackageOpen size={28} className="text-ink-3" aria-hidden="true" />
          <p className="font-display text-[16px] font-bold text-ink">Todavía no hay productos</p>
          <p className="max-w-md text-[13px] text-ink-2">
            Sin productos, la caja no vende en el mostrador. Crea el primero con su precio: la caja lo ofrece en cuanto la cajera
            vuelva a abrir la pantalla.
          </p>
          {puedeModificar && (
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setCreando(true)}>
              <Plus size={15} aria-hidden="true" />
              Nuevo producto
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Qué productos ver" className="flex gap-1 rounded-[var(--radius-control)] bg-surface-2 p-1">
              {(
                [
                  ["venta", `A la venta · ${aLaVenta.length}`],
                  ["apartados", `Apartados · ${apartados.length}`],
                ] as const
              ).map(([id, texto]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={vista === id}
                  onClick={() => setVista(id)}
                  className={cn(
                    "tnum min-h-8 cursor-pointer rounded-[var(--radius-control)] px-3 text-[13px] transition-colors",
                    vista === id ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
            <label className="relative ml-auto flex min-w-0 flex-1 sm:max-w-72">
              <span className="sr-only">Buscar un producto</span>
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden="true" />
              <input type="search" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className={cn(CAMPO, "pl-9")} />
            </label>
          </div>

          {grupos.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              {busqueda ? "Ningún producto con ese nombre." : vista === "apartados" ? "No hay productos apartados." : "No hay productos a la venta."}
            </p>
          ) : (
            grupos.map((g) => (
              <section key={g.categoria} aria-label={g.categoria} className="rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                <h2 className="border-b border-line px-4 py-2 text-[13px] font-bold text-ink">
                  {g.categoria} <span className="tnum font-normal text-ink-3">· {g.productos.length}</span>
                </h2>
                <ul className="flex flex-col divide-y divide-line">
                  {g.productos.map((p) => {
                    const vigente = ahora === null ? undefined : periodAt(periodos, p.id, ahora);
                    const siguiente = ahora === null ? undefined : p.precios.find((t) => Date.parse(t.desde) > ahora);
                    const precio = vigente ? money(vigente.amountMinor, "USD") : null;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setAbiertoId(p.id)}
                          className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[14px] font-semibold text-ink">{p.nombre}</span>
                            <span className="truncate text-[12px] text-ink-3">
                              {nombreTrato(p.taxCode)}
                              {` · ${existenciaEnPalabras(p)}`}
                            </span>
                          </span>
                          {siguiente && ahora !== null && (
                            <span className="tnum flex items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 text-[12px] font-semibold text-brand">
                              <CalendarClock size={12} aria-hidden="true" />
                              {usd(precioDe(siguiente.precio.minor))} desde el {diaEnPalabras(Date.parse(siguiente.desde), catalogo.zonaHoraria)}
                            </span>
                          )}
                          <span className="flex w-28 shrink-0 flex-col items-end">
                            {precio ? (
                              <>
                                <span className="tnum text-[15px] font-bold text-ink">{usd(precio)}</span>
                                {tasa && <span className="tnum text-[11px] text-ink-3">{formatMoneyVE(toMajor(convert(precio, tasa)), "VES")}</span>}
                              </>
                            ) : ahora === null ? (
                              <span className="text-[13px] text-ink-3">…</span>
                            ) : (
                              <span className="flex items-center gap-1 text-[12px] font-semibold text-state-warn">
                                <AlertTriangle size={12} aria-hidden="true" />
                                Sin precio hoy
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
          <p className="text-center text-[12.5px] text-ink-3">
            Nada se borra: un producto se aparta y vuelve a la venta cuando haga falta. Los cambios llegan a la caja al volver a
            abrir su pantalla.
          </p>
        </div>
      )}

      <ProductoNuevo abierto={creando} onCerrar={() => setCreando(false)} categorias={categorias} enviando={enviando} cambiar={cambiar} />
      <FichaProducto
        producto={abierto}
        onCerrar={() => setAbiertoId(null)}
        catalogo={catalogo}
        categorias={categorias}
        ahora={ahora}
        puedeModificar={puedeModificar}
        enviando={enviando}
        cambiar={cambiar}
      />
    </Container>
  );
}

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

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-[13px] font-medium text-state-crit">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      {mensaje}
    </p>
  );
}

function CamposDelProducto({
  prefijo,
  nombre,
  setNombre,
  categoria,
  setCategoria,
  taxCode,
  setTaxCode,
  controlaStock,
  setControlaStock,
  categorias,
  errores,
  deshabilitado,
}: {
  prefijo: string;
  nombre: string;
  setNombre: (v: string) => void;
  categoria: string;
  setCategoria: (v: string) => void;
  taxCode: TaxCodeDelCatalogo;
  setTaxCode: (v: TaxCodeDelCatalogo) => void;
  controlaStock: boolean;
  setControlaStock: (v: boolean) => void;
  categorias: readonly string[];
  errores: Record<string, string>;
  deshabilitado?: boolean;
}) {
  return (
    <>
      <Input surface="admin" label="Nombre" placeholder="Agua mineral" autoComplete="off" value={nombre} error={errores["nombre"]} disabled={deshabilitado} onChange={(e) => setNombre(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input
          surface="admin"
          label="Categoría"
          placeholder="Bebidas"
          autoComplete="off"
          list={`${prefijo}-categorias`}
          value={categoria}
          error={errores["categoria"]}
          hint="Es una pestaña de la caja"
          disabled={deshabilitado}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <datalist id={`${prefijo}-categorias`}>
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${prefijo}-iva`} className={ETIQUETA}>
            IVA
          </label>
          <select id={`${prefijo}-iva`} className={CAMPO} value={taxCode} disabled={deshabilitado} onChange={(e) => setTaxCode(e.target.value as TaxCodeDelCatalogo)}>
            {TRATOS.map((t) => (
              <option key={t.code} value={t.code}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label htmlFor={`${prefijo}-stock`} className="flex min-h-9 cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2">
        <input id={`${prefijo}-stock`} type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={controlaStock} disabled={deshabilitado} onChange={(e) => setControlaStock(e.target.checked)} />
        <span className="flex flex-col">
          <span className="text-[13.5px] font-semibold text-ink">Lleva existencia</span>
          <span className="text-[12px] text-ink-3">Se descuenta al venderlo y, sin existencia, no se vende. Un café hecho al momento, no.</span>
        </span>
      </label>
    </>
  );
}

/** «Nuevo producto»: nace a la venta, con su precio rigiendo desde que se guarda. */
function ProductoNuevo({
  abierto,
  onCerrar,
  categorias,
  enviando,
  cambiar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  categorias: readonly string[];
  enviando: string | null;
  cambiar: Aplicar;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [taxCode, setTaxCode] = useState<TaxCodeDelCatalogo>("GENERAL");
  const [controlaStock, setControlaStock] = useState(true);
  const [precio, setPrecio] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  const cerrar = () => {
    setNombre("");
    setCategoria("");
    setTaxCode("GENERAL");
    setControlaStock(true);
    setPrecio("");
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
    const r = await cambiar({ kind: "CREAR", producto: { nombre, categoria, taxCode, controlaStock, precioMinor } }, "crear");
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${nombre.trim()} a la venta a ${usd(precioDe(precioMinor))}`);
      cerrar();
      return;
    }
    const e = porCampo(r, ["nombre", "categoria", "taxCode", "precioMinor"]);
    setErrores(e.errores);
    setGeneral(e.general);
  };

  const ocupado = enviando === "crear";
  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Nuevo producto"
      descripcion="Nace a la venta, con su precio rigiendo desde que lo guardes."
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={cerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" onClick={() => void crear()} disabled={ocupado || !nombre.trim() || !categoria.trim() || !precio.trim()}>
            {ocupado ? "Guardando…" : "Crear producto"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CamposDelProducto
          prefijo="nuevo"
          nombre={nombre}
          setNombre={setNombre}
          categoria={categoria}
          setCategoria={setCategoria}
          taxCode={taxCode}
          setTaxCode={setTaxCode}
          controlaStock={controlaStock}
          setControlaStock={setControlaStock}
          categorias={categorias}
          errores={errores}
        />
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
        <p className="text-[12px] text-ink-3">Pide confirmar tu identidad: mueve lo que cobra el negocio.</p>
        {general && <Aviso mensaje={general} />}
      </div>
    </Sheet>
  );
}

/** La ficha de un producto: sus datos, su precio con su calendario, y apartarlo o volver a venderlo. */
function FichaProducto({
  producto,
  onCerrar,
  catalogo,
  categorias,
  ahora,
  puedeModificar,
  enviando,
  cambiar,
}: {
  producto: ProductoDto | null;
  onCerrar: () => void;
  catalogo: CatalogoDto;
  categorias: readonly string[];
  ahora: number | null;
  puedeModificar: boolean;
  enviando: string | null;
  cambiar: Aplicar;
}) {
  const { ajustes } = useSucursal();
  const zona = catalogo.zonaHoraria;
  const hoy = ahora === null ? null : calendarDay(new Date(ahora).toISOString(), zona);
  const cuando = (iso: string) => `${diaEnPalabras(Date.parse(iso), zona)}, ${formatClock(Date.parse(iso), ajustes.formatoHora, ajustes.zonaHoraria)}`;

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [taxCode, setTaxCode] = useState<TaxCodeDelCatalogo>("GENERAL");
  const [controlaStock, setControlaStock] = useState(true);
  const [precio, setPrecio] = useState("");
  const [dia, setDia] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);

  // Al abrir otra ficha, el formulario arranca con lo guardado.
  const id = producto?.id ?? null;
  useEffect(() => {
    if (!producto) return;
    setNombre(producto.nombre);
    setCategoria(producto.categoria);
    // Uno viejo con el IVA reducido (el local ya no lo usa) se abre con el general, a la vista: guardar
    // es decidirlo, y el servidor no acepta el reducido.
    setTaxCode(producto.taxCode === "REDUCIDA" ? "GENERAL" : producto.taxCode);
    setControlaStock(producto.controlaStock);
    setPrecio("");
    setDia(null);
    setErrores({});
    setGeneral(null);
  }, [id]);

  if (!producto) return <Sheet abierto={false} onCerrar={onCerrar} titulo="Producto">{null}</Sheet>;
  const diaElegido = dia ?? hoy;

  const guardar = async () => {
    const r = await cambiar({ kind: "EDITAR", productId: producto.id, nombre, categoria, taxCode, controlaStock }, "editar");
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${nombre.trim()}: guardado`);
      setErrores({});
      setGeneral(null);
      return;
    }
    const e = porCampo(r, ["nombre", "categoria", "taxCode"]);
    setErrores(e.errores);
    setGeneral(e.general);
  };

  const programar = async () => {
    const precioMinor = centavos(precio);
    if (!precioMinor) {
      setErrores({ precioMinor: "Un precio en dólares mayor que cero, con hasta dos decimales (1,50)" });
      return;
    }
    if (!diaElegido) return;
    const r = await cambiar({ kind: "PROGRAMAR_PRECIO", productId: producto.id, precioMinor, dia: diaElegido }, "precio");
    if (!r) return;
    if (r.ok) {
      const elDia = diaEnPalabras(Date.parse(`${diaElegido}T12:00:00.000Z`), "UTC");
      avisar.ok(diaElegido === hoy ? `${producto.nombre} a ${usd(precioDe(precioMinor))}: rige desde ahora` : `${producto.nombre} a ${usd(precioDe(precioMinor))} desde el ${elDia}`);
      setPrecio("");
      setDia(null);
      setErrores({});
      setGeneral(null);
      return;
    }
    const e = porCampo(r, ["precioMinor", "dia"]);
    setErrores(e.errores);
    setGeneral(e.general);
  };

  const activar = async (activo: boolean) => {
    const r = await cambiar({ kind: "ACTIVAR", productId: producto.id, activo }, "activar");
    if (!r) return;
    if (r.ok) avisar.ok(activo ? `${producto.nombre}: vuelve a la venta` : `${producto.nombre}: apartado, la caja ya no lo ofrece`);
    else avisar.error(r.mensaje);
  };

  const tramos = [...producto.precios].sort((a, b) => Date.parse(b.desde) - Date.parse(a.desde));
  const estadoDe = (desde: string, hasta: string | null) =>
    ahora === null ? "RIGE" : Date.parse(desde) > ahora ? "PROGRAMADO" : hasta !== null && Date.parse(hasta) <= ahora ? "TERMINO" : "RIGE";
  const nombreFila = catalogo.productos.find((p) => p.id === producto.id)?.nombre ?? producto.nombre;

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={nombreFila}
      descripcion={`${producto.activo ? `${producto.categoria} · a la venta` : `${producto.categoria} · apartado: la caja no lo ofrece`} · ${existenciaEnPalabras(producto)}`}
      pie={
        puedeModificar ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button type="button" variant="neutral" surface="admin" className="flex-1" disabled={enviando === "activar"} onClick={() => void activar(!producto.activo)}>
              {enviando === "activar" ? "Guardando…" : producto.activo ? "Apartar de la venta" : "Volver a la venta"}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" surface="admin" className="w-full" onClick={onCerrar}>
            Cerrar
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {producto.controlaStock && <Existencia producto={producto} ahora={ahora} />}
        <section aria-label="Precio" className="flex flex-col gap-3">
          <h3 className="font-display text-[14px] font-bold text-ink">Precio</h3>
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {tramos.map((t) => {
              const estado = estadoDe(t.desde, t.hasta);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("tnum text-[15px] font-bold", estado === "TERMINO" ? "text-ink-3" : "text-ink")}>{usd(precioDe(t.precio.minor))}</span>
                    <span className="tnum text-[12px] text-ink-3">
                      desde {cuando(t.desde)}
                      {t.hasta ? ` · hasta ${cuando(t.hasta)}` : ""} · {t.programadoPor}
                    </span>
                  </span>
                  <ChipEstado estado={estado} />
                </li>
              );
            })}
          </ul>
          {puedeModificar && (
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
                <label htmlFor="ficha-dia" className={ETIQUETA}>
                  Rige desde
                </label>
                <input
                  id="ficha-dia"
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
              <p className="col-span-2 text-[12px] text-ink-3">
                {diaElegido === hoy
                  ? "Hoy: rige desde que lo guardes. Lo ya vendido se queda con su precio."
                  : "Rige desde la medianoche de ese día (hora de Venezuela). Para cancelarlo, programa ese día el precio que rige."}
              </p>
              <Button type="button" variant="primary" surface="admin" className="col-span-2" disabled={enviando === "precio" || !precio.trim() || !hoy} onClick={() => void programar()}>
                {enviando === "precio" ? "Programando…" : "Programar precio"}
              </Button>
            </div>
          )}
        </section>

        <section aria-label="Datos del producto" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="font-display text-[14px] font-bold text-ink">Datos</h3>
          <CamposDelProducto
            prefijo="ficha"
            nombre={nombre}
            setNombre={setNombre}
            categoria={categoria}
            setCategoria={setCategoria}
            taxCode={taxCode}
            setTaxCode={setTaxCode}
            controlaStock={controlaStock}
            setControlaStock={setControlaStock}
            categorias={categorias}
            errores={errores}
            deshabilitado={!puedeModificar}
          />
          {puedeModificar && (
            <Button type="button" variant="neutral" surface="admin" disabled={enviando === "editar"} onClick={() => void guardar()}>
              {enviando === "editar" ? "Guardando…" : "Guardar datos"}
            </Button>
          )}
          <p className="text-[12px] text-ink-3">Lo ya vendido conserva el nombre y el IVA con que se vendió.</p>
        </section>
        {general && <Aviso mensaje={general} />}
      </div>
    </Sheet>
  );
}

function ChipEstado({ estado }: { estado: "RIGE" | "PROGRAMADO" | "TERMINO" }) {
  if (estado === "RIGE") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-state-ok">
        <CheckCircle2 size={14} aria-hidden="true" />
        Rige ahora
      </span>
    );
  }
  if (estado === "PROGRAMADO") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 text-[12px] font-semibold text-brand">
        <CalendarClock size={13} aria-hidden="true" />
        Programado
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-3">
      <History size={13} aria-hidden="true" />
      Terminó
    </span>
  );
}

/** La existencia en palabras (B9-2): cuántas quedan en esta sucursal, o que no lleva. */
function existenciaEnPalabras(p: Pick<ProductoDto, "existencia">): string {
  if (p.existencia === null) return "sin existencia";
  if (p.existencia === 0) return "agotado: no se vende";
  return p.existencia === 1 ? "queda 1" : `quedan ${p.existencia}`;
}

const PORCENTAJE = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Lo que queda, lo que cuesta y lo que deja (B9-2, B9-3): la existencia de la sucursal, el costo
 * promedio ponderado y el margen sobre el precio de hoy. Desde aquí se carga su entrada.
 */
function Existencia({ producto, ahora }: { producto: ProductoDto; ahora: number | null }) {
  const actor = useActorEnSesion();
  const puedeRecibir = actor !== null && can(actor, "inventario.entrada") !== "DENEGADO";
  const tramo = ahora === null ? undefined : periodAt(periodosDe([producto]), producto.id, ahora);
  const costo = producto.costoPromedio ? BigInt(producto.costoPromedio.minor) : null;
  const margen = tramo ? marginBasisPoints(tramo.amountMinor, costo) : null;
  const agotado = producto.existencia === 0;
  return (
    <section aria-label="Existencia" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[14px] font-bold text-ink">Existencia</h3>
        {puedeRecibir && (
          <Link
            href={`/panel/inventario/entradas?producto=${producto.id}` as Route}
            className="flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 text-[13px] font-semibold text-ink no-underline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <PackagePlus size={14} aria-hidden="true" />
            Cargar entrada
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <dt className={ETIQUETA}>Quedan</dt>
          <dd className={cn("tnum flex items-center gap-1 text-[16px] font-bold", agotado ? "text-ink-2" : "text-ink")}>
            {agotado && <PackageX size={15} aria-hidden="true" />}
            {agotado ? "Agotado" : producto.existencia}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={ETIQUETA}>Costo promedio</dt>
          <dd className="tnum text-[16px] font-bold text-ink">{costo === null ? <span className="text-[13px] font-normal text-ink-3">Sin existencia</span> : usd(money(costo, "USD"))}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className={ETIQUETA}>Margen</dt>
          <dd className={cn("tnum text-[16px] font-bold", margen !== null && margen < 0 ? "text-state-crit" : "text-ink")}>
            {margen === null ? <span className="text-[13px] font-normal text-ink-3">—</span> : `${PORCENTAJE.format(margen / 100)} %`}
          </dd>
        </div>
      </dl>
      {margen !== null && margen < 0 && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-state-crit">
          <AlertTriangle size={13} aria-hidden="true" />
          Se vende por debajo de lo que cuesta.
        </p>
      )}
    </section>
  );
}
