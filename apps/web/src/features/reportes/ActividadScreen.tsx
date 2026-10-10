"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Baby, Boxes, CreditCard, LoaderCircle, Search, TriangleAlert, UserRound, UtensilsCrossed } from "lucide-react";
import type { ActividadDelPeriodoDto, CategoriaDeMovimientoDto, MovimientoDelLocalDto, VentaCerradaDto } from "@l2/contracts";
import { CAMPO_DE_FILTRO, Container, FiltroSegmentado, PageHeader, Sheet, TAMANO_ICONO, cn } from "@l2/ui";
import { percentFromBasisPoints } from "@l2/domain-tax";
import { formatTasaVE } from "../cash/tasa-format.ts";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { ActividadPedida } from "./reportes.servidor.ts";
import { FiltroDePeriodo, importe, periodoEnPalabras } from "./informe.tsx";
import { ventaDelMovimiento } from "./reportes.acciones";

/**
 * Panel → Reportes → Movimientos (B11-7, M-37): todo lo que pasó en el periodo, de la caja, el parque, las mesas, el
 * inventario y el personal, los más nuevos primero. Se busca por orden, cliente, cédula, pulsera, persona o monto, y cada
 * fila abre su detalle (una venta, entera: sus líneas, sus pagos, la tasa y quién cobró). El kárdex de un producto sigue,
 * como la vista de inventario.
 */

const RUTA = "/panel/reportes/movimientos";

export const PARTE: Readonly<Record<CategoriaDeMovimientoDto, { nombre: string; Icono: typeof Baby }>> = {
  CAJA: { nombre: "Caja", Icono: CreditCard },
  PARQUE: { nombre: "Parque", Icono: Baby },
  MESAS: { nombre: "Mesas", Icono: UtensilsCrossed },
  INVENTARIO: { nombre: "Inventario", Icono: Boxes },
  PERSONAL: { nombre: "Personal", Icono: UserRound },
};

type Pedido = ActividadPedida["pedido"];

export function direccionDeActividad(p: Pedido): string {
  const q = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  if (p.buscar) q.set("buscar", p.buscar);
  if (p.parte) q.set("parte", p.parte);
  return `${RUTA}?${q.toString()}`;
}

/** Las dos vistas de Movimientos: todo lo del periodo y el kárdex de inventario. */
export function VistaDeMovimientos({ actual, periodo }: { actual: "todo" | "kardex"; periodo: { desde: string; hasta: string } }) {
  const q = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta });
  const vistas = [
    { id: "todo", nombre: "Todo lo del periodo", href: `${RUTA}?${q.toString()}` },
    { id: "kardex", nombre: "Kárdex de inventario", href: `${RUTA}?vista=kardex&${q.toString()}` },
  ] as const;
  return (
    <nav aria-label="Vista de Movimientos" className="mb-4 flex gap-1 rounded-[var(--radius-control)] bg-surface-2 p-1 sm:w-fit">
      {vistas.map((v) => (
        <Link
          key={v.id}
          href={v.href as Route}
          aria-current={v.id === actual ? "page" : undefined}
          className={cn(
            "flex min-h-8 flex-1 items-center justify-center rounded-[var(--radius-control)] px-3 text-detalle whitespace-nowrap no-underline transition-colors",
            v.id === actual ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
          )}
        >
          {v.nombre}
        </Link>
      ))}
    </nav>
  );
}

export function ActividadScreen({ hoy, pedido, informe }: ActividadPedida) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: Pedido) => iniciar(() => router.push(direccionDeActividad(p) as Route));
  // Lo que pasa mientras se mira entra solo.
  useAlCambiar(["cuentas", "ventas", "sala", "pedidos", "turno", "catalogo"], () => router.refresh());
  const [buscar, setBuscar] = useState(pedido.buscar ?? "");
  useEffect(() => setBuscar(pedido.buscar ?? ""), [pedido.buscar]);

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Movimientos" }]}
        titulo="Movimientos"
        descripcion="Todo lo que pasó en el periodo: la caja, el parque, las mesas, el inventario y el personal, con quién y cuándo. Busca por orden, cliente, cédula, pulsera, persona o monto; cada fila abre su detalle."
      />
      <VistaDeMovimientos actual="todo" periodo={pedido} />
      <FiltroDePeriodo key={`${pedido.desde}|${pedido.hasta}`} hoy={hoy} desde={pedido.desde} hasta={pedido.hasta} cargando={cargando} onPeriodo={(p) => ir({ ...pedido, ...p })}>
        <form
          role="search"
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            ir({ ...pedido, buscar: buscar.trim() || null });
          }}
        >
          <label className="flex items-center gap-1.5 text-detalle text-ink-2">
            <Search size={TAMANO_ICONO.texto} aria-hidden="true" />
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              value={buscar}
              maxLength={80}
              placeholder="Orden, cliente, cédula, pulsera, persona o monto"
              onChange={(e) => setBuscar(e.target.value)}
              className={cn(CAMPO_DE_FILTRO, "w-96 max-w-full")}
            />
          </label>
        </form>
      </FiltroDePeriodo>

      {!informe.ok ? (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.problemas?.[0]?.message ?? informe.mensaje}
        </p>
      ) : (
        <Lista informe={informe.valor} pedido={pedido} cargando={cargando} onParte={(parte) => ir({ ...pedido, parte })} />
      )}
    </Container>
  );
}

