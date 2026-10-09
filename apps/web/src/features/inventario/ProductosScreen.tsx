"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArchiveRestore, ArchiveX, CalendarClock, Copy, CopyPlus, CheckCircle2, ChefHat, ClipboardList, History, ListPlus, Package, PackageOpen, PackagePlus, PackageX, Plus, ScanLine, Tags, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { AreaDeProductoDto, CatalogoDto, ProductoCommand, ProductoDto, Resultado, TaxCodeDelCatalogo, TipoProducto } from "@l2/contracts";
import { areaDe } from "@l2/domain-orders";
import { can } from "@l2/domain-identity";
import { barcodeProblem, marginBasisPoints, normalizeBarcode, periodAt } from "@l2/domain-inventory";
import { addDays, calendarDay } from "@l2/domain-rates";
import { invertRate, money, toMajor, type Money } from "@l2/domain-money";
import { Button, Container, Input, Sheet, TAMANO_ICONO, avisar, cn, formatMoneyVE, useLectorDeCodigos, useMediaQuery } from "@l2/ui";
import { EncabezadoDePagina } from "../shell/MarcoDeSeccion.tsx";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { useTasaVigente } from "../cash/TasasProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { aplicarProducto, fijarMinimo } from "./productos.acciones";
import { BarraDeLote, EditarEnLote, type CambioDeLote } from "./EditarEnLote.tsx";
import { DuplicarConSabores, plantillaDe, type Plantilla } from "./DuplicarConSabores.tsx";
import { EstadoStock, estadoDe as estadoDelStock } from "./EstadoStock.tsx";
import { AltaEnLote } from "./AltaEnLote.tsx";
import { ElegirArea } from "./ElegirArea.tsx";
import { categoriasDelCatalogo, periodosDe } from "./catalogo.ts";
import { InventarioVista } from "./InventarioVista.tsx";
import { CategoriasSheet } from "./CategoriasSheet.tsx";
import { RetirarProducto } from "./RetirarProducto.tsx";
import { CampoCategoria } from "./CampoCategoria.tsx";

/**
 * Panel → Inventario → Productos (B9-1, F8-02; rediseñada en B9-6, M-16). El stock es lo protagonista:
 * la vista (`InventarioVista`) enseña lo que hay y lo que hay que reponer, por tipo, en tabla o en
 * tarjetas, y pasar un código por el lector abre su ficha. Un producto no se borra (lo vendido lo
 * nombra): se aparta. Un precio no se edita: se programa el siguiente con su día. Cada cambio del
 * catálogo pide confirmar identidad; quién puede y si vale lo decide el servidor.
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
/** Los tres tipos (B9-6), con lo que significa cada uno para quien elige. */
const TIPOS: readonly { id: TipoProducto; nombre: string; detalle: string; Icono: typeof Package }[] = [
  { id: "PRODUCTO", nombre: "Producto", detalle: "Se cuenta: tiene stock y entradas", Icono: Package },
  { id: "PREPARADO", nombre: "Preparado", detalle: "Se hace al momento, sin stock", Icono: ChefHat },
  { id: "SERVICIO", nombre: "Servicio", detalle: "Alquiler, paquetes", Icono: Ticket },
];

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

/**
 * Aplicar un cambio a un producto con la elevación de identidad si hace falta, y adoptar el catálogo como quedó. Lo usan
 * Productos y la ficha abierta desde una entrada (B9-11).
 */
export function useAplicarProducto(alCambiar: (c: CatalogoDto) => void): { cambiar: Aplicar; enviando: string | null } {
  const conElevacion = useConElevacion();
  const [enviando, setEnviando] = useState<string | null>(null);
  const cambiar: Aplicar = async (cmd, que) => {
    setEnviando(que);
    try {
      const r = await conElevacion(() => aplicarProducto(cmd));
      if (r.ok) alCambiar(r.valor);
      return r;
    } catch {
      avisar.error("No se pudo hablar con el servidor. No se guardó nada.");
      return null;
    } finally {
      setEnviando(null);
    }
  };
  return { cambiar, enviando };
}

