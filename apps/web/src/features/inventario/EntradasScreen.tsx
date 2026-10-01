"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackagePlus, Plus, TriangleAlert, Truck, X } from "lucide-react";
import type { CatalogoDto, EntradaDto, EntradasDto, Problema, ProductoDto, TipoEntrada } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { averageUnitCostMinor, entryLineTotals } from "@l2/domain-inventory";
import { money, sum, toMajor, type Money } from "@l2/domain-money";
import { Button, Container, Input, PageHeader, Sheet, avisar, cn, formatMoneyVE } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { registrarEntrada } from "./entradas.acciones";

/**
 * Panel → Inventario → Entradas de mercancía (B9-3, F8-06). Lo que llega, por compra o reposición:
 * tantos bultos de tantas unidades a tanto el bulto. Sube la existencia y da el costo promedio de
 * cada producto. Una entrada no se edita ni se borra: un error se corrige con otro movimiento (B9-4).
 * Quién puede y si cada línea vale lo decide el servidor.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "min-h-9 w-full rounded-[var(--radius-control)] border bg-surface px-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

const usd = (m: Money) => formatMoneyVE(toMajor(m), "USD");
const minor = (m: { minor: string }) => money(BigInt(m.minor), "USD");
const NOMBRE_TIPO: Readonly<Record<TipoEntrada, string>> = { COMPRA: "Compra", REPOSICION: "Reposición" };

/** Una línea del borrador: lo tecleado, sin convertir hasta que se entiende. */
type Borrador = { uid: string; productId: string; bultos: string; unidades: string; costo: string };

const nuevaLinea = (productId = "", unidades = "1"): Borrador => ({ uid: globalThis.crypto.randomUUID(), productId, bultos: "1", unidades, costo: "" });

/** Lo que dice una línea del borrador si se entiende; `null` si falta algo o está mal escrito. */
function lineaDe(b: Borrador) {
  const bultos = Number(b.bultos);
  const unidades = Number(b.unidades);
  const costo = b.costo.trim() === "" ? null : importeTecleado(b.costo, "USD");
  if (!b.productId || !Number.isInteger(bultos) || bultos < 1 || !Number.isInteger(unidades) || unidades < 1 || !costo || costo.amount < 0n) return null;
  const t = entryLineTotals({ packs: bultos, packSize: unidades, packCostMinor: costo.amount });
  return { productId: b.productId, bultos, unidadesPorBulto: unidades, costoBultoMinor: String(costo.amount), ...t };
}

export function EntradasScreen({ catalogo, entradas: inicial }: { catalogo: CatalogoDto; entradas: EntradasDto | null }) {
  const actor = useActorEnSesion();
  const puedeRecibir = actor !== null && can(actor, "inventario.entrada") !== "DENEGADO";
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
          puedeRecibir && contables.length > 0 && (
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
      ) : contables.length === 0 ? (
        <Vacio titulo="Ningún producto lleva existencia" detalle="Enciende «Lleva existencia» en Inventario → Productos para los que se venden tal cual (refrescos, golosinas, juguetes)." />
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
  inicial,
  onCerrar,
  onRegistrada,
}: {
  contables: readonly ProductoDto[];
  porId: ReadonlyMap<string, ProductoDto>;
  inicial: string | null;
  onCerrar: () => void;
  onRegistrada: (e: EntradaDto) => void;
}) {
  const bultoDe = (id: string) => String(porId.get(id)?.ultimoBulto ?? 1);
  const [tipo, setTipo] = useState<TipoEntrada>("COMPRA");
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [lineas, setLineas] = useState<Borrador[]>(() => [nuevaLinea(inicial ?? "", inicial ? bultoDe(inicial) : "1")]);
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // La clave del envío: un doble clic o un reintento tras un corte no cargan dos veces lo mismo.
  const [clave, setClave] = useState(() => globalThis.crypto.randomUUID());

  const entendidas = lineas.map(lineaDe);
  const listas = entendidas.every((l) => l !== null);
  const repetido = new Set(lineas.map((l) => l.productId).filter(Boolean)).size !== lineas.filter((l) => l.productId).length;
  const total = sum(
    entendidas.flatMap((l) => (l ? [money(l.valueMinor, "USD")] : [])),
    "USD",
  );

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
      const r = await registrarEntrada({
        idempotencyKey: clave,
        tipo,
        ...(tipo === "COMPRA" && proveedor.trim() ? { proveedor: proveedor.trim() } : {}),
        ...(tipo === "COMPRA" && factura.trim() ? { factura: factura.trim() } : {}),
        lineas: entendidas.map((l) => ({ productId: l!.productId, bultos: l!.bultos, unidadesPorBulto: l!.unidadesPorBulto, costoBultoMinor: l!.costoBultoMinor })),
      });
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
          {!listas && !enviando && <p className="text-right text-[12px] text-ink-3">Falta elegir el producto o escribir bultos, unidades y costo de alguna línea.</p>}
          {repetido && <p className="text-right text-[12px] text-state-warn">Un producto va una vez: suma sus bultos en una sola línea.</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
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
                    <span className="text-ink-3">{errores[`${i}.productId`] ?? "Elige el producto y escribe bultos, unidades y costo."}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
        <Button type="button" variant="neutral" surface="admin" className="gap-1.5 self-start" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}>
          <Plus size={15} aria-hidden="true" />
          Añadir producto
        </Button>
      </div>
    </Sheet>
  );
}

/** Los problemas del servidor por línea y campo: «lineas.0.costoBultoMinor» → «0.costoBultoMinor». */
function porLinea(problemas: readonly Problema[], lineas: readonly Borrador[]): Record<string, string> {
  const e: Record<string, string> = {};
  for (const p of problemas) {
    if (p.path[0] !== "lineas" || typeof p.path[1] !== "number" || !lineas[p.path[1]]) continue;
    const campo = `${p.path[1]}.${String(p.path[2] ?? "productId")}`;
    e[campo] ??= p.message === "SIN_CONTROL_DE_STOCK" ? "No lleva existencia" : p.message;
  }
  return e;
}