function Lista({ informe, pedido, cargando, onParte }: { informe: ActividadDelPeriodoDto; pedido: Pedido; cargando: boolean; onParte: (p: CategoriaDeMovimientoDto | null) => void }) {
  const reloj = useReloj();
  const [abierto, setAbierto] = useState<MovimientoDelLocalDto | null>(null);
  const todos = informe.porCategoria.reduce((n, c) => n + c.cantidad, 0);
  return (
    <div className={cn("flex flex-col gap-3 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">
        {periodoEnPalabras(informe.periodo)} · {informe.total} {informe.total === 1 ? "movimiento" : "movimientos"}
        {pedido.buscar ? ` con «${pedido.buscar}»` : ""}
        {informe.total > informe.movimientos.length ? `: se ven los ${informe.movimientos.length} más nuevos, afina la búsqueda` : ""}
      </p>
      <FiltroSegmentado<CategoriaDeMovimientoDto | "TODO">
        etiqueta="Parte del local"
        opciones={[{ id: "TODO", nombre: "Todo", cuenta: todos }, ...informe.porCategoria.map((c) => ({ id: c.categoria, nombre: PARTE[c.categoria].nombre, cuenta: c.cantidad }))]}
        valor={pedido.parte ?? "TODO"}
        onCambiar={(id) => onParte(id === "TODO" ? null : id)}
      />
      {informe.movimientos.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-6 text-center text-detalle text-ink-3">
          {pedido.buscar ? "Nada coincide con la búsqueda en este periodo." : "Nada pasó en este periodo."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-detalle">
            <thead>
              <tr className="bg-surface-2 text-left text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">
                <th scope="col" className="px-3 py-2">Cuándo</th>
                <th scope="col" className="px-3 py-2">Qué</th>
                <th scope="col" className="px-3 py-2">Quién</th>
                <th scope="col" className="px-3 py-2">Orden y cliente</th>
                <th scope="col" className="px-3 py-2">Detalle</th>
                <th scope="col" className="px-3 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {informe.movimientos.map((m) => {
                const { Icono } = PARTE[m.categoria];
                return (
                  <tr key={m.id} className="border-t border-line/60 align-top hover:bg-surface-2/50">
                    <td className="tnum px-3 py-2 whitespace-nowrap text-ink-2">{reloj.diaYHora(Date.parse(m.en))}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setAbierto(m)}
                        className="flex cursor-pointer items-center gap-1.5 text-left font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        <Icono size={TAMANO_ICONO.texto} className="shrink-0" aria-hidden="true" />
                        {m.que}
                      </button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink">
                      {m.quien}
                      {m.autorizo && <span className="block text-nota text-ink-3">autorizó {m.autorizo}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {m.orden !== null && <span className="tnum font-semibold text-ink">#{String(m.orden).padStart(4, "0")}</span>}
                      {m.cliente && (
                        <span className="block text-nota text-ink-3" data-privado="">
                          {m.cliente.nombre}
                          {m.cliente.cedula ? ` · ${m.cliente.cedula}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{m.detalle || "—"}</td>
                    <td className="tnum px-3 py-2 text-right font-semibold whitespace-nowrap text-ink">{m.monto ? importe(m.monto) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Detalle movimiento={abierto} onCerrar={() => setAbierto(null)} />
    </div>
  );
}

/** El detalle de un movimiento: la venta entera, si la tiene; si no, lo que dice su asiento. */
function Detalle({ movimiento: m, onCerrar }: { movimiento: MovimientoDelLocalDto | null; onCerrar: () => void }) {
  const reloj = useReloj();
  const [venta, setVenta] = useState<VentaCerradaDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setVenta(null);
    setError(null);
    if (!m?.ventaId) return;
    let vivo = true;
    ventaDelMovimiento(m.ventaId)
      .then((r) => vivo && (r.ok ? setVenta(r.valor) : setError(r.mensaje)))
      .catch(() => vivo && setError("Sin conexión con el servidor: no se pudo leer la venta."));
    return () => {
      vivo = false;
    };
  }, [m?.id]);
  return (
    <Sheet abierto={m !== null} onCerrar={onCerrar} titulo={m ? `${m.que}${m.orden !== null ? ` · #${String(m.orden).padStart(4, "0")}` : ""}` : ""} {...(m ? { descripcion: `${reloj.diaYHora(Date.parse(m.en))} · ${m.quien}` } : {})}>
      {m && (
        <div className="flex flex-col gap-4 text-detalle">
          {(m.autorizo || m.motivo) && (
            <p className="text-ink-2">
              {m.autorizo ? `Autorizó ${m.autorizo}` : ""}
              {m.autorizo && m.motivo ? ". " : ""}
              {m.motivo ? `Motivo: ${m.motivo}` : ""}
            </p>
          )}
          {m.cliente && (
            <p className="text-ink-2" data-privado="">
              Cliente: <span className="font-semibold text-ink">{m.cliente.nombre}</span>
              {m.cliente.cedula ? ` · ${m.cliente.cedula}` : ""}
            </p>
          )}
          {m.ventaId ? (
            venta ? (
              <DetalleDeVenta venta={venta} />
            ) : error ? (
              <p role="alert" className="text-state-crit">{error}</p>
            ) : (
              <p role="status" className="flex items-center gap-1.5 text-ink-3">
                <LoaderCircle size={TAMANO_ICONO.texto} className="animate-spin" aria-hidden="true" />
                Leyendo la venta…
              </p>
            )
          ) : m.datos.length === 0 ? (
            <p className="text-ink-3">{m.detalle || "Sin más datos."}</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {m.datos.map((d) => (
                <div key={d.campo} className="contents">
                  <dt className="text-ink-3">{d.campo}</dt>
                  <dd className="text-ink">{d.valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Una venta: sus líneas, sus totales, la tasa, sus pagos y quién cobró; si se anuló o se devolvió algo, también. */
function DetalleDeVenta({ venta: v }: { venta: VentaCerradaDto }) {
  const reloj = useReloj();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2">
        Cobró <span className="font-semibold text-ink">{v.cashier}</span> · {reloj.diaYHora(Date.parse(v.closedAt))}
        {v.personal ? ` · consumo del personal de ${v.personal.nombre}` : ""}
      </p>
      {v.voided && (
        <p className="flex items-center gap-1.5 font-semibold text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.texto} aria-hidden="true" /> Anulada
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line/60 rounded-[var(--radius-control)] border border-line">
        {v.lineas.map((l) => (
          <li key={l.lineId} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <span className="text-ink">
              {l.concept}
              {l.cortesia && <span className="ml-1 text-nota text-ink-3">(cortesía)</span>}
            </span>
            <span className="tnum whitespace-nowrap text-ink">{importe(l.amount)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        <dt className="text-ink-3">Subtotal</dt>
        <dd className="tnum text-right">{importe(v.subtotal)}</dd>
        {v.descuento && (
          <>
            <dt className="text-ink-3">Descuento · {v.descuento.nombre}</dt>
            <dd className="tnum text-right">− {importe(v.descuento.importe)}</dd>
          </>
        )}
        {v.impuestos.map((i) => (
          <div key={i.basisPoints} className="contents">
            <dt className="text-ink-3">IVA {percentFromBasisPoints(i.basisPoints)} %{v.ivaIncluido ? " (incluido)" : ""}</dt>
            <dd className="tnum text-right">{importe(i.tax)}</dd>
          </div>
        ))}
        {BigInt(v.igtf.amount.minor) > 0n && (
          <>
            <dt className="text-ink-3">IGTF</dt>
            <dd className="tnum text-right">{importe(v.igtf.amount)}</dd>
          </>
        )}
        <dt className="font-semibold text-ink">Total</dt>
        <dd className="tnum text-right font-semibold text-ink">{importe(v.total)}</dd>
        {v.tasa && (
          <>
            <dt className="text-ink-3">Tasa del cobro</dt>
            <dd className="tnum text-right">Bs. {formatTasaVE(v.tasa.value)}</dd>
          </>
        )}
      </dl>
      <div>
        <p className="mb-1 text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">Pagos</p>
        <ul className="flex flex-col gap-0.5">
          {v.payments.map((p, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-ink">
                {p.label}
                {p.referencia && (
                  <span className="ml-1 text-nota text-ink-3" data-privado="">
                    {p.referencia}
                  </span>
                )}
              </span>
              <span className="tnum text-ink">{importe(p.paid)}</span>
            </li>
          ))}
          {v.sobra && (
            <li className="flex items-baseline justify-between gap-3 text-ink-3">
              <span>{v.sobra.destino === "VUELTO" ? "Vuelto" : v.sobra.destino === "PROPINA" ? "Propina" : "Redondeo a caja"}</span>
              <span className="tnum">{importe(v.sobra.amount)}</span>
            </li>
          )}
        </ul>
      </div>
      {v.devoluciones.length > 0 && (
        <p className="text-state-warn">
          Devuelto: {v.devoluciones.map((d) => importe(d.total)).join(" + ")}
        </p>
      )}
    </div>
  );
}