export function ProductosScreen({ catalogo: inicial }: { catalogo: CatalogoDto }) {
  const actor = useActorEnSesion();
  // El alta, la ficha y apartar son del inventario (T-13); el precio, de `catalogo.modificar`.
  const puedeModificar = actor !== null && can(actor, "inventario.catalogo") !== "DENEGADO";
  const puedePrecio = actor !== null && can(actor, "catalogo.modificar") !== "DENEGADO";
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

  const actorPuedeRecibir = actor !== null && can(actor, "inventario.entrada") !== "DENEGADO";
  /** `null` = cerrada; si no, el código de barras con que nace (leído en la lista). */
  const [creando, setCreando] = useState<{ codigo: string } | null>(null);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [conCategorias, setConCategorias] = useState(false);
  const [enLote, setEnLote] = useState(false);
  /** B9-9: los elegidos en la tabla y el cambio en lote que se está pidiendo. */
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [cambioEnLote, setCambioEnLote] = useState<CambioDeLote | null>(null);
  /** B9-8: la copia de un producto, sola o con otros sabores. */
  const [duplicando, setDuplicando] = useState<{ plantilla: Plantilla; modo: "UNO" | "SABORES" } | null>(null);
  const puedeLote = puedeModificar || puedePrecio || actorPuedeRecibir;
  // En el teléfono la barra va abajo, fija: ahí desplaza la ventana y la región del panel no la sostiene.
  const enTelefono = useMediaQuery("(max-width: 47.99rem)");
  /** Qué se está guardando: bloquea ese control mientras el servidor responde. */
  const [enviando, setEnviando] = useState<string | null>(null);
  /** B9-11: los retirados se ven aparte («Retirados»); retirar y devolver, con el PIN de administración. */
  const [verRetirados, setVerRetirados] = useState(false);
  const [retiro, setRetiro] = useState<{ producto: ProductoDto; modo: "RETIRAR" | "DEVOLVER" } | null>(null);
  const puedeRetirar = actor !== null && can(actor, "inventario.ajustar") !== "DENEGADO";
  const router = useRouter();

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

  const retirados = catalogo.productos.filter((p) => p.retirado).length;
  /** Lo que se ve: los del catálogo, o solo los retirados. */
  const aLaVista = useMemo(
    () => ({ ...catalogo, productos: catalogo.productos.filter((p) => p.retirado === verRetirados) }),
    [catalogo, verRetirados],
  );
  const periodos = useMemo(() => periodosDe(catalogo.productos), [catalogo]);
  const categorias = useMemo(() => categoriasDelCatalogo(catalogo), [catalogo]);
  const abierto = catalogo.productos.find((p) => p.id === abiertoId) ?? null;
  // Lo que se cuenta, está a la venta y todavía no tiene su inventario inicial (B9-7).
  const pendientes = catalogo.productos.filter((p) => p.activo && estadoDelStock(p) === "SIN_INICIAL").length;

  // Pasar un código por el lector abre su ficha (B9-6). Con una hoja abierta, escucha ella.
  useLectorDeCodigos((leido) => {
    const codigo = normalizeBarcode(leido);
    const p = catalogo.productos.find((x) => x.codigoBarras === codigo || x.sku === codigo);
    if (p) {
      setAbiertoId(p.id);
      return;
    }
    avisar.info(`Ningún producto con el código ${codigo}`, {
      detalle: puedeModificar ? "Si es nuevo, dalo de alta con ese código." : "Pide a administración que lo dé de alta.",
      ...(puedeModificar && barcodeProblem(codigo) === null ? { accion: { texto: "Darlo de alta", alPulsar: () => setCreando({ codigo }) } } : {}),
    });
  }, creando === null && abierto === null && !conCategorias && !enLote);

  return (
    <Container ancho="panel" className="py-8">
      <EncabezadoDePagina
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Inventario", href: "/panel/inventario" }, { texto: "Productos" }]}
        titulo="Productos"
        descripcion="Lo que hay, lo que hay que reponer y lo que deja cada cosa que se vende. El precio se programa con su día: cambiarlo no altera lo ya vendido."
        acciones={
          <div className="flex flex-wrap gap-2">
            {actorPuedeRecibir && pendientes > 0 && (
              <Link
                href={"/panel/inventario/entradas?inicial=1" as Route}
                className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13.5px] font-semibold text-ink no-underline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <ClipboardList size={TAMANO_ICONO.admin} aria-hidden="true" />
                Contar {pendientes === 1 ? "1 pendiente" : `${pendientes} pendientes`}
              </Link>
            )}
            {actorPuedeRecibir && (
              <Link
                href={"/panel/inventario/entradas" as Route}
                className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13.5px] font-semibold text-ink no-underline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <PackagePlus size={15} aria-hidden="true" />
                Cargar entrada
              </Link>
            )}
            {puedeModificar && (
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setEnLote(true)}>
                <ListPlus size={TAMANO_ICONO.admin} aria-hidden="true" />
                Alta en lote
              </Button>
            )}
            {(retirados > 0 || verRetirados) && (
              <Button type="button" variant={verRetirados ? "primary" : "neutral"} surface="admin" className="gap-1.5" aria-pressed={verRetirados} onClick={() => setVerRetirados((v) => !v)}>
                <ArchiveX size={TAMANO_ICONO.admin} aria-hidden="true" />
                {verRetirados ? "Volver al catálogo" : `Retirados (${retirados})`}
              </Button>
            )}
            {puedeModificar && (
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setConCategorias(true)}>
                <Tags size={15} aria-hidden="true" />
                Categorías
              </Button>
            )}
            {puedeModificar && (
              <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setCreando({ codigo: "" })}>
                <Plus size={15} aria-hidden="true" />
                Nuevo producto
              </Button>
            )}
          </div>
        }
      />

      {catalogo.productos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
          <PackageOpen size={28} className="text-ink-3" aria-hidden="true" />
          <p className="font-display text-[16px] font-bold text-ink">Todavía no hay productos</p>
          <p className="max-w-md text-[13px] text-ink-2">
            Sin productos, la caja no vende en el mostrador. Carga el catálogo de una vez en una hoja, sin cantidades (el stock se
            cuenta otro día), crea uno con su precio, o cárgalo directamente en una entrada de mercancía con su ficha corta.
          </p>
          {puedeModificar && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setEnLote(true)}>
                <ListPlus size={TAMANO_ICONO.admin} aria-hidden="true" />
                Alta en lote
              </Button>
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setCreando({ codigo: "" })}>
                <Plus size={15} aria-hidden="true" />
                Nuevo producto
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {elegidos.size > 0 &&
            (() => {
              const barra = (
                <BarraDeLote
                  cuantos={elegidos.size}
                  puede={{ CATEGORIA: puedeModificar, APARTAR: puedeModificar, MINIMO: actorPuedeRecibir, EN_CARTA: puedePrecio, PRECIO: puedePrecio, AREA: puedeModificar }}
                  onAccion={setCambioEnLote}
                  onLimpiar={() => setElegidos(new Set())}
                />
              );
              return enTelefono ? (
                createPortal(<div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base px-3 pt-2 pb-[calc(0.5rem+var(--seguro-abajo))]">{barra}</div>, document.body)
              ) : (
                // Fija arriba mientras se baja por la lista: con muchos elegidos, la barra sigue a mano.
                <div className="sticky top-0 z-30 mb-3 bg-base py-1">{barra}</div>
              );
            })()}
          {verRetirados && (
            <p className="mb-3 flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-detalle text-ink-2">
              <ArchiveX size={TAMANO_ICONO.texto} className="shrink-0 text-ink-3" aria-hidden="true" />
              Retirados del catálogo: no salen en la caja, la carta, la tablet ni las listas de carga. Su historia queda. Abre uno para devolverlo.
            </p>
          )}
          <InventarioVista
            catalogo={aLaVista}
            periodos={periodos}
            ahora={ahora}
            tasa={tasa}
            onAbrir={setAbiertoId}
            retirados={verRetirados}
            seleccion={puedeLote && !verRetirados ? { elegidos, onCambiar: setElegidos } : undefined}
          />
        </>
      )}

      {cambioEnLote && ahora !== null && (
        <EditarEnLote
          cambio={cambioEnLote}
          ids={[...elegidos]}
          catalogo={catalogo}
          periodos={periodos}
          ahora={ahora}
          onCerrar={() => setCambioEnLote(null)}
          onHecho={(c) => {
            setCatalogo(c);
            setCambioEnLote(null);
            setElegidos(new Set());
          }}
        />
      )}
      <CategoriasSheet abierto={conCategorias} onCerrar={() => setConCategorias(false)} catalogo={catalogo} onCambio={setCatalogo} />
      {enLote && (
        <AltaEnLote
          catalogo={catalogo}
          categorias={categorias}
          onCerrar={() => setEnLote(false)}
          onCreados={(c) => {
            setCatalogo(c);
            setEnLote(false);
          }}
        />
      )}
      <ProductoNuevo
        abierto={creando !== null || duplicando?.modo === "UNO"}
        codigoInicial={creando?.codigo ?? ""}
        plantilla={duplicando?.modo === "UNO" ? duplicando.plantilla : null}
        onCerrar={() => {
          setCreando(null);
          setDuplicando(null);
        }}
        categorias={categorias}
        enviando={enviando}
        cambiar={cambiar}
      />
      {duplicando?.modo === "SABORES" && (
        <DuplicarConSabores
          plantilla={duplicando.plantilla}
          catalogo={catalogo}
          onCerrar={() => setDuplicando(null)}
          onCreados={(c) => {
            setCatalogo(c);
            setDuplicando(null);
          }}
        />
      )}
      <FichaProducto
        producto={abierto}
        onCerrar={() => setAbiertoId(null)}
        catalogo={catalogo}
        categorias={categorias}
        ahora={ahora}
        puedeModificar={puedeModificar}
        puedePrecio={puedePrecio}
        enviando={enviando}
        cambiar={cambiar}
        adoptar={setCatalogo}
        onRetiro={
          puedeRetirar
            ? (modo) => {
                if (!abierto) return;
                setRetiro({ producto: abierto, modo });
                setAbiertoId(null);
              }
            : null
        }
        onDuplicar={(modo) => {
          if (!abierto) return;
          const rige = ahora === null ? null : (periodAt(periodos, abierto.id, ahora)?.amountMinor ?? null);
          setAbiertoId(null);
          setDuplicando({ plantilla: plantillaDe(abierto, rige), modo });
        }}
      />
      {retiro && (
        <RetirarProducto
          producto={retiro.producto}
          modo={retiro.modo}
          onCerrar={() => setRetiro(null)}
          onHecho={() => {
            setRetiro(null);
            // El catálogo como quedó: la página se vuelve a leer en el servidor.
            router.refresh();
          }}
        />
      )}
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
  tipo,
  setTipo,
  codigo,
  setCodigo,
  presentacion,
  setPresentacion,
  area,
  setArea,
  categorias,
  errores,
  deshabilitado,
  tipoBloqueado,
}: {
  prefijo: string;
  nombre: string;
  setNombre: (v: string) => void;
  categoria: string;
  setCategoria: (v: string) => void;
  taxCode: TaxCodeDelCatalogo;
  setTaxCode: (v: TaxCodeDelCatalogo) => void;
  tipo: TipoProducto;
  setTipo: (v: TipoProducto) => void;
  codigo: string;
  setCodigo: (v: string) => void;
  presentacion: string;
  setPresentacion: (v: string) => void;
  /** En qué comanda sale (B6-10); `null`, la de su tipo. */
  area: AreaDeProductoDto | null;
  setArea: (v: AreaDeProductoDto | null) => void;
  categorias: readonly string[];
  errores: Record<string, string>;
  deshabilitado?: boolean;
  /** Por qué no se puede cambiar el tipo (un producto con stock), o `null`. */
  tipoBloqueado?: string | null;
}) {
  // El código leído o tecleado, con su problema a la vista antes de guardar (lo comprueba el servidor igual).
  const problemaCodigo = codigo.trim() === "" ? null : barcodeProblem(normalizeBarcode(codigo));
  return (
    <>
      <fieldset className="flex flex-col gap-1.5" disabled={deshabilitado}>
        <legend className={cn(ETIQUETA, "mb-1.5")}>Tipo</legend>
        <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1.5">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tipo === t.id}
              disabled={deshabilitado || (Boolean(tipoBloqueado) && tipo !== t.id)}
              onClick={() => setTipo(t.id)}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[var(--radius-control)] border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                tipo === t.id ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:text-ink",
              )}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <t.Icono size={14} aria-hidden="true" />
                {t.nombre}
              </span>
              <span className="text-[11px] leading-tight text-ink-3">{t.detalle}</span>
            </button>
          ))}
        </div>
        {tipoBloqueado && <p className="text-[12px] text-ink-3">{tipoBloqueado}</p>}
        {errores["tipo"] && <p className="text-[12px] font-medium text-state-crit">{errores["tipo"]}</p>}
      </fieldset>
      <Input surface="admin" label="Nombre" placeholder="Agua mineral" autoComplete="off" value={nombre} error={errores["nombre"]} disabled={deshabilitado} onChange={(e) => setNombre(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input
          surface="admin"
          label="Presentación"
          placeholder="Botella 600 ml"
          autoComplete="off"
          value={presentacion}
          error={errores["presentacion"]}
          disabled={deshabilitado}
          onChange={(e) => setPresentacion(e.target.value)}
        />
        {tipo === "PRODUCTO" ? (
          <Input
            surface="admin"
            label="Código de barras"
            placeholder="Pásalo por el lector"
            autoComplete="off"
            className="tnum font-mono"
            leading={<ScanLine size={15} aria-hidden="true" />}
            value={codigo}
            error={errores["codigoBarras"] ?? (problemaCodigo === "DIGITO_DE_CONTROL" ? "El dígito de control no cuadra: vuelve a leerlo" : problemaCodigo === "FORMATO" ? "De 4 a 32 dígitos, letras o guiones" : undefined)}
            disabled={deshabilitado}
            onChange={(e) => setCodigo(e.target.value)}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className={ETIQUETA}>Código de barras</span>
            <span className="flex min-h-9 items-center text-[12.5px] text-ink-3">Solo lo lleva lo que se cuenta</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* B9-11: la categoría, de una lista que se despliega; «Escribir una nueva…» para la que no está. */}
        <div className="flex flex-col gap-1.5">
          <span className={ETIQUETA}>Categoría</span>
          {deshabilitado ? (
            <span className="flex min-h-9 items-center text-[14px] text-ink">{categoria}</span>
          ) : (
            <CampoCategoria etiqueta="Categoría" className={cn(CAMPO, errores["categoria"] ? "border-state-crit" : "")} valor={categoria} categorias={categorias} onCambio={setCategoria} />
          )}
          {errores["categoria"] ? <p className="text-nota text-state-crit">{errores["categoria"]}</p> : <p className="text-nota text-ink-3">Es una pestaña de la caja</p>}
        </div>
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
      <fieldset className="flex flex-col gap-1.5" disabled={deshabilitado}>
        <legend className={cn(ETIQUETA, "mb-1.5")}>Dónde se prepara</legend>
        <ElegirArea tipo={tipo} valor={area} onCambio={setArea} deshabilitado={deshabilitado} />
        {errores["area"] ? <p className="text-nota text-state-crit">{errores["area"]}</p> : <p className="text-nota text-ink-3">El mesero lo pide y sale en la impresora de esa área</p>}
      </fieldset>
    </>
  );
}

/** «Nuevo producto»: nace a la venta, con su precio rigiendo desde que se guarda. */
function ProductoNuevo({
  abierto,
  codigoInicial,
  plantilla = null,
  onCerrar,
  categorias,
  enviando,
  cambiar,
}: {
  abierto: boolean;
  /** El código leído en la lista, si se abrió desde él. */
  codigoInicial: string;
  /** B9-8: duplicar un producto abre esta hoja con su ficha copiada, para cambiarle el nombre (y el código). */
  plantilla?: Plantilla | null;
  onCerrar: () => void;
  categorias: readonly string[];
  enviando: string | null;
  cambiar: Aplicar;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [taxCode, setTaxCode] = useState<TaxCodeDelCatalogo>("GENERAL");
  const [tipo, setTipo] = useState<TipoProducto>("PRODUCTO");
  const [codigo, setCodigo] = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [area, setArea] = useState<AreaDeProductoDto | null>(null);
  const [precio, setPrecio] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  useEffect(() => {
    if (abierto) setCodigo(codigoInicial);
  }, [abierto, codigoInicial]);
  useEffect(() => {
    if (!abierto || !plantilla) return;
    setNombre(plantilla.nombre);
    setCategoria(plantilla.categoria);
    setTaxCode(plantilla.taxCode);
    setTipo(plantilla.tipo);
    setPresentacion(plantilla.presentacion ?? "");
    setArea(plantilla.area);
    setPrecio(plantilla.precioMinor === null ? "" : toMajor(money(BigInt(plantilla.precioMinor), "USD")).replace(".", ","));
    setCodigo("");
  }, [abierto, plantilla]);
  // Con la hoja abierta, lo que se lee es el código de este producto.
  useLectorDeCodigos((leido) => {
    setTipo("PRODUCTO");
    setCodigo(normalizeBarcode(leido));
  }, abierto);

  const cerrar = () => {
    setNombre("");
    setCategoria("");
    setTaxCode("GENERAL");
    setTipo("PRODUCTO");
    setCodigo("");
    setPresentacion("");
    setArea(null);
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
    const r = await cambiar(
      {
        kind: "CREAR",
        producto: {
          nombre,
          categoria,
          taxCode,
          tipo,
          precioMinor,
          ...(tipo === "PRODUCTO" && codigo.trim() ? { codigoBarras: normalizeBarcode(codigo) } : {}),
          ...(presentacion.trim() ? { presentacion: presentacion.trim() } : {}),
          ...(area ? { area } : {}),
          // La copia (B9-8) lleva también el mínimo y la carta del original.
          ...(plantilla ? { enCarta: plantilla.enCarta } : {}),
          ...(plantilla && tipo === "PRODUCTO" && plantilla.minimo !== null ? { minimo: plantilla.minimo } : {}),
        },
      },
      "crear",
    );
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${nombre.trim()} a la venta a ${usd(precioDe(precioMinor))}`);
      cerrar();
      return;
    }
    const e = porCampo(r, ["nombre", "categoria", "taxCode", "precioMinor", "tipo", "codigoBarras", "presentacion", "area"]);
    setErrores(e.errores);
    setGeneral(e.general);
  };

  const ocupado = enviando === "crear";
  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo={plantilla ? `Duplicar «${plantilla.nombre}»` : "Nuevo producto"}
      descripcion={
        plantilla
          ? "Una copia con su ficha: cámbiale el nombre y, si lleva, el código. Nace con su SKU, sin inventario inicial."
          : "Nace a la venta, con su precio rigiendo desde que lo guardes. El SKU lo pone el sistema."
      }
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={cerrar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" onClick={() => void crear()} disabled={ocupado || !nombre.trim() || !categoria.trim() || !precio.trim()}>
            {ocupado ? "Guardando…" : plantilla ? "Crear la copia" : "Crear producto"}
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
          tipo={tipo}
          setTipo={setTipo}
          codigo={codigo}
          setCodigo={setCodigo}
          presentacion={presentacion}
          setPresentacion={setPresentacion}
          area={area}
          setArea={setArea}
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

/**
 * La ficha de un producto: sus datos arriba, su precio con su calendario debajo, y apartarlo, retirarlo o volver a
 * venderlo. La abren Productos y la carga por lista (una entrada, el inventario inicial), sin perder la lista (B9-11).
 */
export function FichaProducto({
  producto,
  onCerrar,
  catalogo,
  categorias,
  ahora,
  puedeModificar,
  puedePrecio,
  enviando,
  cambiar,
  adoptar,
  onDuplicar,
  onRetiro,
}: {
  producto: ProductoDto | null;
  onCerrar: () => void;
  catalogo: CatalogoDto;
  categorias: readonly string[];
  ahora: number | null;
  puedeModificar: boolean;
  /** B9-8: duplicarlo, solo o con otros sabores. Sin él (abierta desde una entrada), no se ofrece. */
  onDuplicar?: ((modo: "UNO" | "SABORES") => void) | undefined;
  /** Programar su precio (`catalogo.modificar`): no basta con poder darlo de alta. */
  puedePrecio: boolean;
  enviando: string | null;
  cambiar: Aplicar;
  /** El catálogo como quedó tras fijar el mínimo (B9-5). */
  adoptar: (c: CatalogoDto) => void;
  /** B9-11: retirarlo del catálogo o devolverlo (administración, con su PIN). `null` si no se puede. */
  onRetiro?: ((modo: "RETIRAR" | "DEVOLVER") => void) | null;
}) {
  const { ajustes } = useSucursal();
  const zona = catalogo.zonaHoraria;
  const hoy = ahora === null ? null : calendarDay(new Date(ahora).toISOString(), zona);
  const cuando = (iso: string) => `${diaEnPalabras(Date.parse(iso), zona)}, ${formatClock(Date.parse(iso), ajustes.formatoHora, ajustes.zonaHoraria)}`;

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [taxCode, setTaxCode] = useState<TaxCodeDelCatalogo>("GENERAL");
  const [tipo, setTipo] = useState<TipoProducto>("PRODUCTO");
  const [codigo, setCodigo] = useState("");
  const [presentacion, setPresentacion] = useState("");
  const [area, setArea] = useState<AreaDeProductoDto | null>(null);
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
    setTipo(producto.tipo);
    setCodigo(producto.codigoBarras ?? "");
    setPresentacion(producto.presentacion ?? "");
    setArea(producto.areaDeSuTipo ? null : producto.area);
    setPrecio("");
    setDia(null);
    setErrores({});
    setGeneral(null);
  }, [id]);

  // Con la ficha abierta, lo que se lee es su código (para ponérselo o corregirlo).
  useLectorDeCodigos((leido) => {
    if (!puedeModificar) return;
    setCodigo(normalizeBarcode(leido));
    avisar.info("Código leído: guarda los datos para quedártelo");
  }, producto !== null);

  if (!producto) return <Sheet abierto={false} onCerrar={onCerrar} titulo="Producto">{null}</Sheet>;
  const diaElegido = dia ?? hoy;

  const guardar = async () => {
    const r = await cambiar(
      {
        kind: "EDITAR",
        productId: producto.id,
        nombre,
        categoria,
        taxCode,
        tipo,
        codigoBarras: tipo === "PRODUCTO" && codigo.trim() ? normalizeBarcode(codigo) : null,
        presentacion: presentacion.trim() ? presentacion.trim() : null,
        // Sin elegir, la de su tipo (el servidor la guarda como «sin elegir»).
        area: area ?? areaDe(tipo, null),
      },
      "editar",
    );
    if (!r) return;
    if (r.ok) {
      avisar.ok(`${nombre.trim()}: guardado`);
      setErrores({});
      setGeneral(null);
      return;
    }
    const e = porCampo(r, ["nombre", "categoria", "taxCode", "tipo", "codigoBarras", "presentacion", "area"]);
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
      descripcion={
        producto.retirado
          ? `${producto.sku} · ${producto.categoria} · retirado del catálogo: no sale en ninguna lista`
          : `${producto.sku} · ${producto.activo ? `${producto.categoria} · a la venta` : `${producto.categoria} · apartado: la caja no lo ofrece`} · ${existenciaEnPalabras(producto)}`
      }
      pie={
        producto.retirado ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
              Cerrar
            </Button>
            {onRetiro && (
              <Button type="button" variant="primary" surface="admin" className="flex-1 gap-1.5" onClick={() => onRetiro("DEVOLVER")}>
                <ArchiveRestore size={TAMANO_ICONO.texto} aria-hidden="true" />
                Devolver al catálogo
              </Button>
            )}
          </div>
        ) : puedeModificar ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
              Cerrar
            </Button>
            {/* B9-11: sacarlo del catálogo (también lo creado en la carga inicial). Nada se borra. */}
            {onRetiro && (
              <Button type="button" variant="ghost" surface="admin" className="gap-1.5 text-state-crit" onClick={() => onRetiro("RETIRAR")}>
                <ArchiveX size={TAMANO_ICONO.texto} aria-hidden="true" />
                Retirar
              </Button>
            )}
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
        {puedeModificar && onDuplicar && (
          // B9-8: otro igual con otro nombre, o varios de una vez con otros sabores.
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => onDuplicar("UNO")}>
              <Copy size={TAMANO_ICONO.texto} aria-hidden="true" />
              Duplicar
            </Button>
            <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => onDuplicar("SABORES")}>
              <CopyPlus size={TAMANO_ICONO.texto} aria-hidden="true" />
              Con otros sabores
            </Button>
          </div>
        )}
        <section id="ficha-datos" aria-label="Datos del producto" className="flex flex-col gap-3">
          <CamposDelProducto
            prefijo="ficha"
            nombre={nombre}
            setNombre={setNombre}
            categoria={categoria}
            setCategoria={setCategoria}
            taxCode={taxCode}
            setTaxCode={setTaxCode}
            tipo={tipo}
            setTipo={setTipo}
            codigo={codigo}
            setCodigo={setCodigo}
            presentacion={presentacion}
            setPresentacion={setPresentacion}
            area={area}
            setArea={setArea}
            tipoBloqueado={producto.tipo === "PRODUCTO" && (producto.existencia ?? 0) !== 0 ? `Tiene ${producto.existencia} en stock: sácalas o cuéntalas antes de cambiar su tipo.` : null}
            categorias={categorias}
            errores={errores}
            deshabilitado={!puedeModificar}
          />
          {puedeModificar && (
            <Button type="button" variant="neutral" surface="admin" disabled={enviando === "editar"} onClick={() => void guardar()}>
              {enviando === "editar" ? "Guardando…" : "Guardar datos"}
            </Button>
          )}
          <p className="text-[12px] text-ink-3">El SKU ({producto.sku}) no cambia. Lo ya vendido conserva el nombre y el IVA con que se vendió.</p>
        </section>
        {producto.controlaStock && <Existencia producto={producto} ahora={ahora} zona={zona} adoptar={adoptar} />}
        <section aria-label="Precio" className="flex flex-col gap-3 border-t border-line pt-4">
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
          {puedePrecio && (
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

/** La existencia en palabras (B9-2): cuántas quedan en esta sucursal, que no se contó todavía (B9-7) o que no lleva. */
function existenciaEnPalabras(p: Pick<ProductoDto, "existencia" | "minimo" | "inventarioInicialEl">): string {
  const estado = estadoDelStock(p);
  if (p.existencia === null || estado === null) return "sin existencia";
  if (estado === "SIN_INICIAL") return "sin inventario inicial: no se vende hasta contarlo";
  if (estado === "AGOTADO") return "agotado: no se vende";
  const quedan = p.existencia === 1 ? "queda 1" : `quedan ${p.existencia}`;
  return estado === "BAJO_MINIMO" ? `${quedan}, bajo su mínimo (${p.minimo})` : quedan;
}

const PORCENTAJE = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Lo que queda, lo que cuesta y lo que deja (B9-2, B9-3): la existencia de la sucursal, el costo
 * promedio ponderado y el margen sobre el precio de hoy. Desde aquí se carga su entrada.
 */
function Existencia({ producto, ahora, zona, adoptar }: { producto: ProductoDto; ahora: number | null; zona: string; adoptar: (c: CatalogoDto) => void }) {
  const actor = useActorEnSesion();
  const puedeRecibir = actor !== null && can(actor, "inventario.entrada") !== "DENEGADO";
  // El mínimo se teclea como texto: vacío = sin mínimo (solo avisa al agotarse).
  const [minimo, setMinimo] = useState(producto.minimo === null ? "" : String(producto.minimo));
  const [errorMinimo, setErrorMinimo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setMinimo(producto.minimo === null ? "" : String(producto.minimo)), [producto.id, producto.minimo]);
  const tecleado = minimo.trim() === "" ? null : Number(minimo);
  const cambioMinimo = tecleado !== producto.minimo;
  const guardarMinimo = async () => {
    if (tecleado !== null && (!Number.isInteger(tecleado) || tecleado < 0)) {
      setErrorMinimo("Unidades enteras, desde 0");
      return;
    }
    setGuardando(true);
    const r = await fijarMinimo({ productId: producto.id, minimo: tecleado }).catch(() => null);
    setGuardando(false);
    if (!r) return setErrorMinimo("Sin conexión con el servidor: no se guardó.");
    if (!r.ok) return setErrorMinimo(r.problemas?.[0]?.message ?? r.mensaje);
    setErrorMinimo(null);
    adoptar(r.valor);
    avisar.ok(tecleado === null ? `${producto.nombre}: sin mínimo` : `${producto.nombre}: mínimo ${tecleado}`, { detalle: "Avisa al llegar a él, en Inicio y en el inventario." });
  };
  const tramo = ahora === null ? undefined : periodAt(periodosDe([producto]), producto.id, ahora);
  const costo = producto.costoPromedio ? BigInt(producto.costoPromedio.minor) : null;
  const margen = tramo ? marginBasisPoints(tramo.amountMinor, costo) : null;
  const estado = estadoDelStock(producto) ?? "AGOTADO";
  const sinInicial = estado === "SIN_INICIAL";
  const agotado = producto.existencia === 0;
  return (
    <section aria-label="Existencia" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[14px] font-bold text-ink">Existencia</h3>
        {puedeRecibir && sinInicial && (
          <Link
            href={`/panel/inventario/entradas?inicial=1&producto=${producto.id}` as Route}
            className="flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 text-[13px] font-semibold text-ink no-underline hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <ClipboardList size={TAMANO_ICONO.texto} aria-hidden="true" />
            Contarlo
          </Link>
        )}
        {puedeRecibir && !sinInicial && (
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
            {sinInicial ? (
              <span className="text-detalle font-normal text-ink-3">Sin contar</span>
            ) : (
              <>
                {agotado && <PackageX size={15} aria-hidden="true" />}
                {agotado ? "Agotado" : producto.existencia}
              </>
            )}
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
      {/* B9-7: cuándo arrancó su existencia, o que todavía no se contó y por eso no se vende. */}
      {sinInicial ? (
        <p className="flex items-start gap-1.5 rounded-[var(--radius-control)] border border-line bg-state-idle-bg px-3 py-2 text-detalle text-ink-2">
          <ClipboardList size={TAMANO_ICONO.texto} className="mt-0.5 shrink-0" aria-hidden="true" />
          Sin inventario inicial: la caja y la carta no lo venden hasta que se cuente (en el inventario inicial o en un conteo).
        </p>
      ) : (
        producto.inventarioInicialEl && (
          <p className="tnum text-nota text-ink-3">Inventario inicial: {diaEnPalabras(Date.parse(producto.inventarioInicialEl), zona)}</p>
        )
      )}
      {margen !== null && margen < 0 && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-state-crit">
          <AlertTriangle size={13} aria-hidden="true" />
          Se vende por debajo de lo que cuesta.
        </p>
      )}
      {/* El punto de reorden (B9-5): con la existencia en él o por debajo, avisa. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-36">
          <Input
            label="Stock mínimo"
            surface="admin"
            inputMode="numeric"
            className="tnum"
            placeholder="Sin mínimo"
            value={minimo}
            error={errorMinimo ?? undefined}
            disabled={!puedeRecibir || guardando}
            onChange={(e) => {
              setMinimo(e.target.value.replace(/\D/g, ""));
              setErrorMinimo(null);
            }}
          />
        </div>
        {puedeRecibir && cambioMinimo && (
          <Button type="button" variant="neutral" surface="admin" disabled={guardando} onClick={() => void guardarMinimo()}>
            {guardando ? "Guardando…" : "Guardar mínimo"}
          </Button>
        )}
        <span className="mb-2 ml-auto">
          <EstadoStock estado={estado} />
        </span>
      </div>
    </section>
  );
}
