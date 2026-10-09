"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, ClipboardPaste, ListChecks, PackagePlus, Pencil, Plus, ScanLine, Sparkles, TriangleAlert, Truck, X } from "lucide-react";
import type { CatalogoDto, CostoPor, EntradaDto, EntradasDto, Problema, ProductoDto, TaxCodeDelCatalogo, TipoEntrada } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { averageUnitCostMinor, barcodeProblem, entryLineTotals, nameKey, normalizeBarcode, type EntryCostBasis } from "@l2/domain-inventory";
import { money, sum, toMajor, type Money } from "@l2/domain-money";
import { Button, Container, Dialog, PageHeader, Sheet, avisar, cn, formatMoneyVE, useLectorDeCodigos } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { categoriasDelCatalogo } from "./catalogo.ts";
import { estadoDe } from "./EstadoStock.tsx";
import { CampoCategoria } from "./CampoCategoria.tsx";
import { FichaProducto, useAplicarProducto } from "./ProductosScreen.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { registrarEntrada } from "./entradas.acciones";

/**
 * Panel → Inventario → Entradas de mercancía (B9-3, F8-06; en tabla desde T-10, M-24). Lo que llega,
 * por compra o reposición, o el inventario inicial del local. Se llena como una hoja de cálculo: una
 * fila por producto (buscado por nombre, SKU o código, o nuevo con su ficha corta), con la cantidad en
 * unidades sueltas o en bultos de N y el costo como venga en la factura (por unidad, por bulto o el
 * total de la línea); propone el último bulto y el último costo de cada producto. Una lista copiada de
 * Excel o Google Sheets se pega, se revisa y entra en la tabla. Sube la existencia y da el costo
 * promedio; una entrada no se edita ni se borra (un error se corrige con otro movimiento, B9-4). Quién
 * puede y si cada línea vale lo decide el servidor.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "min-h-9 w-full min-w-0 rounded-[var(--radius-control)] border bg-surface px-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

const usd = (m: Money) => formatMoneyVE(toMajor(m), "USD");
const minor = (m: { minor: string }) => money(BigInt(m.minor), "USD");
/** Un costo para ponerlo en una casilla, como lo teclearía una persona: «12,00». */
const costoTecleable = (m: { minor: string } | null) => (m ? toMajor(minor(m)).replace(".", ",") : "");
const NOMBRE_TIPO: Readonly<Record<TipoEntrada, string>> = { COMPRA: "Compra", REPOSICION: "Reposición", INICIAL: "Inventario inicial" };
const BASE: Readonly<Record<CostoPor, EntryCostBasis>> = { UNIDAD: "UNIT", BULTO: "PACK", TOTAL: "LINE" };
const MAX_LINEAS = 300;

/** La ficha corta de un producto que llega por primera vez (B9-6), tal como se teclea. */
type Nuevo = { categoria: string; presentacion: string; codigo: string; precio: string; taxCode: TaxCodeDelCatalogo };

/**
 * Una fila de la tabla: lo tecleado, sin convertir hasta que se entiende. `texto` es lo escrito en la
 * casilla del producto: con `productId`, el nombre del elegido; con `nuevo`, el nombre del alta.
 */
type Borrador = {
  uid: string;
  texto: string;
  productId: string;
  nuevo: Nuevo | null;
  cantidad: string;
  en: "UNIDADES" | "BULTOS";
  porBulto: string;
  costo: string;
  costoPor: CostoPor;
};

const filaVacia = (): Borrador => ({ uid: globalThis.crypto.randomUUID(), texto: "", productId: "", nuevo: null, cantidad: "", en: "UNIDADES", porBulto: "", costo: "", costoPor: "UNIDAD" });
const fichaVacia = (codigo = ""): Nuevo => ({ categoria: "", presentacion: "", codigo, precio: "", taxCode: "GENERAL" });

/**
 * Con un producto elegido, la fila propone cómo llegó la última vez: su bulto y lo que costó. En el
 * inventario inicial (`enUnidades`) se cuenta lo que hay en el estante: unidades sueltas, al costo de una
 * (el promedio de hoy o, sin existencia, el del último bulto entre sus unidades).
 */
function conProducto(b: Borrador, p: ProductoDto, enUnidades = false): Borrador {
  if (enUnidades) {
    const delBulto =
      p.ultimoCostoBulto && p.ultimoBulto ? { minor: String(averageUnitCostMinor({ quantity: p.ultimoBulto, valueMinor: BigInt(p.ultimoCostoBulto.minor) }) ?? 0n) } : null;
    return { ...b, texto: p.nombre, productId: p.id, nuevo: null, en: "UNIDADES", porBulto: "", costoPor: "UNIDAD", costo: b.costo || costoTecleable(p.costoPromedio ?? delBulto) };
  }
  const bulto = p.ultimoBulto ?? 1;
  const enBultos = bulto > 1;
  return {
    ...b,
    texto: p.nombre,
    productId: p.id,
    nuevo: null,
    en: enBultos ? "BULTOS" : "UNIDADES",
    porBulto: enBultos ? String(bulto) : "",
    // El último costo es de un bulto: en unidades sueltas, de una unidad.
    costoPor: enBultos ? "BULTO" : "UNIDAD",
    costo: b.costo || costoTecleable(p.ultimoCostoBulto),
  };
}

/** Un entero tecleado («24», « 24 »), o `null`. */
function entero(texto: string): number | null {
  const t = texto.trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}

/** Un importe tecleado o pegado («$ 12,50», «12.50», «1.234,50»), o `null` si no se entiende o está vacío. */
function importe(texto: string): Money | null {
  const limpio = texto.replace(/US\$|\$|USD/gi, "").trim();
  return limpio === "" ? null : importeTecleado(limpio, "USD");
}

/** La ficha corta, si se entiende; `null` si falta algo. El servidor la revalida con el contrato. */
function altaDe(nombre: string, n: Nuevo) {
  const precio = importe(n.precio);
  const codigo = normalizeBarcode(n.codigo);
  if (nombre.trim().length < 2 || n.categoria.trim().length < 2 || !precio || precio.amount <= 0n) return null;
  if (codigo !== "" && barcodeProblem(codigo) !== null) return null;
  return {
    nombre: nombre.trim(),
    categoria: n.categoria.trim(),
    taxCode: n.taxCode,
    precioMinor: String(precio.amount),
    ...(codigo ? { codigoBarras: codigo } : {}),
    ...(n.presentacion.trim() ? { presentacion: n.presentacion.trim() } : {}),
  };
}

