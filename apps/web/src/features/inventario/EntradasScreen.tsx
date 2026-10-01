"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackagePlus, Plus, ScanLine, Sparkles, TriangleAlert, Truck, X } from "lucide-react";
import type { CatalogoDto, EntradaDto, EntradasDto, Problema, ProductoDto, TaxCodeDelCatalogo, TipoEntrada } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { averageUnitCostMinor, barcodeProblem, categoriesOf, entryLineTotals, normalizeBarcode } from "@l2/domain-inventory";
import { money, sum, toMajor, type Money } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, Sheet, avisar, cn, formatMoneyVE, useLectorDeCodigos } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { registrarEntrada } from "./entradas.acciones";

/**
 * Panel → Inventario → Entradas de mercancía (B9-3, F8-06). Lo que llega, por compra o reposición:
 * tantos bultos de tantas unidades a tanto el bulto. Sube la existencia y da el costo promedio de
 * cada producto. Una entrada no se edita ni se borra: un error se corrige con otro movimiento (B9-4).
 * Un producto que llega por primera vez se da de alta en la misma hoja con su ficha corta (B9-6), y
 * pasar un código por el lector suma su línea o abre esa ficha con el código puesto. Quién puede y si
 * cada línea vale lo decide el servidor.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "min-h-9 w-full rounded-[var(--radius-control)] border bg-surface px-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

const usd = (m: Money) => formatMoneyVE(toMajor(m), "USD");
const minor = (m: { minor: string }) => money(BigInt(m.minor), "USD");
const NOMBRE_TIPO: Readonly<Record<TipoEntrada, string>> = { COMPRA: "Compra", REPOSICION: "Reposición" };

/** La ficha corta de un producto que llega por primera vez (B9-6), tal como se teclea. */
type Nuevo = { nombre: string; categoria: string; presentacion: string; codigo: string; precio: string; taxCode: TaxCodeDelCatalogo };

/** Una línea del borrador: lo tecleado, sin convertir hasta que se entiende. Con `nuevo`, es un alta. */
type Borrador = { uid: string; productId: string; nuevo: Nuevo | null; bultos: string; unidades: string; costo: string };

const nuevaLinea = (productId = "", unidades = "1"): Borrador => ({ uid: globalThis.crypto.randomUUID(), productId, nuevo: null, bultos: "1", unidades, costo: "" });
const lineaDeAlta = (codigo = ""): Borrador => ({
  ...nuevaLinea(),
  nuevo: { nombre: "", categoria: "", presentacion: "", codigo, precio: "", taxCode: "GENERAL" },
});

/** La ficha corta, si se entiende; `null` si falta algo. El servidor la revalida con el contrato. */
function altaDe(n: Nuevo) {
  const precio = n.precio.trim() === "" ? null : importeTecleado(n.precio, "USD");
  const codigo = normalizeBarcode(n.codigo);
  if (n.nombre.trim().length < 2 || n.categoria.trim().length < 2 || !precio || precio.amount <= 0n) return null;
  if (codigo !== "" && barcodeProblem(codigo) !== null) return null;
  return {
    nombre: n.nombre.trim(),
    categoria: n.categoria.trim(),
    taxCode: n.taxCode,
    precioMinor: String(precio.amount),
    ...(codigo ? { codigoBarras: codigo } : {}),
    ...(n.presentacion.trim() ? { presentacion: n.presentacion.trim() } : {}),
  };
}

/** Lo que dice una línea del borrador si se entiende; `null` si falta algo o está mal escrito. */
function lineaDe(b: Borrador) {
  const bultos = Number(b.bultos);
  const unidades = Number(b.unidades);
  const costo = b.costo.trim() === "" ? null : importeTecleado(b.costo, "USD");
  if (!Number.isInteger(bultos) || bultos < 1 || !Number.isInteger(unidades) || unidades < 1 || !costo || costo.amount < 0n) return null;
  const t = entryLineTotals({ packs: bultos, packSize: unidades, packCostMinor: costo.amount });
  const cantidades = { bultos, unidadesPorBulto: unidades, costoBultoMinor: String(costo.amount), ...t };
  if (b.nuevo) {
    const alta = altaDe(b.nuevo);
    return alta ? { linea: { nuevo: alta, bultos, unidadesPorBulto: unidades, costoBultoMinor: cantidades.costoBultoMinor }, ...cantidades } : null;
  }
  return b.productId ? { linea: { productId: b.productId, bultos, unidadesPorBulto: unidades, costoBultoMinor: cantidades.costoBultoMinor }, ...cantidades } : null;
}

