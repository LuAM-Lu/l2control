"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Ban, FileText, MessageCircle, Printer, ReceiptText, Search, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { money, sum, toMajor } from "@l2/domain-money";
import type { Rechazo, VentaCerradaDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Button, MoneyDisplay, avisar, cn, formatMoneyVE } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { AnularCobroDialog, type PedidoDeAnulacion } from "./AnularCobroDialog.tsx";
import { DevolverVentaDialog } from "./DevolverVentaDialog.tsx";
import { buscarVentaPorOrden } from "./ventas.acciones";
import { textoDinero, textoMotivo } from "./anulacion.ts";
import { reciboDeVenta, ordenDe } from "./recibo.ts";
import { useHora, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAtajos } from "./atajos.ts";
import { PistaTecla } from "./AtajosDialog.tsx";
import { ReciboDialog, ReciboImpreso } from "./ReciboDialog.tsx";
import { useVentas } from "./VentasProvider.tsx";
import { EstadoDeImpresion } from "../impresion/ColaProvider.tsx";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";

/** Los medios usados en una venta, sin repetir. */
const mediosDe = (v: VentaCerradaDto) => [...new Set(v.payments.map((p) => p.label))];

/**
 * Ventas del turno — UX-MEJORAS §9 (C12), en el servidor desde B3-4. Desde M-13 viven dentro de la sección Turno, entre el
 * resumen del turno y su cierre: esta pieza no tiene página propia.
 *
 * Maestro-detalle, como la caja: a la izquierda los cobros cerrados, del más
 * reciente al más antiguo; a la derecha el recibo de la elegida, tal como sale
 * en papel, con quién lo imprimió y cuándo.
 *
 * REIMPRIMIR ES UNA COPIA, Y DEJA RASTRO. El recibo no fiscal se reimprime sin
 * pedir autorización, pero sale marcado «COPIA» y cada impresión queda con su
 * hora y su persona (§5.4). La copia de la factura FISCAL es otra cosa: 🔐 de
 * supervisor (§7.3), y llega con F3.
 *
 * Sin atajo de teclado para reimprimir, a propósito: una impresión auditada no
 * debe salir por una tecla pulsada sin querer.
 *
 * Las ventas son las del turno abierto de este equipo (la cajera ve las suyas);
 * lo cobrado en el día entero sale en Inicio con B3-5.
 */

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function filtrar(ventas: readonly VentaCerradaDto[], texto: string, medio: string | null) {
  const q = sinAcentos(texto.trim()).replace(/^#/, "");
  return ventas.filter((v) => {
    if (medio && !mediosDe(v).includes(medio)) return false;
    if (q === "") return true;
    const numero = String(v.orderNumber ?? "");
    return sinAcentos(nombreDeCuenta(v.cuenta)).includes(q) || (/^\d+$/.test(q) && numero.includes(q));
  });
}

export function VentasDelTurno({ className }: { className?: string }) {
  const hora = useHora();
  const { ajustes } = useSucursal();
  const { ventas, imprimir: imprimirEnServidor, adoptar } = useVentas();
  const { anular: anularEnServidor } = useCuentas();
  /** La clave de la anulación en curso de cada venta: un reintento (un PIN mal tecleado) no anula dos veces. */
  const claves = useRef(new Map<string, string>());
  const router = useRouter();
  const [anulando, setAnulando] = useState(false);
  const actor = useActorEnSesion();
  const puedeAnular = actor !== null && can(actor, "cobro.anular") !== "DENEGADO";
  /** B3-14: un cliente devuelve parte de lo que compró; la venta de otro día se busca por su número. */
  const puedeDevolver = actor !== null && can(actor, "venta.devolver") !== "DENEGADO";
  const [devolviendo, setDevolviendo] = useState<VentaCerradaDto | null>(null);
  const [ordenBuscada, setOrdenBuscada] = useState("");
  async function buscarParaDevolver() {
    const n = Number(ordenBuscada.replace(/\D/g, ""));
    if (!Number.isInteger(n) || n <= 0) return;
    const r = await buscarVentaPorOrden(n).catch(() => null);
    if (!r) return avisar.error("Sin conexión con el servidor: no se pudo buscar la venta.");
    if (!r.ok) return avisar.error(r.mensaje);
    if (!r.valor) return avisar.info(`No hay una venta con la orden #${String(n).padStart(4, "0")}.`);
    if (r.valor.voided) return avisar.info(`La orden #${String(n).padStart(4, "0")} está anulada: no hay nada que devolver.`);
    setDevolviendo(r.valor);
  }
  const [texto, setTexto] = useState("");
  const [medio, setMedio] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const medios = useMemo(() => [...new Set(ventas.flatMap(mediosDe))], [ventas]);
  const visibles = useMemo(() => filtrar(ventas, texto, medio), [ventas, texto, medio]);
  const actual = visibles.find((v) => v.id === elegida) ?? visibles[0] ?? null;
  // Lo cobrado no cuenta lo anulado ni lo devuelto (B3-14): ese dinero volvió al cliente.
  const total = useMemo(
    () =>
      sum(
        ventas
          .filter((v) => !v.voided)
          .flatMap((v) => [money(BigInt(v.total.minor), "USD"), ...v.devoluciones.map((d) => money(-BigInt(d.total.minor), "USD"))]),
        "USD",
      ),
    [ventas],
  );
  const anuladas = ventas.filter((v) => v.voided).length;

  /**
   * Anula el cobro en el servidor (DEC-24, B3-3): él comprueba la autorización, revierte cada
   * asiento del libro y devuelve a la cola lo que pagó. Solo si lo confirma se anota la anulación
   * en la venta, con cómo volvió el dinero de cada pago.
   */
  async function aplicarAnulacion(v: VentaCerradaDto, pedido: PedidoDeAnulacion, autorizacion: unknown): Promise<Rechazo | null> {
    const clave = claves.current.get(v.id) ?? globalThis.crypto.randomUUID();
    claves.current.set(v.id, clave);
    const r = await anularEnServidor({ idempotencyKey: clave, accountId: v.accountId, cobroKey: v.cobroKey, ...pedido }, autorizacion);
    if (!r.ok) return r;
    claves.current.delete(v.id);
    adoptar(r.valor.venta);
    setAnulando(false);
    const cuenta = r.valor.cuenta;
    const devoluciones = (r.valor.venta.voided?.refunds ?? [])
      .map((x) => {
        const p = v.payments[x.paymentIndex]!;
        return `${textoDinero(x.amount)} ${p.cash || x.via === "EFECTIVO" ? "en efectivo" : `por ${p.label}`}`;
      })
      .join(" · ");
    const enCola = cuenta.status === "POR_COBRAR";
    avisar.ok(`Orden ${ordenDe(v.orderNumber)} anulada`, {
      detalle: `${devoluciones ? `Devolver ${devoluciones}.` : ""}${enCola ? " La cuenta volvió a «por cobrar»." : ""}`.trim(),
      ...(enCola ? { accion: { texto: "Ir a cobrar", alPulsar: () => router.push(`/caja?cuenta=${cuenta.id}` as Route) } } : {}),
    });
    return null;
  }

  /**
   * Manda el recibo a la impresora (B5-2): el servidor lo pone en la cola, dice si es el original o una
   * copia (§5.4) y lo anota con quién y cuándo. Cómo va el papel se ve en el detalle de la venta.
   */
  async function imprimir(v: VentaCerradaDto) {
    const copia = v.prints.length > 0;
    const r = await imprimirEnServidor(v.id);
    if (!r.ok) {
      avisar.error(r.mensaje, { detalle: "No se mandó a imprimir." });
      return;
    }
    avisar.info(copia ? `Copia del recibo ${ordenDe(v.orderNumber)} enviada a la impresora` : `Recibo ${ordenDe(v.orderNumber)} enviado a la impresora`, {
      detalle: "Queda anotada con tu nombre y la hora.",
    });
  }

  useAtajos((t) => {
    if (t.ctrl) return false;
    if (t.key === "/") {
      buscadorRef.current?.focus();
      return true;
    }
    if (t.key === "ArrowUp" || t.key === "ArrowDown") {
      if (visibles.length === 0) return false;
      const i = visibles.findIndex((v) => v.id === actual?.id);
      const j = t.key === "ArrowDown" ? Math.min(visibles.length - 1, i + 1) : Math.max(0, i - 1);
      setElegida(visibles[i < 0 ? 0 : j]!.id);
      return true;
    }
    return false;
  });

  return (
    <>
      <div className={cn("grid min-w-0 gap-4 apaisado:min-h-0 apaisado:grid-cols-[minmax(0,1fr)_clamp(300px,26vw,400px)]", className)}>
        {/* ══════════════ la lista ══════════════ */}
        <section
          aria-label="Ventas cerradas"
          className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
            <h2 className="font-display text-[16px] font-bold whitespace-nowrap text-ink">
              Ventas del turno <span className="tnum ml-1 text-[13px] font-semibold text-ink-3">{ventas.length}</span>
            </h2>
            <p className="flex items-baseline gap-2 text-[12px] text-ink-3">
              Cobrado
              <MoneyDisplay value={toMajor(total)} currency="USD" size="md" />
              {anuladas > 0 && <span className="tnum">· {anuladas} {anuladas === 1 ? "anulada" : "anuladas"}</span>}
            </p>
          </div>

          {puedeDevolver && (
            <form
              className="flex items-center gap-2 border-b border-line/40 px-3 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                void buscarParaDevolver();
              }}
            >
              <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base px-2.5 text-[13px] focus-within:border-brand">
                <Undo2 size={15} className="shrink-0 text-ink-3" aria-hidden="true" />
                <span className="sr-only">Devolver de otra venta: su número de orden</span>
                <input
                  inputMode="numeric"
                  value={ordenBuscada}
                  onChange={(e) => setOrdenBuscada(e.target.value.replace(/[^\d#]/g, ""))}
                  placeholder="Devolver de otra venta: #orden"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
                />
              </label>
              <Button type="submit" surface="tablet" variant="neutral" disabled={!ordenBuscada.replace(/\D/g, "")}>
                Buscar
              </Button>
            </form>
          )}
          <div className="flex flex-col gap-2 border-b border-line/40 p-3 sm:flex-row sm:items-center">
            <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base px-2.5 focus-within:border-brand">
              <Search size={15} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="sr-only">Buscar por familia o número de orden</span>
              <input
                ref={buscadorRef}
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTexto("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Familia o #orden"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
              />
              <PistaTecla tecla="/" />
              {texto !== "" && (
                <button
                  type="button"
                  onClick={() => setTexto("")}
                  aria-label="Borrar la búsqueda"
                  className="grid size-14 shrink-0 cursor-pointer place-content-center rounded text-ink-3 hover:text-ink"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </label>
            <div role="radiogroup" aria-label="Medio de pago" className="flex gap-1 overflow-x-auto">
              {[null, ...medios].map((m) => (
                <button
                  key={m ?? "todos"}
                  type="button"
                  role="radio"
                  aria-checked={medio === m}
                  onClick={() => setMedio(m)}
                  className={cn(
                    "min-h-14 shrink-0 cursor-pointer rounded-[var(--radius-control)] px-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
                    medio === m ? "bg-surface-2 text-ink ring-1 ring-line-strong" : "text-ink-3 hover:text-ink",
                  )}
                >
                  {m ?? "Todos"}
                </button>
              ))}
            </div>
          </div>

          {ventas.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <ReceiptText size={28} className="text-ink-3" aria-hidden="true" />
              <p className="font-display text-lg font-bold text-ink">Aún no hay ventas en este turno</p>
              <Link
                href="/caja"
                className="flex min-h-14 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline hover:border-brand/45 hover:text-ink"
              >
                Ir a cobrar
              </Link>
            </div>
          ) : visibles.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-3">Ninguna venta coincide con la búsqueda.</p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-surface text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pl-4 text-left font-semibold">Orden</th>
                    <th scope="col" className="py-2 text-left font-semibold">Hora</th>
                    <th scope="col" className="py-2 text-left font-semibold">Cuenta</th>
                    <th scope="col" className="hidden py-2 text-left font-semibold md:table-cell">Medios</th>
                    <th scope="col" className="py-2 text-right font-semibold">Total</th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">
                      <span className="sr-only">Impresiones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((v) => {
                    const activa = v.id === actual?.id;
                    return (
                      <tr
                        key={v.id}
                        aria-selected={activa}
                        onClick={() => setElegida(v.id)}
                        className={cn(
                          "cursor-pointer border-b border-dashed border-line/60 transition-colors",
                          activa ? "bg-brand/20" : "hover:bg-surface-2/60",
                        )}
                      >
                        <td className="py-0 pl-4">
                          {/* El botón da la fila al teclado y a los lectores de pantalla. */}
                          <button
                            type="button"
                            onClick={() => setElegida(v.id)}
                            aria-pressed={activa}
                            aria-label={`Orden ${ordenDe(v.orderNumber)}, ${nombreDeCuenta(v.cuenta)}, ${textoDinero(v.total)}`}
                            className="tnum min-h-12 cursor-pointer font-bold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            {ordenDe(v.orderNumber)}
                          </button>
                        </td>
                        <td className="tnum text-ink-2">{hora(Date.parse(v.closedAt))}</td>
                        <td className="max-w-0 truncate pr-2 text-ink">{nombreDeCuenta(v.cuenta)}</td>
                        <td className="hidden max-w-0 truncate pr-2 text-ink-3 md:table-cell">{mediosDe(v).join(" · ")}</td>
                        <td className={cn("tnum text-right font-semibold", v.voided ? "text-ink-3 line-through" : "text-ink")}>
                          {formatMoneyVE(toMajor(money(BigInt(v.total.minor), "USD")), "USD")}
                        </td>
                        <td className="pr-4 text-right">
                          {v.voided ? (
                            <span className="ml-2 inline-flex items-center gap-1 rounded border border-line-strong px-1.5 text-[11px] font-semibold whitespace-nowrap text-ink-2">
                              <Ban size={11} aria-hidden="true" />
                              Anulada
                            </span>
                          ) : v.prints.length > 1 && (
                            <span className="tnum ml-2 inline-flex items-center gap-1 text-[11px] whitespace-nowrap text-ink-3" title="Copias impresas">
                              <Printer size={11} aria-hidden="true" />
                              {v.prints.length - 1} {v.prints.length === 2 ? "copia" : "copias"}
                            </span>
                          )}
                          {v.desdePapel && (
                            <span
                              className="ml-2 inline-flex items-center gap-1 rounded border border-brand/40 bg-brand/10 px-1.5 text-[11px] font-semibold whitespace-nowrap text-brand"
                              title="Cargada desde papel: la hora es la que se anotó en el formulario"
                            >
                              <FileText size={11} aria-hidden="true" />
                              Desde papel
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ══════════════ el recibo ══════════════ */}
        <aside
          aria-label="Recibo de la venta"
          className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card"
        >
          {actual ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <ReciboImpreso recibo={reciboDeVenta(actual, ajustes)} copia={actual.prints.length > 0} anulada={Boolean(actual.voided)} className="max-w-none" />
              </div>
              {/* La anulación, entera: por qué, quién y cómo volvió el dinero. */}
              {actual.voided && (
                <div className="border-t border-line px-4 py-2 text-[12px] text-ink-2">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <Ban size={13} aria-hidden="true" />
                    Anulada a las {hora(Date.parse(actual.voided.at))} · {textoMotivo(actual.voided.reason)}
                  </p>
                  <p className="text-ink-3">
                    Autorizó {actual.voided.authorizedBy.name} ({actual.voided.authorizedBy.role === "ADMIN" ? "administración" : "supervisión"})
                    {` · pidió ${actual.voided.requestedBy}`}
                    {actual.voided.note ? ` · «${actual.voided.note}»` : ""}
                  </p>
                  <ul className="tnum mt-0.5 text-ink-3">
                    {actual.voided.refunds.map((r) => {
                      const p = actual.payments[r.paymentIndex]!;
                      return (
                        <li key={r.paymentIndex}>
                          {p.label}: {textoDinero(r.amount)} {p.cash || r.via === "EFECTIVO" ? "en efectivo" : `por ${p.label}`}
                          {r.reference ? ` · Ref. ${r.reference}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {/* B3-14: lo que el cliente devolvió, con lo que volvió por cada pago. */}
              {actual.devoluciones.map((d) => (
                <div key={d.id} className="border-t border-line px-4 py-2 text-[12px] text-ink-2">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <Undo2 size={13} aria-hidden="true" />
                    Devolución a las {hora(Date.parse(d.at))} · {textoDinero(d.total)}
                  </p>
                  <p className="text-ink-3">
                    {d.lineas.length} {d.lineas.length === 1 ? "cosa" : "cosas"}: {[...new Set(d.lineas.map((l) => l.concept))].join(", ")} · «{d.motivo}» · {d.por}
                    {d.autorizo && d.autorizo !== d.por ? `, autorizó ${d.autorizo}` : ""}
                  </p>
                  <ul className="tnum mt-0.5 text-ink-3">
                    {d.reintegros.map((r) => (
                      <li key={r.paymentIndex}>
                        {actual.payments[r.paymentIndex]?.label ?? "Pago"}: {textoDinero(r.amount)}
                        {r.reference ? ` · Ref. ${r.reference}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {/* Lo cargado desde papel (B3-7): la hora del recibo es la anotada; aquí, cuándo se cargó. */}
              {actual.desdePapel && (
                <div className="border-t border-line px-4 py-2 text-[12px] text-ink-2">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <FileText size={13} aria-hidden="true" />
                    Cargada desde papel
                  </p>
                  <p className="tnum text-ink-3">
                    Ocurrió a las {hora(Date.parse(actual.desdePapel.ocurrioEn))} · se cargó a las {hora(Date.parse(actual.desdePapel.cargadoEn))}.
                  </p>
                </div>
              )}
              {/* El rastro, a la vista: quién imprimió y cuándo. */}
              <div className="border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
                {actual.prints.length === 0 ? (
                  "Sin imprimir todavía: la primera impresión es el original."
                ) : (
                  <details>
                    <summary className="cursor-pointer py-1">
                      Impreso {actual.prints.length} {actual.prints.length === 1 ? "vez" : "veces"} · la última a las{" "}
                      {hora(Date.parse(actual.prints.at(-1)!.at))}
                    </summary>
                    <ol className="flex flex-col gap-0.5 pb-1">
                      {actual.prints.map((p, i) => (
                        <li key={i} className="tnum">
                          {i === 0 ? "Original" : `Copia ${i}`} · {hora(Date.parse(p.at))} · {p.by}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              <EstadoDeImpresion ventaId={actual.id} className="border-t border-line px-4" />
              {actual.voided ? (
                <p className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3">
                  Un cobro anulado no se reimprime ni se envía: su recibo ya no vale.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 border-t border-line p-3">
                  <Button surface="pos" variant="neutral" onClick={() => setEnviando(true)}>
                    <MessageCircle size={17} aria-hidden="true" />
                    WhatsApp
                  </Button>
                  <Button surface="pos" variant="primary" onClick={() => void imprimir(actual)}>
                    <Printer size={17} aria-hidden="true" />
                    {actual.prints.length > 0 ? "Reimprimir" : "Imprimir"}
                  </Button>
                  {/* Destructivo y auditado: discreto, lejos del botón principal y
                      con su propia confirmación. Solo para quien puede pedirlo. */}
                  {puedeDevolver && !actual.parte && (
                    <Button surface="tablet" variant="neutral" className="col-span-2 text-[13px]" onClick={() => setDevolviendo(actual)}>
                      <Undo2 size={15} aria-hidden="true" />
                      Devolver…
                    </Button>
                  )}
                  {puedeAnular && actual.devoluciones.length === 0 && (
                    <Button surface="tablet" variant="ghost" className="col-span-2 text-[13px]" onClick={() => setAnulando(true)}>
                      <Ban size={15} aria-hidden="true" />
                      Anular cobro…
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="m-auto px-6 py-10 text-center text-[13px] text-ink-3">Elige una venta para ver su recibo.</p>
          )}
        </aside>
      </div>

      <AnularCobroDialog
        venta={anulando && actual && !actual.voided ? actual : null}
        ventas={ventas}
        onAnular={aplicarAnulacion}
        onCerrar={() => setAnulando(false)}
      />

      <DevolverVentaDialog
        venta={devolviendo}
        onCerrar={() => setDevolviendo(null)}
        onHecha={(h) => {
          adoptar(h.venta);
          setDevolviendo(null);
          const d = h.venta.devoluciones.at(-1);
          avisar.ok(`Devolución de la orden ${ordenDe(h.venta.orderNumber)}`, {
            detalle: `${d ? `Se devuelve ${textoDinero(d.total)}: ${d.reintegros.map((r) => `${textoDinero(r.amount)} por ${h.venta.payments[r.paymentIndex]?.label ?? "su pago"}`).join(" · ")}.` : ""}${h.comprobanteNoImpreso ? ` El comprobante no salió: ${h.comprobanteNoImpreso}` : " El comprobante sale en la impresora de caja."}`,
          });
        }}
      />

      <ReciboDialog
        recibo={enviando && actual ? reciboDeVenta(actual, ajustes) : null}
        copia={actual ? actual.prints.length > 0 : false}
        ventaId={actual?.id}
        onImprimir={async () => {
          if (!actual) return null;
          const r = await imprimirEnServidor(actual.id);
          return r.ok ? null : r.mensaje;
        }}
        onCerrar={() => setEnviando(false)}
      />
    </>
  );
}