/** Lo que dice una fila si se entiende; `null` si falta algo o está mal escrito. */
function lineaDe(b: Borrador) {
  const cantidad = entero(b.cantidad);
  const porBulto = b.en === "BULTOS" ? entero(b.porBulto) : 1;
  const costo = importe(b.costo);
  if (!cantidad || !porBulto || !costo || costo.amount < 0n) return null;
  // En unidades sueltas el bulto es la unidad: «por bulto» no existe.
  const por: CostoPor = b.en === "UNIDADES" && b.costoPor === "BULTO" ? "UNIDAD" : b.costoPor;
  const t = entryLineTotals({ packs: cantidad, packSize: porBulto, cost: { per: BASE[por], minor: costo.amount } });
  const cantidades = { bultos: cantidad, unidadesPorBulto: porBulto, costo: { por, minor: String(costo.amount) } };
  if (b.nuevo) {
    const alta = altaDe(b.texto, b.nuevo);
    return alta ? { linea: { nuevo: alta, ...cantidades }, ...t } : null;
  }
  return b.productId ? { linea: { productId: b.productId, ...cantidades }, ...t } : null;
}

/**
 * ¿La fila no dice nada? Se ignora al registrar. En el inventario inicial, tampoco un producto sin cantidad:
 * sigue sin inventario inicial (B9-7).
 */
const ignorada = (b: Borrador, inicial: boolean) =>
  (!b.productId && !b.nuevo && b.texto.trim() === "" && b.cantidad.trim() === "" && b.costo.trim() === "") ||
  (inicial && !!b.productId && b.cantidad.trim() === "");

/** En el inventario inicial, un producto contado en cero (B9-7): no entra nada, pero queda contado (agotado). */
const enCeroDe = (b: Borrador, inicial: boolean) => inicial && !!b.productId && !b.nuevo && b.cantidad.trim() !== "" && entero(b.cantidad) === 0;

/** «jue 8 oct»: el día de un instante, como lo dice el reloj del local. */
type DiaDe = (instante: number) => string;

export function EntradasScreen({ catalogo, entradas: inicial }: { catalogo: CatalogoDto; entradas: EntradasDto | null }) {
  const actor = useActorEnSesion();
  const puedeRecibir = actor !== null && can(actor, "inventario.entrada") !== "DENEGADO";
  // Dar de alta en la entrada es del catálogo (B9-6): lo mismo que «Nuevo producto».
  const puedeCrear = actor !== null && can(actor, "inventario.catalogo") !== "DENEGADO";
  const { ajustes } = useSucursal();
  const reloj = useReloj();
  const params = useSearchParams();

  const [entradas, setEntradas] = useState(inicial?.entradas ?? null);
  const huella = JSON.stringify(inicial);
  useEffect(() => setEntradas(inicial?.entradas ?? null), [huella]);

  // Lo que se cuenta: solo lo que lleva existencia. Lo apartado también entra (se puede volver a vender).
  const contables = useMemo(
    () => catalogo.productos.filter((p) => p.controlaStock).sort((a, b) => a.categoria.localeCompare(b.categoria, "es") || a.nombre.localeCompare(b.nombre, "es")),
    [catalogo],
  );
  const categorias = useMemo(() => categoriasDelCatalogo(catalogo), [catalogo]);

  /** `null` = cerrada; si no, con qué tipo se abre. */
  const [abierta, setAbierta] = useState<TipoEntrada | null>(null);
  // «Cargar entrada» desde la ficha de un producto llega con `?producto=`; la Puesta a punto, con `?inicial=1`; y
  // «Contarlo» desde la ficha de uno sin inventario inicial (B9-7), con los dos.
  const desdeProducto = params.get("producto");
  const productoInicial = desdeProducto && contables.some((p) => p.id === desdeProducto) ? desdeProducto : null;
  useEffect(() => {
    if (!puedeRecibir) return;
    if (params.get("inicial") === "1") setAbierta("INICIAL");
    else if (productoInicial) setAbierta("COMPRA");
  }, [productoInicial, puedeRecibir]);

  const sinMovimientos = entradas !== null && entradas.length === 0;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Inventario", href: "/panel/inventario" }, { texto: "Entradas de mercancía" }]}
        titulo="Entradas de mercancía"
        descripcion="Lo que llega, por compra o reposición, y el inventario inicial del local. Sube la existencia y da el costo promedio de cada producto; no se edita ni se borra."
        acciones={
          puedeRecibir &&
          (contables.length > 0 || puedeCrear) && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setAbierta("INICIAL")}>
                <ListChecks size={15} aria-hidden="true" />
                Inventario inicial
              </Button>
              <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setAbierta("COMPRA")}>
                <Plus size={15} aria-hidden="true" />
                Nueva entrada
              </Button>
            </div>
          )
        }
      />

      {entradas === null ? (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {puedeRecibir ? "No se pudieron leer las entradas. Recarga la página; si sigue así, avisa a administración." : "Las entradas de mercancía las carga administración o supervisión."}
        </p>
      ) : contables.length === 0 && !puedeCrear ? (
        <Vacio titulo="Ningún producto se cuenta todavía" detalle="Administración los da de alta en Productos, o directamente en una entrada, con el tipo «Producto»." />
      ) : sinMovimientos ? (
        <Vacio
          titulo="Todavía no llegó nada"
          detalle="Lo que se cuenta sale «Sin inventario inicial» en la caja y no se vende hasta que se cuenta. El inventario inicial trae los que faltan para escribir lo que hay de cada uno."
          accion={
            puedeRecibir && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setAbierta("INICIAL")}>
                  <ListChecks size={15} aria-hidden="true" />
                  Inventario inicial
                </Button>
                <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setAbierta("COMPRA")}>
                  <Plus size={15} aria-hidden="true" />
                  Nueva entrada
                </Button>
              </div>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entradas.map((e) => (
            <FilaEntrada key={e.id} entrada={e} cuando={`${reloj.diaConAnio(Date.parse(e.recibidaEn))} · ${reloj.hora(Date.parse(e.recibidaEn))}`} />
          ))}
        </ul>
      )}

      {abierta && (
        <NuevaEntrada
          tipoInicial={abierta}
          catalogo={catalogo}
          contables={contables}
          categorias={categorias}
          puedeCrear={puedeCrear}
          productoInicial={productoInicial}
          diaDe={(t) => reloj.dia(t)}
          onCerrar={() => setAbierta(null)}
          onRegistrada={(e) => {
            setEntradas((prev) => [e, ...(prev ?? []).filter((x) => x.id !== e.id)]);
            setAbierta(null);
          }}
        />
      )}
    </Container>
  );
}

function Vacio({ titulo, detalle, accion }: { titulo: string; detalle: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
      <Truck size={28} className="text-ink-3" aria-hidden="true" />
      <p className="font-display text-[16px] font-bold text-ink">{titulo}</p>
      <p className="max-w-md text-[13px] text-ink-2">{detalle}</p>
      {accion}
    </div>
  );
}

