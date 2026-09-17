"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Ban, MessageCircle, Printer, ReceiptText, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { money, sum, toMajor } from "@l2/domain-money";
import type { AnulacionDto, UserSummaryDto, VentaCerradaDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Button, Container, MoneyDisplay, avisar, cn, formatMoneyVE } from "@l2/ui";
import { useOperador } from "../identity/operador.ts";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { revertirCobro } from "../cuentas/cuentas.ts";
import { AnularCobroDialog } from "./AnularCobroDialog.tsx";
import { enmascarar, textoDinero, textoMotivo } from "./anulacion.ts";
import { formatClock } from "../park/time-format.ts";
import { useAtajos } from "./atajos.ts";
import { PistaTecla } from "./AtajosDialog.tsx";
import { ReciboDialog, ReciboImpreso } from "./ReciboDialog.tsx";
import { useVentas } from "./VentasProvider.tsx";

/**
 * Ventas del turno — UX-MEJORAS §9 (C12).
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
 * TODO(F4-05/backend): las ventas son las del turno abierto; la cajera ve las
 * suyas y el supervisor las de todos. Hoy son las de esta sesión.
 */

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function filtrar(ventas: readonly VentaCerradaDto[], texto: string, medio: string | null) {
  const q = sinAcentos(texto.trim()).replace(/^#/, "");
  return ventas.filter((v) => {
    if (medio && !v.methods.includes(medio)) return false;
    if (q === "") return true;
    const numero = String(v.orderNumber ?? "");
    return sinAcentos(v.recibo.cuenta).includes(q) || (/^\d+$/.test(q) && numero.includes(q));
  });
}

export function VentasScreen({ usuarios }: { usuarios: readonly UserSummaryDto[] }) {
  const { ventas, anotarImpresion, anular } = useVentas();
  const { cuentas, guardar } = useCuentas();
  const router = useRouter();
  const operador = useOperador();
  const [anulando, setAnulando] = useState(false);
  const actor = useActorEnSesion();
  const puedeAnular = actor !== null && can(actor, "cobro.anular") !== "DENEGADO";
  const [texto, setTexto] = useState("");
  const [medio, setMedio] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const medios = useMemo(() => [...new Set(ventas.flatMap((v) => v.methods))], [ventas]);
  const visibles = useMemo(() => filtrar(ventas, texto, medio), [ventas, texto, medio]);
  const actual = visibles.find((v) => v.id === elegida) ?? visibles[0] ?? null;
  // Lo cobrado no cuenta lo anulado: ese dinero volvió al cliente.
  const total = useMemo(
    () => sum(ventas.filter((v) => !v.voided).map((v) => money(BigInt(v.total.minor), "USD")), "USD"),
    [ventas],
  );
  const anuladas = ventas.filter((v) => v.voided).length;

  /**
   * Aplica la anulación (DEC-24). Orden fail-closed: primero se comprueba que
   * la cuenta puede volver a «por cobrar», luego se añade la anulación a la
   * venta (valida contra el contrato) y solo entonces se guarda la cuenta. Si
   * algo lanza, no se aplica nada y el diálogo lo muestra.
   */
  function aplicarAnulacion(v: VentaCerradaDto, anulacion: AnulacionDto) {
    const cuenta = cuentas.find((c) => c.id === v.accountId) ?? null;
    const revertida = cuenta ? revertirCobro(cuenta, v.lineIds) : null;
    anular(v.id, anulacion);
    if (revertida) guardar(revertida);
    setAnulando(false);
    const devoluciones = anulacion.refunds
      .map((r) => {
        const p = v.payments[r.paymentIndex]!;
        return `${textoDinero(r.amount)} ${p.cash || r.via === "EFECTIVO" ? "en efectivo" : `por ${p.label}`}`;
      })
      .join(" · ");
    avisar.ok(`Orden ${v.recibo.orden} anulada`, {
      detalle: `Devolver ${devoluciones}.${revertida ? " La cuenta volvió a «por cobrar»." : ""}`,
      ...(revertida ? { accion: { texto: "Ir a cobrar", alPulsar: () => router.push(`/caja?cuenta=${revertida.id}` as Route) } } : {}),
    });
  }

  function imprimir(v: VentaCerradaDto) {
    const copia = v.prints.length > 0;
    // Primero el papel, después el rastro: así el papel dice si ya se había
    // impreso, no la impresión que se está haciendo.
    window.print();
    anotarImpresion(v.id, {
      at: new Date().toISOString(),
      by: operador ? { id: operador.id, name: operador.nombre } : null,
    });
    avisar.info(copia ? `Copia del recibo ${v.recibo.orden} impresa` : `Recibo ${v.recibo.orden} impreso`, {
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
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Ventas del turno</h1>
      <Container
        as="main"
        ancho="muro"
        className="grid flex-1 gap-4 py-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_clamp(340px,28vw,420px)]"
      >
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
                          activa ? "bg-brand/12" : "hover:bg-surface-2/60",
                        )}
                      >
                        <td className="py-0 pl-4">
                          {/* El botón da la fila al teclado y a los lectores de pantalla. */}
                          <button
                            type="button"
                            onClick={() => setElegida(v.id)}
                            aria-pressed={activa}
                            aria-label={`Orden ${v.recibo.orden}, ${v.recibo.cuenta}, ${v.recibo.total}`}
                            className="tnum min-h-12 cursor-pointer font-bold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            {v.recibo.orden}
                          </button>
                        </td>
                        <td className="tnum text-ink-2">{formatClock(Date.parse(v.closedAt))}</td>
                        <td className="max-w-0 truncate pr-2 text-ink">{v.recibo.cuenta}</td>
                        <td className="hidden max-w-0 truncate pr-2 text-ink-3 md:table-cell">{v.methods.join(" · ")}</td>
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
                <ReciboImpreso recibo={actual.recibo} copia={actual.prints.length > 0} anulada={Boolean(actual.voided)} className="max-w-none" />
              </div>
              {/* La anulación, entera: por qué, quién y cómo volvió el dinero. */}
              {actual.voided && (
                <div className="border-t border-line px-4 py-2 text-[12px] text-ink-2">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <Ban size={13} aria-hidden="true" />
                    Anulada a las {formatClock(Date.parse(actual.voided.at))} · {textoMotivo(actual.voided.reason)}
                  </p>
                  <p className="text-ink-3">
                    Autorizó {actual.voided.authorizedBy.name} ({actual.voided.authorizedBy.role === "ADMIN" ? "administración" : "supervisión"})
                    {actual.voided.requestedBy ? ` · pidió ${actual.voided.requestedBy.name}` : ""}
                    {actual.voided.note ? ` · «${actual.voided.note}»` : ""}
                  </p>
                  <ul className="tnum mt-0.5 text-ink-3">
                    {actual.voided.refunds.map((r) => {
                      const p = actual.payments[r.paymentIndex]!;
                      return (
                        <li key={r.paymentIndex}>
                          {p.label}: {textoDinero(r.amount)} {p.cash || r.via === "EFECTIVO" ? "en efectivo" : `por ${p.label}`}
                          {r.reference ? ` · Ref. ${enmascarar(r.reference)}` : ""}
                        </li>
                      );
                    })}
                  </ul>
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
                      {formatClock(Date.parse(actual.prints.at(-1)!.at))}
                    </summary>
                    <ol className="flex flex-col gap-0.5 pb-1">
                      {actual.prints.map((p, i) => (
                        <li key={i} className="tnum">
                          {i === 0 ? "Original" : `Copia ${i}`} · {formatClock(Date.parse(p.at))} · {p.by?.name ?? "sin sesión"}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
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
                  <Button surface="pos" variant="primary" onClick={() => imprimir(actual)}>
                    <Printer size={17} aria-hidden="true" />
                    {actual.prints.length > 0 ? "Reimprimir" : "Imprimir"}
                  </Button>
                  {/* Destructivo y auditado: discreto, lejos del botón principal y
                      con su propia confirmación. Solo para quien puede pedirlo. */}
                  {puedeAnular && (
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
      </Container>

      <AnularCobroDialog
        venta={anulando && actual && !actual.voided ? actual : null}
        ventas={ventas}
        usuarios={usuarios}
        operador={operador}
        onAnular={aplicarAnulacion}
        onCerrar={() => setAnulando(false)}
      />

      <ReciboDialog
        recibo={enviando && actual ? actual.recibo : null}
        copia={actual ? actual.prints.length > 0 : false}
        onImprimir={() =>
          actual &&
          anotarImpresion(actual.id, {
            at: new Date().toISOString(),
            by: operador ? { id: operador.id, name: operador.nombre } : null,
          })
        }
        onCerrar={() => setEnviando(false)}
      />
    </div>
  );
}