export function EntradasScreen({ catalogo, entradas: inicial }: { catalogo: CatalogoDto; entradas: EntradasDto | null }) {
  const actor = useActorEnSesion();
  const puedeRecibir = actor !== null && can(actor, "inventario.entrada") !== "DENEGADO";
  // Dar de alta en la entrada es del catálogo (B9-6): lo mismo que «Nuevo producto».
  const puedeCrear = actor !== null && can(actor, "catalogo.modificar") !== "DENEGADO";
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
  const porId = useMemo(() => new Map(catalogo.productos.map((p) => [p.id, p])), [catalogo]);
  const categorias = useMemo(() => categoriesOf(catalogo.productos.map((p) => ({ category: p.categoria }))), [catalogo]);

  const [abierta, setAbierta] = useState(false);
  // «Cargar entrada» desde la ficha de un producto llega con `?producto=` y abre la hoja con él.
  const desdeProducto = params.get("producto");
  useEffect(() => {
    if (desdeProducto && porId.get(desdeProducto)?.controlaStock && puedeRecibir) setAbierta(true);
  }, [desdeProducto, puedeRecibir]);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Inventario", href: "/panel/inventario" }, { texto: "Entradas de mercancía" }]}
        titulo="Entradas de mercancía"
        descripcion="Lo que llega, por compra o reposición. Sube la existencia y da el costo promedio de cada producto; no se edita ni se borra."
        acciones={
          puedeRecibir && (contables.length > 0 || puedeCrear) && (
            <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setAbierta(true)}>
              <Plus size={15} aria-hidden="true" />
              Nueva entrada
            </Button>
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
      ) : entradas.length === 0 ? (
        <Vacio
          titulo="Todavía no llegó nada"
          detalle="Lo que lleva existencia sale «Agotado» en la caja hasta que se carga su primera entrada."
          accion={
            puedeRecibir && (
              <Button type="button" variant="primary" surface="admin" className="gap-1.5" onClick={() => setAbierta(true)}>
                <Plus size={15} aria-hidden="true" />
                Nueva entrada
              </Button>
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
          contables={contables}
          porId={porId}
          categorias={categorias}
          puedeCrear={puedeCrear}
          inicial={desdeProducto && porId.get(desdeProducto)?.controlaStock ? desdeProducto : null}
          onCerrar={() => setAbierta(false)}
          onRegistrada={(e) => {
            setEntradas((prev) => [e, ...(prev ?? []).filter((x) => x.id !== e.id)]);
            setAbierta(false);
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
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-2">{NOMBRE_TIPO[e.tipo]}</span>
        <span className="text-[14px] font-semibold text-ink">{e.proveedor ?? (e.tipo === "COMPRA" ? "Proveedor sin declarar" : "Del depósito")}</span>
        {e.factura && <span className="tnum text-[12.5px] text-ink-3">Factura {e.factura}</span>}
        <span className="tnum ml-auto text-[15px] font-bold text-ink">{usd(minor(e.total))}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-2">
        {e.lineas.map((l, i) => (
          <span key={l.productId}>
            {i > 0 && <span className="text-ink-3"> · </span>}
            {l.nombre} <span className="tnum text-ink-3">{l.bultos === 1 && l.unidadesPorBulto === 1 ? "1 u" : `${l.bultos} × ${l.unidadesPorBulto} = ${l.unidades} u`}</span>
          </span>
        ))}
      </p>
      <p className="tnum mt-0.5 text-[12px] text-ink-3">
        {cuando} · recibió {e.recibidaPor}
      </p>
    </li>
  );
}

function NuevaEntrada({
  contables,
  porId,
  categorias,
  puedeCrear,
  inicial,
  onCerrar,
  onRegistrada,
}: {
  contables: readonly ProductoDto[];
  porId: ReadonlyMap<string, ProductoDto>;
  categorias: readonly string[];
  puedeCrear: boolean;
  inicial: string | null;
  onCerrar: () => void;
  onRegistrada: (e: EntradaDto) => void;
}) {
  const bultoDe = (id: string) => String(porId.get(id)?.ultimoBulto ?? 1);
  const [tipo, setTipo] = useState<TipoEntrada>("COMPRA");
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [lineas, setLineas] = useState<Borrador[]>(() => [nuevaLinea(inicial ?? "", inicial ? bultoDe(inicial) : "1")]);
  const conElevacion = useConElevacion();
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // La clave del envío: un doble clic o un reintento tras un corte no cargan dos veces lo mismo.
  const [clave, setClave] = useState(() => globalThis.crypto.randomUUID());

  const entendidas = lineas.map(lineaDe);
  const listas = entendidas.every((l) => l !== null);
  const existentes = lineas.filter((l) => !l.nuevo && l.productId).map((l) => l.productId);
  const repetido = new Set(existentes).size !== existentes.length;

  // El lector dentro de la hoja (B9-6): un código conocido suma un bulto a su línea (o la abre); uno
  // desconocido abre la ficha corta con el código puesto, si quien recibe puede dar de alta.
  useLectorDeCodigos((leido) => {
    const codigo = normalizeBarcode(leido);
    const p = contables.find((x) => x.codigoBarras === codigo || x.sku === codigo);
    if (p) {
      setLineas((ls) => {
        const suya = ls.find((l) => !l.nuevo && l.productId === p.id);
        if (suya) return ls.map((l) => (l === suya ? { ...l, bultos: String((Number(l.bultos) || 0) + 1) } : l));
        const vacia = ls.find((l) => !l.nuevo && !l.productId);
        const linea = { ...nuevaLinea(p.id, bultoDe(p.id)) };
        return vacia ? ls.map((l) => (l === vacia ? { ...linea, uid: l.uid } : l)) : [...ls, linea];
      });
      setClave(globalThis.crypto.randomUUID());
      return;
    }
    const yaNuevo = lineas.find((l) => l.nuevo && normalizeBarcode(l.nuevo.codigo) === codigo);
    if (yaNuevo) {
      setLineas((ls) => ls.map((l) => (l.uid === yaNuevo.uid ? { ...l, bultos: String((Number(l.bultos) || 0) + 1) } : l)));
      return;
    }
    if (!puedeCrear) {
      avisar.error(`Ningún producto con el código ${codigo}`, { detalle: "Darlo de alta es de administración." });
      return;
    }
    setLineas((ls) => {
      const vacia = ls.find((l) => !l.nuevo && !l.productId);
      const alta = lineaDeAlta(codigo);
      return vacia ? ls.map((l) => (l === vacia ? { ...alta, uid: l.uid } : l)) : [...ls, alta];
    });
    setClave(globalThis.crypto.randomUUID());
    avisar.info(`${codigo} es nuevo: completa su ficha corta`);
  });
  const total = sum(
    entendidas.flatMap((l) => (l ? [money(l.valueMinor, "USD")] : [])),
    "USD",
  );

  function cambiarNuevo(uid: string, cambio: Partial<Nuevo>) {
    setLineas((ls) => ls.map((l) => (l.uid === uid && l.nuevo ? { ...l, nuevo: { ...l.nuevo, ...cambio } } : l)));
    setClave(globalThis.crypto.randomUUID());
    setErrores({});
    setGeneral(null);
  }

  function cambiar(uid: string, cambio: Partial<Borrador>) {
    setLineas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...cambio } : l)));
    setClave(globalThis.crypto.randomUUID()); // lo que se envía ya es otra entrada
    setErrores({});
    setGeneral(null);
  }

  async function registrar() {
    if (!listas || repetido) return;
    setEnviando(true);
    try {
      const mando = {
        idempotencyKey: clave,
        tipo,
        ...(tipo === "COMPRA" && proveedor.trim() ? { proveedor: proveedor.trim() } : {}),
        ...(tipo === "COMPRA" && factura.trim() ? { factura: factura.trim() } : {}),
        lineas: entendidas.map((l) => l!.linea),
      };
      // Con altas, la entrada es también del catálogo: pide confirmar la identidad, como «Nuevo producto».
      const conAltas = lineas.some((l) => l.nuevo);
      const r = conAltas ? await conElevacion(() => registrarEntrada(mando)) : await registrarEntrada(mando);
      if (r.ok) {
        const unidades = r.valor.lineas.reduce((n, l) => n + l.unidades, 0);
        avisar.ok(`Entrada registrada: ${unidades} ${unidades === 1 ? "unidad" : "unidades"}`, { detalle: `${usd(minor(r.valor.total))}. La caja ya las ofrece.` });
        onRegistrada(r.valor);
        return;
      }
      setErrores(porLinea(r.problemas ?? [], lineas));
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

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Nueva entrada"
      descripcion="Lo que llegó, en bultos de tantas unidades y a tanto el bulto, en dólares."
      pie={
        <div className="flex w-full flex-col gap-2">
          {general && (
            <p role="alert" className="flex items-start gap-1.5 text-[12.5px] font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {general}
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="flex flex-col">
              <span className={ETIQUETA}>Total</span>
              <span className="tnum text-[18px] font-bold text-ink">{usd(total)}</span>
            </span>
            <Button type="button" variant="primary" surface="admin" className="ml-auto gap-1.5" disabled={!listas || repetido || enviando} onClick={() => void registrar()}>
              <PackagePlus size={15} aria-hidden="true" />
              {enviando ? "Registrando…" : "Registrar entrada"}
            </Button>
          </div>
          {!listas && !enviando && <p className="text-right text-[12px] text-ink-3">Falta el producto (o su ficha: nombre, categoría y precio), o bultos, unidades y costo de alguna línea.</p>}
          {repetido && <p className="text-right text-[12px] text-state-warn">Un producto va una vez: suma sus bultos en una sola línea.</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="-mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
          <ScanLine size={13} aria-hidden="true" />
          Pasa los códigos por el lector: cada lectura suma un bulto{puedeCrear ? ", y uno nuevo abre su ficha" : ""}.
        </p>
        <div className="flex gap-2" role="group" aria-label="Qué llegó">
          {(["COMPRA", "REPOSICION"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} className={segmento(tipo === t)} onClick={() => setTipo(t)}>
              {t === "COMPRA" ? "Compra a un proveedor" : "Reposición del depósito"}
            </button>
          ))}
        </div>
        {tipo === "COMPRA" && (
          <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3">
            <Input label="Proveedor" surface="admin" value={proveedor} placeholder="Opcional" autoComplete="off" onChange={(e) => setProveedor(e.target.value)} />
            <Input label="Factura" surface="admin" value={factura} placeholder="Opcional" autoComplete="off" onChange={(e) => setFactura(e.target.value)} />
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {lineas.map((b, i) => {
            const l = entendidas[i];
            const p = porId.get(b.productId);
            const unitario = l ? averageUnitCostMinor({ quantity: l.units, valueMinor: l.valueMinor }) : null;
            return (
              <li key={b.uid} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base p-3">
                {b.nuevo ? (
                  <FichaCorta
                    nuevo={b.nuevo}
                    categorias={categorias}
                    errores={errores}
                    i={i}
                    onCambiar={(c) => cambiarNuevo(b.uid, c)}
                    onQuitar={lineas.length > 1 ? () => setLineas((ls) => ls.filter((x) => x.uid !== b.uid)) : null}
                  />
                ) : (
                <div className="flex items-end gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className={ETIQUETA}>Producto</span>
                    <select
                      className={cn(CAMPO, errores[`${i}.productId`] ? "border-state-crit" : "border-line")}
                      value={b.productId}
                      onChange={(e) => cambiar(b.uid, { productId: e.target.value, unidades: e.target.value ? bultoDe(e.target.value) : b.unidades })}
                    >
                      <option value="">Elige un producto…</option>
                      {contables.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} · quedan {c.existencia ?? 0}
                          {c.activo ? "" : " (apartado)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Quitar la línea ${i + 1}`}
                      onClick={() => setLineas((ls) => ls.filter((x) => x.uid !== b.uid))}
                      className="grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-state-crit-bg hover:text-state-crit"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
                )}
                {/* Por abajo: con la etiqueta en dos renglones, los tres campos siguen en una línea. */}
                <div className="grid grid-cols-3 items-end gap-2">
                  <Input label="Bultos" surface="admin" type="number" min={1} step={1} inputMode="numeric" className="tnum" value={b.bultos} error={errores[`${i}.bultos`]} onChange={(e) => cambiar(b.uid, { bultos: e.target.value })} />
                  <Input label="Unidades por bulto" surface="admin" type="number" min={1} step={1} inputMode="numeric" className="tnum" value={b.unidades} error={errores[`${i}.unidadesPorBulto`]} onChange={(e) => cambiar(b.uid, { unidades: e.target.value })} />
                  <Input label="Costo del bulto ($)" surface="admin" inputMode="decimal" className="tnum" placeholder="0,00" value={b.costo} error={errores[`${i}.costoBultoMinor`]} onChange={(e) => cambiar(b.uid, { costo: e.target.value })} />
                </div>
                <p className="tnum text-[12.5px] text-ink-2">
                  {l ? (
                    <>
                      Entran <strong className="text-ink">{l.units}</strong> {l.units === 1 ? "unidad" : "unidades"} por {usd(money(l.valueMinor, "USD"))}
                      {unitario !== null && <span className="text-ink-3"> · {usd(money(unitario, "USD"))} c/u</span>}
                      {p?.costoPromedio && <span className="text-ink-3"> · hoy cuestan {usd(minor(p.costoPromedio))} de promedio</span>}
                    </>
                  ) : (
                    <span className="text-ink-3">{errores[`${i}.productId`] ?? (b.nuevo ? "Completa la ficha y escribe bultos, unidades y costo." : "Elige el producto y escribe bultos, unidades y costo.")}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="neutral" surface="admin" className="gap-1.5" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}>
            <Plus size={15} aria-hidden="true" />
            Añadir producto
          </Button>
          {puedeCrear && (
            <Button type="button" variant="ghost" surface="admin" className="gap-1.5" onClick={() => setLineas((ls) => [...ls, lineaDeAlta()])}>
              <Sparkles size={15} aria-hidden="true" />
              Producto nuevo
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** La ficha corta de un producto nuevo dentro de la entrada (B9-6): nace a la venta como «Producto». */
function FichaCorta({
  nuevo: n,
  categorias,
  errores,
  i,
  onCambiar,
  onQuitar,
}: {
  nuevo: Nuevo;
  categorias: readonly string[];
  errores: Readonly<Record<string, string>>;
  i: number;
  onCambiar: (c: Partial<Nuevo>) => void;
  onQuitar: (() => void) | null;
}) {
  const problema = n.codigo.trim() === "" ? null : barcodeProblem(normalizeBarcode(n.codigo));
  const error = (campo: string) => errores[`${i}.nuevo.${campo}`];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-brand">
          <Sparkles size={13} aria-hidden="true" />
          Producto nuevo: nace a la venta con este stock
        </span>
        {onQuitar && (
          <button
            type="button"
            aria-label={`Quitar la línea ${i + 1}`}
            onClick={onQuitar}
            className="grid size-8 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-state-crit-bg hover:text-state-crit"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <Input label="Nombre" surface="admin" autoComplete="off" placeholder="Refresco de uva" value={n.nombre} error={error("nombre")} onChange={(e) => onCambiar({ nombre: e.target.value })} />
        <Input label="Categoría" surface="admin" autoComplete="off" placeholder="Bebidas" list={`entrada-categorias-${i}`} value={n.categoria} error={error("categoria")} onChange={(e) => onCambiar({ categoria: e.target.value })} />
        <datalist id={`entrada-categorias-${i}`}>
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Input label="Presentación" surface="admin" autoComplete="off" placeholder="Lata 355 ml" value={n.presentacion} error={error("presentacion")} onChange={(e) => onCambiar({ presentacion: e.target.value })} />
        <Input
          label="Código de barras"
          surface="admin"
          autoComplete="off"
          className="tnum font-mono"
          placeholder="Pásalo por el lector"
          value={n.codigo}
          error={error("codigoBarras") ?? (problema === "DIGITO_DE_CONTROL" ? "El dígito de control no cuadra" : problema === "FORMATO" ? "De 4 a 32 dígitos, letras o guiones" : undefined)}
          onChange={(e) => onCambiar({ codigo: e.target.value })}
        />
        <Input label="Precio de venta ($)" surface="admin" inputMode="decimal" className="tnum" placeholder="1,50" value={n.precio} error={error("precioMinor")} onChange={(e) => onCambiar({ precio: e.target.value })} />
        <label className="flex flex-col gap-1.5">
          <span className={ETIQUETA}>IVA</span>
          <select className={cn(CAMPO, "border-line")} value={n.taxCode} onChange={(e) => onCambiar({ taxCode: e.target.value as TaxCodeDelCatalogo })}>
            <option value="GENERAL">IVA general</option>
            <option value="EXENTA">Exento de IVA</option>
          </select>
        </label>
      </div>
    </div>
  );
}

/** Los problemas del servidor por línea y campo: «lineas.0.costoBultoMinor» → «0.costoBultoMinor». */
function porLinea(problemas: readonly Problema[], lineas: readonly Borrador[]): Record<string, string> {
  const e: Record<string, string> = {};
  for (const p of problemas) {
    if (p.path[0] !== "lineas" || typeof p.path[1] !== "number" || !lineas[p.path[1]]) continue;
    // La ficha corta señala su campo («lineas.1.nuevo.codigoBarras» → «1.nuevo.codigoBarras»).
    const campo = p.path[2] === "nuevo" ? `${p.path[1]}.nuevo.${String(p.path[3] ?? "nombre")}` : `${p.path[1]}.${String(p.path[2] ?? "productId")}`;
    e[campo] ??= p.message === "SIN_CONTROL_DE_STOCK" ? "No lleva existencia" : p.message;
  }
  return e;
}