function FilaEntrada({ entrada: e, cuando }: { entrada: EntradaDto; cuando: string }) {
  const quien = e.proveedor ?? (e.tipo === "COMPRA" ? "Proveedor sin declarar" : e.tipo === "INICIAL" ? "Existencia de arranque" : "Del depósito");
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-2">{NOMBRE_TIPO[e.tipo]}</span>
        <span className="text-[14px] font-semibold text-ink">{quien}</span>
        {e.factura && <span className="tnum text-[12.5px] text-ink-3">Factura {e.factura}</span>}
        <span className="tnum ml-auto text-[15px] font-bold text-ink">{usd(minor(e.total))}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-2">
        {e.lineas.map((l, i) => (
          <span key={l.productId}>
            {i > 0 && <span className="text-ink-3"> · </span>}
            {l.nombre}{" "}
            <span className="tnum text-ink-3">{l.unidadesPorBulto === 1 ? `${l.unidades} u` : `${l.bultos} × ${l.unidadesPorBulto} = ${l.unidades} u`}</span>
          </span>
        ))}
        {e.enCero.length > 0 && (
          <span>
            {e.lineas.length > 0 && <span className="text-ink-3"> · </span>}
            <span className="text-ink-3">contados en cero: </span>
            {e.enCero.map((x) => x.nombre).join(", ")}
          </span>
        )}
      </p>
      <p className="tnum mt-0.5 text-[12px] text-ink-3">
        {cuando} · recibió {e.recibidaPor}
      </p>
    </li>
  );
}

function NuevaEntrada({
  tipoInicial,
  catalogo,
  contables,
  categorias,
  puedeCrear,
  productoInicial,
  diaDe,
  onCerrar,
  onRegistrada,
}: {
  tipoInicial: TipoEntrada;
  catalogo: CatalogoDto;
  contables: readonly ProductoDto[];
  categorias: readonly string[];
  puedeCrear: boolean;
  productoInicial: string | null;
  diaDe: DiaDe;
  onCerrar: () => void;
  onRegistrada: (e: EntradaDto) => void;
}) {
  const porId = useMemo(() => new Map(contables.map((p) => [p.id, p])), [contables]);
  /**
   * B9-11: la ficha de un producto de la lista, en una capa encima, sin perder lo escrito. Lo que se cambia en ella se
   * guarda en su ficha y la página se vuelve a leer: las filas siguen.
   */
  const [fichaId, setFichaId] = useState<string | null>(null);
  const router = useRouter();
  const { cambiar: cambiarProducto, enviando: guardandoProducto } = useAplicarProducto(() => router.refresh());
  const actorFicha = useActorEnSesion();
  const puedeFicha = actorFicha !== null && can(actorFicha, "inventario.catalogo") !== "DENEGADO";
  const puedePrecioFicha = actorFicha !== null && can(actorFicha, "catalogo.modificar") !== "DENEGADO";
  const ahoraFicha = useAhoraLocal();
  const [tipo, setTipo] = useState<TipoEntrada>(tipoInicial);
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [filas, setFilas] = useState<Borrador[]>(() => {
    const p = productoInicial ? porId.get(productoInicial) : undefined;
    return [p ? conProducto(filaVacia(), p, tipoInicial === "INICIAL") : filaVacia()];
  });
  const conElevacion = useConElevacion();
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pegando, setPegando] = useState(false);
  // La clave del envío: un doble clic o un reintento tras un corte no cargan dos veces lo mismo.
  const [clave, setClave] = useState(() => globalThis.crypto.randomUUID());
  const casillas = useRef(new Map<string, HTMLInputElement | null>());
  const enfocar = (uid: string, campo: "producto" | "cantidad" | "costo") => requestAnimationFrame(() => casillas.current.get(`${uid}:${campo}`)?.focus());

  const inicial = tipo === "INICIAL";
  const cuentan = filas.filter((b) => !ignorada(b, inicial));
  // Lo contado en cero no es una línea (no entra nada): va aparte, y deja el producto contado (B9-7).
  const ceros = cuentan.filter((b) => enCeroDe(b, inicial));
  const conCantidad = cuentan.filter((b) => !enCeroDe(b, inicial));
  const entendidas = conCantidad.map(lineaDe);
  // El inventario inicial es de lo que todavía no lo tiene: lo ya contado se corrige con un conteo.
  const yaContados = inicial ? cuentan.filter((b) => (porId.get(b.productId)?.inventarioInicialEl ?? null) !== null) : [];
  const listas = cuentan.length > 0 && entendidas.every((l) => l !== null) && yaContados.length === 0;
  const existentes = cuentan.filter((b) => !b.nuevo && b.productId).map((b) => b.productId);
  const repetido = new Set(existentes).size !== existentes.length;
  const demasiadas = cuentan.length > MAX_LINEAS;
  const total = sum(
    entendidas.flatMap((l) => (l ? [money(l.valueMinor, "USD")] : [])),
    "USD",
  );
  const unidades = entendidas.reduce((n, l) => n + (l?.units ?? 0), 0);

  function cambiar(uid: string, cambio: Partial<Borrador>) {
    setFilas((fs) => fs.map((b) => (b.uid === uid ? { ...b, ...cambio } : b)));
    setClave(globalThis.crypto.randomUUID()); // lo que se envía ya es otra entrada
    setErrores({});
    setGeneral(null);
  }

  /** Pone filas nuevas en la tabla: ocupan primero las que estén en blanco. */
  function añadir(nuevas: Borrador[]) {
    setFilas((fs) => {
      const resultado = [...fs.filter((b) => !ignorada(b, false)), ...nuevas];
      return resultado.length > 0 ? resultado : [filaVacia()];
    });
    setClave(globalThis.crypto.randomUUID());
    setErrores({});
  }

  /** Intro en la última casilla: la fila siguiente, o una nueva. */
  function siguiente(uid: string) {
    const i = filas.findIndex((b) => b.uid === uid);
    const proxima = filas[i + 1];
    if (proxima) return enfocar(proxima.uid, "producto");
    const nueva = filaVacia();
    setFilas((fs) => [...fs, nueva]);
    enfocar(nueva.uid, "producto");
  }

  // Lo que se cuenta, está a la venta y todavía no tiene su inventario inicial (B9-7).
  const pendientes = contables.filter((p) => p.activo && estadoDe(p) === "SIN_INICIAL");
  function traerPendientes() {
    const ya = new Set(filas.map((b) => b.productId).filter(Boolean));
    const faltan = pendientes.filter((p) => !ya.has(p.id)).map((p) => conProducto(filaVacia(), p, true));
    if (pendientes.length === 0) {
      return avisar.info("Todo lo que se cuenta ya tiene su inventario inicial", { detalle: "Lo que falte o sobre se corrige con un conteo, en Salidas y conteo." });
    }
    if (faltan.length === 0) return avisar.info("Los que faltan ya están en la tabla");
    añadir(faltan);
    avisar.info(`${faltan.length} ${faltan.length === 1 ? "producto sin contar" : "productos sin contar"} en la tabla`, {
      detalle: "Escribe lo que hay de cada uno, 0 si no hay ninguno. Los que dejes en blanco siguen sin inventario inicial.",
    });
  }

  // El lector dentro de la hoja (B9-6): un código conocido suma uno a su fila (o la abre); uno desconocido
  // abre una fila de alta con el código puesto, si quien recibe puede dar de alta.
  useLectorDeCodigos((leido) => {
    const codigo = normalizeBarcode(leido);
    const p = contables.find((x) => x.codigoBarras === codigo || x.sku === codigo);
    if (p) {
      const suya = filas.find((b) => b.productId === p.id);
      if (suya) return cambiar(suya.uid, { cantidad: String((entero(suya.cantidad) ?? 0) + 1) });
      return añadir([{ ...conProducto(filaVacia(), p, inicial), cantidad: "1" }]);
    }
    const yaNuevo = filas.find((b) => b.nuevo && normalizeBarcode(b.nuevo.codigo) === codigo);
    if (yaNuevo) return cambiar(yaNuevo.uid, { cantidad: String((entero(yaNuevo.cantidad) ?? 0) + 1) });
    if (!puedeCrear) return avisar.error(`Ningún producto con el código ${codigo}`, { detalle: "Darlo de alta es de administración." });
    const alta = { ...filaVacia(), nuevo: fichaVacia(codigo), cantidad: "1" };
    añadir([alta]);
    enfocar(alta.uid, "producto");
    avisar.info(`${codigo} es nuevo: escribe su nombre y completa su ficha`);
  }, !pegando);

  async function registrar() {
    if (!listas || repetido || demasiadas) return;
    setEnviando(true);
    try {
      const mando = {
        idempotencyKey: clave,
        tipo,
        ...(tipo === "COMPRA" && proveedor.trim() ? { proveedor: proveedor.trim() } : {}),
        ...(tipo === "COMPRA" && factura.trim() ? { factura: factura.trim() } : {}),
        lineas: entendidas.map((l) => l!.linea),
        ...(ceros.length > 0 ? { enCero: ceros.map((b) => b.productId) } : {}),
      };
      // Con altas, la entrada es también del catálogo: pide confirmar la identidad, como «Nuevo producto».
      const conAltas = cuentan.some((b) => b.nuevo);
      const r = conAltas ? await conElevacion(() => registrarEntrada(mando)) : await registrarEntrada(mando);
      if (r.ok) {
        const n = r.valor.lineas.reduce((x, l) => x + l.unidades, 0);
        const enCero = r.valor.enCero.length;
        avisar.ok(`${tipo === "INICIAL" ? "Inventario inicial registrado" : "Entrada registrada"}: ${n} ${n === 1 ? "unidad" : "unidades"}`, {
          detalle: `${usd(minor(r.valor.total))}. ${n > 0 ? "La caja ya las ofrece." : ""}${enCero > 0 ? ` ${enCero === 1 ? "1 producto contado en cero queda agotado" : `${enCero} productos contados en cero quedan agotados`}.` : ""}`.trim(),
        });
        onRegistrada(r.valor);
        return;
      }
      setErrores(porFila(r.problemas ?? [], conCantidad, ceros, cuentan));
      setGeneral(r.mensaje);
    } catch {
      setGeneral("No hubo respuesta del servidor. No se cargó nada: vuelve a intentarlo.");
    } finally {
      setEnviando(false);
    }
  }

  const segmento = (activo: boolean) =>
    cn(
      "min-h-9 flex-1 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
      activo ? "border-brand bg-brand font-semibold text-on-brand" : "border-line bg-surface text-ink-2 hover:text-ink",
    );

  const faltaAlgo =
    cuentan.length === 0
      ? inicial
        ? "Escribe lo que hay de al menos un producto (0 si no hay ninguno)."
        : "Añade al menos un producto con su cantidad y su costo."
      : yaContados.length > 0
        ? "Quita lo que ya tiene su inventario inicial: se corrige con un conteo."
        : "Falta el producto (o su ficha: categoría y precio), la cantidad o el costo de alguna fila.";

  return (
    <>
    <Sheet
      abierto
      onCerrar={onCerrar}
      className="md:w-[min(76rem,100vw)]"
      titulo={inicial ? "Inventario inicial" : "Nueva entrada"}
      descripcion={
        inicial
          ? "Lo que hay de cada producto que falta por contar, con lo que costó: queda como su existencia de arranque. 0 si no hay ninguno; en blanco, sigue sin contar."
          : "Lo que llegó, una fila por producto: en unidades sueltas o en bultos, y el costo como venga en la factura."
      }
      pie={
        <div className="flex w-full flex-col gap-2">
          {general && (
            <p role="alert" className="flex items-start gap-1.5 text-[12.5px] font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {general}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex flex-col">
              <span className={ETIQUETA}>Total</span>
              <span className="tnum text-[18px] font-bold text-ink">{usd(total)}</span>
            </span>
            <span className="tnum text-[12.5px] text-ink-2">
              {cuentan.length} {cuentan.length === 1 ? "producto" : "productos"} · {unidades} {unidades === 1 ? "unidad" : "unidades"}
            </span>
            <Button type="button" variant="primary" surface="admin" className="ml-auto gap-1.5" disabled={!listas || repetido || demasiadas || enviando} onClick={() => void registrar()}>
              <PackagePlus size={15} aria-hidden="true" />
              {enviando ? "Registrando…" : inicial ? "Registrar inventario inicial" : "Registrar entrada"}
            </Button>
          </div>
          {!listas && !enviando && <p className="text-right text-[12px] text-ink-3">{faltaAlgo}</p>}
          {repetido && <p className="text-right text-[12px] text-state-warn">Un producto va una vez: suma su cantidad en una sola fila.</p>}
          {demasiadas && <p className="text-right text-[12px] text-state-warn">Hasta {MAX_LINEAS} productos por entrada: parte la lista en dos.</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Qué es">
          {(["COMPRA", "REPOSICION", "INICIAL"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              className={segmento(tipo === t)}
              onClick={() => {
                setTipo(t);
                setClave(globalThis.crypto.randomUUID());
              }}
            >
              {t === "COMPRA" ? "Compra a un proveedor" : t === "REPOSICION" ? "Reposición del depósito" : "Inventario inicial"}
            </button>
          ))}
        </div>
        {tipo === "COMPRA" && (
          <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Proveedor</span>
              <input className={cn(CAMPO, "border-line")} value={proveedor} placeholder="Opcional" autoComplete="off" onChange={(e) => setProveedor(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={ETIQUETA}>Factura</span>
              <input className={cn(CAMPO, "border-line")} value={factura} placeholder="Opcional" autoComplete="off" onChange={(e) => setFactura(e.target.value)} />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
            <ScanLine size={13} aria-hidden="true" />
            Busca por nombre, SKU o código, o pásalo por el lector. Intro en el costo pasa a la fila siguiente.
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            {inicial && (
              <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={traerPendientes}>
                <ClipboardList size={15} aria-hidden="true" />
                Traer los que faltan · {pendientes.length}
              </Button>
            )}
            <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setPegando(true)}>
              <ClipboardPaste size={15} aria-hidden="true" />
              Pegar desde Excel
            </Button>
          </div>
        </div>

        <div role="table" aria-label="Productos de la entrada" className="flex flex-col gap-2">
          <div role="row" className="hidden gap-2 px-2 lg:grid lg:grid-cols-[minmax(0,1fr)_5.5rem_10rem_7.5rem_8.5rem_7.5rem_2.25rem]">
            {["Producto", "Cantidad", "En", "Costo ($)", "Por", "Total", ""].map((t, i) => (
              <span key={i} role="columnheader" className={cn(ETIQUETA, i >= 5 && "text-right")}>
                {t}
              </span>
            ))}
          </div>
          {filas.map((b) => {
            const i = cuentan.indexOf(b);
            const j = conCantidad.indexOf(b);
            const elegido = porId.get(b.productId) ?? null;
            return (
              <FilaDeLaTabla
                key={b.uid}
                b={b}
                n={filas.indexOf(b) + 1}
                linea={j >= 0 ? (entendidas[j] ?? null) : null}
                enCero={enCeroDe(b, inicial)}
                yaContado={inicial && elegido?.inventarioInicialEl ? diaDe(Date.parse(elegido.inventarioInicialEl)) : null}
                errores={errores}
                indice={i}
                producto={porId.get(b.productId) ?? null}
                contables={contables}
                todos={catalogo.productos}
                categorias={categorias}
                puedeCrear={puedeCrear}
                inicial={inicial}
                ignorada={ignorada(b, inicial)}
                casilla={(campo, el) => casillas.current.set(`${b.uid}:${campo}`, el)}
                onCambiar={(c) => cambiar(b.uid, c)}
                onElegir={(p) => {
                  cambiar(b.uid, conProducto(b, p, inicial));
                  enfocar(b.uid, "cantidad");
                }}
                onSiguiente={() => siguiente(b.uid)}
                onQuitar={filas.length > 1 ? () => setFilas((fs) => fs.filter((x) => x.uid !== b.uid)) : null}
                onVerFicha={elegido ? () => setFichaId(elegido.id) : null}
              />
            );
          })}
        </div>
        <div>
          <Button
            type="button"
            variant="ghost"
            surface="admin"
            className="gap-1.5"
            onClick={() => {
              const nueva = filaVacia();
              setFilas((fs) => [...fs, nueva]);
              enfocar(nueva.uid, "producto");
            }}
          >
            <Plus size={15} aria-hidden="true" />
            Añadir fila
          </Button>
        </div>
      </div>

      {pegando && (
        <PegarLista
          contables={contables}
          todos={catalogo.productos}
          puedeCrear={puedeCrear}
          enTabla={new Set(filas.map((b) => b.productId).filter(Boolean))}
          inicial={inicial}
          onCerrar={() => setPegando(false)}
          onAñadir={(nuevas) => {
            añadir(nuevas);
            setPegando(false);
            avisar.ok(`${nuevas.length} ${nuevas.length === 1 ? "fila añadida" : "filas añadidas"} a la tabla`, { detalle: "Revísalas antes de registrar." });
          }}
        />
      )}
    </Sheet>
      {/* B9-11: la ficha del producto de una fila, encima de la lista. */}
      <FichaProducto
        producto={fichaId ? (catalogo.productos.find((p) => p.id === fichaId) ?? null) : null}
        onCerrar={() => setFichaId(null)}
        catalogo={catalogo}
        categorias={categorias}
        ahora={ahoraFicha === 0 ? null : ahoraFicha}
        puedeModificar={puedeFicha}
        puedePrecio={puedePrecioFicha}
        enviando={guardandoProducto}
        cambiar={cambiarProducto}
        adoptar={() => router.refresh()}
      />
    </>
  );
}

/** Una fila de la tabla: el producto (buscado o nuevo), la cantidad, cómo viene, el costo y su total. */
function FilaDeLaTabla({
  b,
  n,
  linea,
  enCero,
  yaContado,
  errores,
  indice,
  producto,
  contables,
  todos,
  categorias,
  puedeCrear,
  inicial,
  ignorada,
  casilla,
  onCambiar,
  onElegir,
  onSiguiente,
  onQuitar,
  onVerFicha,
}: {
  b: Borrador;
  n: number;
  linea: ReturnType<typeof lineaDe>;
  /** En el inventario inicial, contado en cero (B9-7). */
  enCero: boolean;
  /** En el inventario inicial, el día en que ya se contó, si ya tiene el suyo. */
  yaContado: string | null;
  errores: Readonly<Record<string, string>>;
  indice: number;
  producto: ProductoDto | null;
  contables: readonly ProductoDto[];
  todos: readonly ProductoDto[];
  categorias: readonly string[];
  puedeCrear: boolean;
  inicial: boolean;
  ignorada: boolean;
  casilla: (campo: "producto" | "cantidad" | "costo", el: HTMLInputElement | null) => void;
  onCambiar: (c: Partial<Borrador>) => void;
  onElegir: (p: ProductoDto) => void;
  onSiguiente: () => void;
  onQuitar: (() => void) | null;
  /** B9-11: abrir la ficha del producto elegido, encima de la lista. */
  onVerFicha: (() => void) | null;
}) {
  const error = (campo: string) => (indice >= 0 ? errores[`${indice}.${campo}`] : undefined);
  const unitario = linea ? averageUnitCostMinor({ quantity: linea.units, valueMinor: linea.valueMinor }) : null;
  const opcionesCosto: readonly CostoPor[] = b.en === "BULTOS" ? ["UNIDAD", "BULTO", "TOTAL"] : ["UNIDAD", "TOTAL"];
  const costoPor = b.en === "UNIDADES" && b.costoPor === "BULTO" ? "UNIDAD" : b.costoPor;
  const errorProducto = error("productId") ?? error("nuevo.nombre");
  return (
    <div
      role="row"
      aria-label={`Fila ${n}`}
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-control)] border bg-base p-2",
        errorProducto || error("bultos") || error("costo") || yaContado ? "border-state-crit/60" : "border-line",
        ignorada && inicial && b.productId && "opacity-75",
      )}
    >
      <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_5.5rem_10rem_7.5rem_8.5rem_7.5rem_2.25rem] lg:items-center">
        <div role="cell" className="col-span-2 sm:col-span-4 lg:col-span-1">
          <BuscadorDeProducto
            n={n}
            texto={b.texto}
            elegido={producto}
            esNuevo={b.nuevo !== null}
            contables={contables}
            todos={todos}
            puedeCrear={puedeCrear}
            error={errorProducto}
            inputRef={(el) => casilla("producto", el)}
            onTexto={(texto) => onCambiar(b.productId ? { texto, productId: "" } : { texto })}
            onElegir={onElegir}
            onNuevo={() => onCambiar({ productId: "", nuevo: b.nuevo ?? fichaVacia() })}
          />
        </div>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Cantidad</span>
          <input
            ref={(el) => casilla("cantidad", el)}
            aria-label={`Cantidad de la fila ${n}`}
            inputMode="numeric"
            className={cn(CAMPO, "tnum text-right", error("bultos") ? "border-state-crit" : "border-line")}
            placeholder={inicial ? "—" : "1"}
            value={b.cantidad}
            onChange={(e) => onCambiar({ cantidad: e.target.value.replace(/[^\d]/g, "") })}
          />
        </label>
        <div role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>En</span>
          <div className="flex gap-1">
            <select
              aria-label={`Cómo viene la fila ${n}`}
              className={cn(CAMPO, "border-line px-1.5", b.en === "BULTOS" ? "w-[5.5rem] flex-none" : "flex-1")}
              value={b.en}
              onChange={(e) => onCambiar({ en: e.target.value as Borrador["en"], porBulto: e.target.value === "BULTOS" ? b.porBulto || "12" : b.porBulto })}
            >
              <option value="UNIDADES">Unidades</option>
              <option value="BULTOS">Bultos de</option>
            </select>
            {b.en === "BULTOS" && (
              <input
                aria-label={`Unidades por bulto de la fila ${n}`}
                inputMode="numeric"
                className={cn(CAMPO, "tnum flex-1 text-right", error("unidadesPorBulto") ? "border-state-crit" : "border-line")}
                value={b.porBulto}
                onChange={(e) => onCambiar({ porBulto: e.target.value.replace(/[^\d]/g, "") })}
              />
            )}
          </div>
        </div>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Costo ($)</span>
          <input
            ref={(el) => casilla("costo", el)}
            aria-label={`Costo de la fila ${n}`}
            inputMode="decimal"
            className={cn(CAMPO, "tnum text-right", error("costo") ? "border-state-crit" : "border-line")}
            placeholder={enCero ? "—" : "0,00"}
            disabled={enCero}
            value={enCero ? "" : b.costo}
            onChange={(e) => onCambiar({ costo: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSiguiente();
              }
            }}
          />
        </label>
        <label role="cell" className="flex flex-col gap-1 lg:block">
          <span className={cn(ETIQUETA, "lg:sr-only")}>Por</span>
          <select
            aria-label={`De qué es el costo de la fila ${n}`}
            className={cn(CAMPO, "border-line px-1.5")}
            value={costoPor}
            onChange={(e) => onCambiar({ costoPor: e.target.value as CostoPor })}
          >
            {opcionesCosto.map((o) => (
              <option key={o} value={o}>
                {o === "UNIDAD" ? "por unidad" : o === "BULTO" ? "por bulto" : "total de la fila"}
              </option>
            ))}
          </select>
        </label>
        <div role="cell" className="tnum flex flex-col items-end justify-center text-right">
          <span className="text-[14px] font-semibold text-ink">{enCero ? "En cero" : linea ? usd(money(linea.valueMinor, "USD")) : "—"}</span>
          {linea && (
            <span className="text-[11.5px] text-ink-3">
              {linea.units} u{unitario !== null && ` · ${usd(money(unitario, "USD"))} c/u`}
            </span>
          )}
        </div>
        <div role="cell" className="flex justify-end">
          {onQuitar && (
            <button
              type="button"
              aria-label={`Quitar la fila ${n}`}
              onClick={onQuitar}
              className="grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-state-crit-bg hover:text-state-crit"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {(error("bultos") || error("unidadesPorBulto") || error("costo")) && (
        <p className="text-[12px] text-state-crit">{error("bultos") ?? error("unidadesPorBulto") ?? error("costo")}</p>
      )}
      {yaContado && (
        <p className="text-[12px] text-state-crit">Ya tiene su inventario inicial (del {yaContado}): lo que falte o sobre se corrige con un conteo. Quita esta fila.</p>
      )}
      {enCero && !yaContado && <p className="text-[11.5px] text-ink-3">Contado en cero: queda «Agotado», sin costo.</p>}
      {/* B9-11: el producto elegido, con su categoría y su presentación; su ficha, sin perder la lista. */}
      {producto && !b.nuevo && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
          <span>
            {producto.categoria}
            {producto.presentacion ? ` · ${producto.presentacion}` : ""} · <span className="tnum font-mono">{producto.sku}</span>
          </span>
          {onVerFicha && (
            <button
              type="button"
              onClick={onVerFicha}
              className="inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] border border-line px-2 font-semibold text-ink-2 hover:border-brand/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Pencil size={12} aria-hidden="true" />
              Ver o editar su ficha
            </button>
          )}
        </p>
      )}
      {producto?.costoPromedio && linea && <p className="tnum text-[11.5px] text-ink-3">Hoy cuesta {usd(minor(producto.costoPromedio))} de promedio; quedan {producto.existencia ?? 0}.</p>}
      {b.nuevo && <FichaCorta nuevo={b.nuevo} n={n} categorias={categorias} error={(c) => error(`nuevo.${c}`)} onCambiar={(c) => onCambiar({ nuevo: { ...b.nuevo!, ...c } })} />}
    </div>
  );
}

/**
 * La casilla del producto: buscar escribiendo (nombre, SKU o código) y elegir con las flechas e Intro, o
 * dar de alta uno nuevo con lo escrito. Elegido, enseña cuántas quedan.
 */
function BuscadorDeProducto({
  n,
  texto,
  elegido,
  esNuevo,
  contables,
  todos,
  puedeCrear,
  error,
  inputRef,
  onTexto,
  onElegir,
  onNuevo,
}: {
  n: number;
  texto: string;
  elegido: ProductoDto | null;
  esNuevo: boolean;
  contables: readonly ProductoDto[];
  todos: readonly ProductoDto[];
  puedeCrear: boolean;
  error: string | undefined;
  inputRef: (el: HTMLInputElement | null) => void;
  onTexto: (t: string) => void;
  onElegir: (p: ProductoDto) => void;
  onNuevo: () => void;
}) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const clave = nameKey(texto);
  const codigo = normalizeBarcode(texto);
  const coincidencias = useMemo(() => {
    if (clave.length === 0 || elegido) return [];
    const empiezan = contables.filter((p) => nameKey(p.nombre).startsWith(clave) || p.sku === codigo || p.codigoBarras === codigo);
    const contienen = contables.filter((p) => !empiezan.includes(p) && nameKey(p.nombre).includes(clave));
    return [...empiezan, ...contienen].slice(0, 8);
  }, [clave, codigo, contables, elegido]);
  // Un nombre que ya es de un producto que no se cuenta (un preparado) no se da de alta otra vez.
  const deOtro = todos.find((p) => nameKey(p.nombre) === clave && !p.controlaStock);
  const ofrecerNuevo = puedeCrear && !esNuevo && !elegido && clave.length >= 2 && !contables.some((p) => nameKey(p.nombre) === clave) && !deOtro;
  const opciones = coincidencias.length + (ofrecerNuevo ? 1 : 0);
  const visible = abierto && opciones > 0;

  function elegir(i: number) {
    const p = coincidencias[i];
    if (p) onElegir(p);
    else if (ofrecerNuevo) onNuevo();
    setAbierto(false);
  }

  return (
    <div className="relative flex flex-col gap-1">
      <span className={cn(ETIQUETA, "lg:sr-only")}>Producto</span>
      <div className="relative">
        <input
          ref={inputRef}
          role="combobox"
          aria-label={`Producto de la fila ${n}`}
          aria-expanded={visible}
          aria-controls={`${id}-lista`}
          aria-activedescendant={visible ? `${id}-${activo}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className={cn(CAMPO, esNuevo && "pr-16", elegido && "pr-20", error ? "border-state-crit" : "border-line")}
          placeholder="Nombre, SKU o código"
          value={texto}
          onChange={(e) => {
            onTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onKeyDown={(e) => {
            if (!visible) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => (a + 1) % opciones);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => (a - 1 + opciones) % opciones);
            } else if (e.key === "Enter") {
              e.preventDefault();
              elegir(activo);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
        />
        {elegido && (
          <span className="tnum pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11.5px] text-ink-3">
            {estadoDe(elegido) === "SIN_INICIAL" ? "sin contar" : `quedan ${elegido.existencia ?? 0}`}
          </span>
        )}
        {esNuevo && (
          <span className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 text-[11.5px] font-semibold text-brand">
            <Sparkles size={12} aria-hidden="true" />
            Nuevo
          </span>
        )}
      </div>
      {error && <span className="text-[12px] text-state-crit">{error}</span>}
      {!error && deOtro && !elegido && <span className="text-[12px] text-state-warn">«{deOtro.nombre}» ya existe y no se cuenta: cámbiale el tipo en Productos.</span>}
      {visible && (
        <ul id={`${id}-lista`} role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-line bg-surface py-1 shadow-lift">
          {coincidencias.map((p, i) => (
            <li
              key={p.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={activo === i}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(i);
              }}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13.5px]", activo === i ? "bg-surface-2 text-ink" : "text-ink-2")}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.nombre}</span>
              <span className="tnum shrink-0 text-[11.5px] text-ink-3">
                {p.sku} · {estadoDe(p) === "SIN_INICIAL" ? "sin contar" : `quedan ${p.existencia ?? 0}`}
              </span>
            </li>
          ))}
          {ofrecerNuevo && (
            <li
              id={`${id}-${coincidencias.length}`}
              role="option"
              aria-selected={activo === coincidencias.length}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(coincidencias.length);
              }}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13.5px] font-medium text-brand", activo === coincidencias.length && "bg-surface-2")}
            >
              <Sparkles size={13} aria-hidden="true" />
              Producto nuevo: «{texto.trim()}»
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** La ficha corta de un producto nuevo, bajo su fila (B9-6): nace a la venta como «Producto». */
function FichaCorta({
  nuevo: f,
  n,
  categorias,
  error,
  onCambiar,
}: {
  nuevo: Nuevo;
  n: number;
  categorias: readonly string[];
  error: (campo: string) => string | undefined;
  onCambiar: (c: Partial<Nuevo>) => void;
}) {
  const problema = f.codigo.trim() === "" ? null : barcodeProblem(normalizeBarcode(f.codigo));
  const campo = (nombre: string, extra = "") => cn(CAMPO, extra, error(nombre) ? "border-state-crit" : "border-line");
  const nueva = f.categoria.trim().length >= 2 && !categorias.some((c) => nameKey(c) === nameKey(f.categoria));
  return (
    <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-control)] border border-dashed border-brand/50 p-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_8rem_9rem]">
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>Categoría</span>
        {/* B9-11: de una lista que se despliega; «Escribir una nueva…» para la que no está. */}
        <CampoCategoria etiqueta={`Categoría del producto nuevo de la fila ${n}`} className={campo("categoria")} valor={f.categoria} categorias={categorias} onCambio={(categoria) => onCambiar({ categoria })} />
        {nueva && <span className="text-[11.5px] text-ink-3">Nueva: entra en la lista.</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>Presentación</span>
        <input className={campo("presentacion")} autoComplete="off" placeholder="Lata 355 ml" value={f.presentacion} onChange={(e) => onCambiar({ presentacion: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>Código de barras</span>
        <input className={campo("codigoBarras", "tnum font-mono")} autoComplete="off" placeholder="Opcional" value={f.codigo} onChange={(e) => onCambiar({ codigo: e.target.value })} />
        {(error("codigoBarras") ?? problema) && (
          <span className="text-[11.5px] text-state-crit">{error("codigoBarras") ?? (problema === "DIGITO_DE_CONTROL" ? "El dígito de control no cuadra" : "De 4 a 32 dígitos, letras o guiones")}</span>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>Precio de venta ($)</span>
        <input aria-label={`Precio de venta del producto nuevo de la fila ${n}`} className={campo("precioMinor", "tnum text-right")} inputMode="decimal" placeholder="1,50" value={f.precio} onChange={(e) => onCambiar({ precio: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ETIQUETA}>IVA</span>
        <select className={campo("taxCode")} value={f.taxCode} onChange={(e) => onCambiar({ taxCode: e.target.value as TaxCodeDelCatalogo })}>
          <option value="GENERAL">IVA general</option>
          <option value="EXENTA">Exento de IVA</option>
        </select>
      </label>
    </div>
  );
}

/** Una fila pegada, ya entendida: qué producto es (o si es nuevo) y qué le falta. */
type Pegada = Readonly<{ fila: number; nombre: string; borrador: Borrador | null; estado: "CONOCIDO" | "NUEVO" | "INCOMPLETO" | "ERROR"; nota: string }>;

/**
 * Lo pegado de Excel o Google Sheets, fila a fila. Columnas, en este orden: producto, cantidad, costo por
 * unidad y, para los nuevos, categoría, precio de venta y código de barras. Una primera fila de títulos
 * se salta sola. Las celdas van separadas por tabuladores (lo que copia una hoja de cálculo) o por «;».
 */
function entenderPegado(
  texto: string,
  contables: readonly ProductoDto[],
  todos: readonly ProductoDto[],
  puedeCrear: boolean,
  enTabla: ReadonlySet<string>,
  /** En el inventario inicial, un 0 de un producto que ya existe vale: se contó y no hay (B9-7). */
  inicial: boolean,
): Pegada[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const separador = lineas.some((l) => l.includes("\t")) ? "\t" : ";";
  const vistos = new Set<string>();
  const filas: Pegada[] = [];
  for (const [i, linea] of lineas.entries()) {
    const [nombre = "", cantidadTxt = "", costoTxt = "", categoria = "", precio = "", codigo = ""] = linea.split(separador).map((c) => c.trim());
    const cantidad = entero(cantidadTxt.replace(/[.,]0+$/, ""));
    // Una primera fila sin cantidad es la de los títulos.
    if (i === 0 && cantidad === null && nombre !== "") continue;
    const fila = i + 1;
    if (nombre === "") {
      filas.push({ fila, nombre: "", borrador: null, estado: "ERROR", nota: "Sin producto" });
      continue;
    }
    if (cantidad === null || cantidad < (inicial ? 0 : 1)) {
      filas.push({ fila, nombre, borrador: null, estado: "ERROR", nota: `Cantidad «${cantidadTxt}»: un número entero` });
      continue;
    }
    const costo = importe(costoTxt);
    if (!costo && cantidad > 0) {
      filas.push({ fila, nombre, borrador: null, estado: "ERROR", nota: `Costo «${costoTxt}»: un importe en dólares` });
      continue;
    }
    const cod = normalizeBarcode(codigo);
    const existente = (cod ? contables.find((p) => p.codigoBarras === cod || p.sku === cod) : undefined) ?? contables.find((p) => nameKey(p.nombre) === nameKey(nombre));
    const clave = existente?.id ?? nameKey(nombre);
    if (vistos.has(clave) || (existente && enTabla.has(existente.id))) {
      filas.push({ fila, nombre, borrador: null, estado: "ERROR", nota: "Repetido: ya está en la tabla o más arriba" });
      continue;
    }
    vistos.add(clave);
    const base = { ...filaVacia(), cantidad: String(cantidad), costo: costoTxt.replace(/US\$|\$|USD/gi, "").trim(), costoPor: "UNIDAD" as const, en: "UNIDADES" as const };
    if (existente) {
      const nota = estadoDe(existente) === "SIN_INICIAL" ? `${existente.sku} · sin contar` : `${existente.sku} · quedan ${existente.existencia ?? 0}`;
      filas.push({ fila, nombre: existente.nombre, borrador: { ...base, texto: existente.nombre, productId: existente.id }, estado: "CONOCIDO", nota: cantidad === 0 ? `${nota} · en cero` : nota });
      continue;
    }
    if (cantidad === 0) {
      filas.push({ fila, nombre, borrador: null, estado: "ERROR", nota: "Un producto nuevo entra con su cantidad: sin ella, dalo de alta en Productos → Alta en lote" });
      continue;
    }
    if (todos.some((p) => nameKey(p.nombre) === nameKey(nombre))) {
      filas.push({ fila, nombre, borrador: null, estado: "ERROR", nota: "Ya existe y no se cuenta (un preparado o un servicio)" });
      continue;
    }
    if (!puedeCrear) {
      filas.push({ fila, nombre, borrador: null, estado: "ERROR", nota: "No existe: darlo de alta es de administración" });
      continue;
    }
    const ficha = { ...fichaVacia(cod), categoria, precio };
    const completa = altaDe(nombre, ficha) !== null;
    filas.push({
      fila,
      nombre,
      borrador: { ...base, texto: nombre, nuevo: ficha },
      estado: completa ? "NUEVO" : "INCOMPLETO",
      nota: completa ? `Nuevo en «${categoria}»` : "Nuevo: falta su categoría o su precio de venta (complétalo en la tabla)",
    });
  }
  return filas;
}

function PegarLista({
  contables,
  todos,
  puedeCrear,
  enTabla,
  inicial,
  onCerrar,
  onAñadir,
}: {
  contables: readonly ProductoDto[];
  todos: readonly ProductoDto[];
  puedeCrear: boolean;
  enTabla: ReadonlySet<string>;
  inicial: boolean;
  onCerrar: () => void;
  onAñadir: (filas: Borrador[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const filas = useMemo(() => entenderPegado(texto, contables, todos, puedeCrear, enTabla, inicial), [texto, contables, todos, puedeCrear, enTabla, inicial]);
  const buenas = filas.flatMap((f) => (f.borrador ? [f.borrador] : []));
  const cuenta = (e: Pegada["estado"]) => filas.filter((f) => f.estado === e).length;
  const COLOR = { CONOCIDO: "text-state-ok", NUEVO: "text-brand", INCOMPLETO: "text-state-warn", ERROR: "text-state-crit" } as const;
  const ESTADO = { CONOCIDO: "Conocido", NUEVO: "Nuevo", INCOMPLETO: "Le falta algo", ERROR: "No entra" } as const;
  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Pegar desde Excel"
      descripcion="Copia las filas en la hoja de cálculo y pégalas aquí. Columnas: producto, cantidad, costo por unidad y, para los nuevos, categoría, precio de venta y código."
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" surface="admin" className="flex-1" disabled={buenas.length === 0} onClick={() => onAñadir(buenas)}>
            {buenas.length === 0 ? "Añadir a la tabla" : `Añadir ${buenas.length} a la tabla`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <textarea
          aria-label="Lista pegada"
          rows={6}
          autoFocus
          className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-base px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus:border-brand"
          placeholder={"Refresco de uva\t24\t0,50\tBebidas\t1,50\nGalleta de chocolate\t12\t0,80"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {filas.length > 0 && (
          <>
            <p className="tnum text-[12.5px] text-ink-2">
              {cuenta("CONOCIDO")} conocidos · {cuenta("NUEVO")} nuevos · {cuenta("INCOMPLETO")} con algo que completar · {cuenta("ERROR")} que no entran
            </p>
            <ul className="flex max-h-60 flex-col divide-y divide-line overflow-y-auto rounded-[var(--radius-control)] border border-line">
              {filas.map((f) => (
                <li key={f.fila} className="flex items-baseline gap-2 px-3 py-1.5 text-[12.5px]">
                  <span className="tnum w-6 shrink-0 text-ink-3">{f.fila}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{f.nombre || "—"}</span>
                  <span className={cn("shrink-0 font-semibold", COLOR[f.estado])}>{ESTADO[f.estado]}</span>
                  <span className="hidden min-w-0 max-w-[45%] truncate text-ink-3 sm:inline">{f.nota}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Lo que dicen los códigos del servidor, para una persona. */
const MENSAJE_DE_CODIGO: Readonly<Record<string, string>> = {
  SIN_CONTROL_DE_STOCK: "No lleva existencia",
  YA_TIENE_INVENTARIO_INICIAL: "Ya tiene su inventario inicial: se corrige con un conteo",
};

/**
 * Los problemas del servidor por fila y campo, con el índice de la fila entre las que cuentan: «lineas.0.costo» es
 * la primera con cantidad; «enCero.0», la primera contada en cero (B9-7).
 */
function porFila(problemas: readonly Problema[], conCantidad: readonly Borrador[], ceros: readonly Borrador[], cuentan: readonly Borrador[]): Record<string, string> {
  const e: Record<string, string> = {};
  for (const p of problemas) {
    if (typeof p.path[1] !== "number") continue;
    const fila = p.path[0] === "lineas" ? conCantidad[p.path[1]] : p.path[0] === "enCero" ? ceros[p.path[1]] : undefined;
    if (!fila) continue;
    const i = cuentan.indexOf(fila);
    // La ficha corta señala su campo («lineas.1.nuevo.codigoBarras» → «1.nuevo.codigoBarras»).
    const campo = p.path[0] === "enCero" ? `${i}.productId` : p.path[2] === "nuevo" ? `${i}.nuevo.${String(p.path[3] ?? "nombre")}` : `${i}.${String(p.path[2] ?? "productId")}`;
    e[campo] ??= MENSAJE_DE_CODIGO[p.message] ?? p.message;
  }
  return e;
}
