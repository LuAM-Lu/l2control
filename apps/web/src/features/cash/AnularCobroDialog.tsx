"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";
import type { DevolucionDto, MotivoAnulacion, Rechazo, VentaCerradaDto } from "@l2/contracts";
import { Button, Dialog, Input, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { MOTIVOS, efectivoEnGaveta, etiquetaReferencia, textoDinero, textoMotivo } from "./anulacion.ts";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";

/**
 * Anular un cobro ya cerrado — DEC-24, en el servidor desde B3-3 y B3-4.
 *
 * Tres bloques en el orden en que se piensa, en una sola capa:
 *
 *  1. **Por qué.** Motivo de lista cerrada (§7.3); «Otro» pide explicarlo.
 *  2. **Cómo vuelve el dinero, pago a pago.** Por defecto por el mismo medio y en su moneda, por lo
 *     que quedó de ese pago (el vuelto no se devuelve). Un pago electrónico pide la referencia de su
 *     devolución; el punto, la aprobación de la anulación en el terminal. El efectivo es la
 *     alternativa con explicación, y solo si la gaveta lo tiene en esa moneda.
 *  3. **Quién autoriza** (`Autorizacion.tsx`): la lista y el PIN los comprueba el servidor, que
 *     revierte el libro y guarda la anulación con todo esto.
 */

type Via = DevolucionDto["via"];

export type PedidoDeAnulacion = Readonly<{
  motivo: MotivoAnulacion;
  detalle?: string;
  devoluciones: DevolucionDto[];
  /** B3-18: la cuenta vuelve a la cola, o la venta se anula entera (y lo que tiene inventario, al estante o a merma). */
  camino: "COBRAR_DE_NUEVO" | "ANULAR_VENTA";
  inventario: "ESTANTE" | "MERMA";
}>;

export function AnularCobroDialog({
  venta,
  ventas,
  onAnular,
  onCerrar,
}: {
  venta: VentaCerradaDto | null;
  /** Todas las ventas: para saber cuánto efectivo hay para devolver. */
  ventas: readonly VentaCerradaDto[];
  /** Anula en el servidor. Devuelve el rechazo, si lo hay, para enseñarlo aquí. */
  onAnular: (venta: VentaCerradaDto, pedido: PedidoDeAnulacion, autorizacion: unknown) => Promise<Rechazo | null>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoAnulacion | null>(null);
  const [nota, setNota] = useState("");
  const [vias, setVias] = useState<Record<number, Via>>({});
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [camino, setCamino] = useState<PedidoDeAnulacion["camino"]>("COBRAR_DE_NUEVO");
  const [inventario, setInventario] = useState<PedidoDeAnulacion["inventario"]>("ESTANTE");
  const [para, setPara] = useState<string | null>(null);
  const a = useAutorizacion("cobro.anular", venta !== null);

  // Cada venta abre el formulario limpio. Derivado en el render, sin efecto.
  if ((venta?.id ?? null) !== para) {
    setPara(venta?.id ?? null);
    setMotivo(null);
    setNota("");
    setVias({});
    setRefs({});
    setErrores({});
    setCamino("COBRAR_DE_NUEVO");
    setInventario("ESTANTE");
  }

  if (!venta) return null;

  const conDevolucion = venta.payments.map((p, i) => [p, i] as const).filter(([p]) => BigInt(p.refundable.minor) > 0n);
  const viaDe = (i: number): Via => vias[i] ?? "MISMO_MEDIO";
  const saleEnEfectivo = (i: number) => venta.payments[i]!.cash || viaDe(i) === "EFECTIVO";
  const efectivoAlternativo = conDevolucion.some(([p, i]) => !p.cash && viaDe(i) === "EFECTIVO");

  // Efectivo que pide esta anulación, por moneda, contra el que hay.
  const faltaEfectivo = (() => {
    const pedido = new Map<string, bigint>();
    for (const [p, i] of conDevolucion) {
      if (saleEnEfectivo(i)) pedido.set(p.refundable.currency, (pedido.get(p.refundable.currency) ?? 0n) + BigInt(p.refundable.minor));
    }
    for (const [moneda, monto] of pedido) {
      if (monto > efectivoEnGaveta(ventas, moneda)) return moneda;
    }
    return null;
  })();

  async function confirmar() {
    if (!venta || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (!motivo) nuevos.motivo = "Elige el motivo";
    if (motivo === "OTRO" && nota.trim().length < 3) nuevos.nota = "Explica el motivo en unas palabras";
    if (efectivoAlternativo && nota.trim().length < 5) nuevos.nota = "Explica por qué se devuelve en efectivo";
    if (faltaEfectivo) nuevos.efectivo = `En la gaveta no hay efectivo en ${faltaEfectivo} suficiente para devolver`;
    for (const [p, i] of conDevolucion) {
      if (!p.cash && viaDe(i) === "MISMO_MEDIO" && (refs[i] ?? "").trim().length < 4) {
        nuevos[`ref-${i}`] = p.dataKind === "PUNTO" ? "Escribe la aprobación de la anulación en el terminal" : "Escribe la referencia de la devolución";
      }
    }
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }

    const pedido: PedidoDeAnulacion = {
      camino,
      inventario,
      motivo: motivo!,
      ...(nota.trim() ? { detalle: nota.trim() } : {}),
      devoluciones: conDevolucion.map(([p, i]) => ({
        paymentIndex: i,
        via: p.cash ? "MISMO_MEDIO" : viaDe(i),
        ...(!p.cash && viaDe(i) === "MISMO_MEDIO" ? { reference: (refs[i] ?? "").trim() } : {}),
      })),
    };
    setEnviando(true);
    const rechazo = await onAnular(venta, pedido, a.autorizacion(`${textoMotivo(motivo!)}${nota.trim() ? ` · ${nota.trim()}` : ""}`)).catch(
      () => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se anuló nada." }) as Rechazo,
    );
    setEnviando(false);
    if (!rechazo) return;
    const e = erroresDeRechazo(rechazo.mensaje);
    if (e.pin) a.borrarPin();
    setErrores(e as Record<string, string>);
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      // Dos columnas desde tablet: a 1366×768 todo cabe sin desplazar hasta el PIN.
      className="md:w-[min(52rem,calc(100vw-2rem))]"
      titulo={`Anular cobro · Orden #${String(venta.orderNumber).padStart(4, "0")}`}
      descripcion={`${nombreDeCuenta(venta.cuenta)} · ${textoDinero(venta.total)}. Con el PIN de administración; nada se borra.`}
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="danger" onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando}>
            {enviando ? "Anulando…" : camino === "ANULAR_VENTA" ? "Anular la venta" : "Anular y devolver"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
        {/* ── 1. por qué ── */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Motivo</legend>
          <div role="radiogroup" aria-label="Motivo de la anulación" className="grid grid-cols-2 gap-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={motivo === m.id}
                onClick={() => {
                  setMotivo(m.id);
                  setErrores((e) => ({ ...e, motivo: "" }));
                }}
                className={cn(
                  "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-left text-[13px] leading-tight transition-colors",
                  motivo === m.id ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {m.texto}
              </button>
            ))}
          </div>
          {errores.motivo && <p className="text-[12px] text-state-crit">{errores.motivo}</p>}
          <Input
            label={motivo === "OTRO" || efectivoAlternativo ? "Explicación (obligatoria)" : "Explicación (opcional)"}
            surface="tablet"
            value={nota}
            maxLength={200}
            onChange={(e) => setNota(e.target.value)}
            error={errores.nota || undefined}
          />
          {/* B3-18: qué pasa con la cuenta. */}
          <div role="radiogroup" aria-label="Qué pasa con la cuenta" className="grid grid-cols-2 gap-1.5">
            {(
              [
                ["COBRAR_DE_NUEVO", "Cobrarla de nuevo", "Vuelve a la cola para corregir el medio o el monto"],
                ["ANULAR_VENTA", "Anular la venta entera", "Se cierra con su motivo: no se vendió"],
              ] as const
            ).map(([k, titulo, detalle]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={camino === k}
                onClick={() => setCamino(k)}
                className={cn(
                  "flex min-h-14 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 text-left leading-tight transition-colors",
                  camino === k ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                <span className="text-[13px] font-semibold">{titulo}</span>
                <span className="text-[11.5px] text-ink-3">{detalle}</span>
              </button>
            ))}
          </div>
          {camino === "ANULAR_VENTA" && (
            <div role="radiogroup" aria-label="Lo que tiene inventario" className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["ESTANTE", "Vuelve al estante"],
                  ["MERMA", "A merma"],
                ] as const
              ).map(([k, texto]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={inventario === k}
                  onClick={() => setInventario(k)}
                  className={cn(
                    "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[12.5px] transition-colors",
                    inventario === k ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-4">
        {/* ── 2. cómo vuelve el dinero ── */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">2 · Devolución</legend>
          {venta.payments.map((p, i) => {
            const devolver = BigInt(p.refundable.minor) > 0n;
            const vuelto = BigInt(p.paid.minor) - BigInt(p.refundable.minor);
            return (
              <div key={i} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base/60 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink">{p.label}</span>
                  <span className="tnum text-[14px] font-bold text-ink">{devolver ? textoDinero(p.refundable) : "—"}</span>
                </div>
                {vuelto > 0n && <p className="tnum text-[11.5px] text-ink-3">Entregó {textoDinero(p.paid)}; el vuelto ya salió y no se devuelve.</p>}
                {!devolver ? null : p.cash ? (
                  <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <Banknote size={14} aria-hidden="true" /> Sale de la gaveta, en efectivo.
                  </p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label={`Cómo se devuelve ${p.label}`} className="grid grid-cols-2 gap-1">
                      {(["MISMO_MEDIO", "EFECTIVO"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={viaDe(i) === v}
                          onClick={() => setVias((x) => ({ ...x, [i]: v }))}
                          className={cn(
                            "min-h-12 cursor-pointer rounded-[var(--radius-control)] border text-[12.5px] transition-colors",
                            viaDe(i) === v ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                          )}
                        >
                          {v === "MISMO_MEDIO" ? `Por ${p.label}` : "En efectivo"}
                        </button>
                      ))}
                    </div>
                    {viaDe(i) === "MISMO_MEDIO" ? (
                      <Input
                        label={etiquetaReferencia(p)}
                        surface="tablet"
                        autoComplete="off"
                        inputMode={p.dataKind === "USDT" ? "text" : "numeric"}
                        value={refs[i] ?? ""}
                        maxLength={40}
                        onChange={(e) => setRefs((x) => ({ ...x, [i]: e.target.value }))}
                        error={errores[`ref-${i}`] || undefined}
                      />
                    ) : (
                      <p className="text-[12px] text-ink-3">Solo si no se puede por {p.label}: explícalo arriba. Sale de la gaveta en la misma moneda.</p>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {(errores.efectivo || faltaEfectivo) && (
            <p role="alert" className="text-[12px] text-state-crit">
              {errores.efectivo || `En la gaveta no hay efectivo en ${faltaEfectivo} suficiente para devolver`}
            </p>
          )}
        </fieldset>

        {/* ── 3. quién autoriza ── */}
        <CampoAutorizacion
          a={a}
          numero={3}
          denegado="Tu puesto no puede anular cobros."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
        </div>

        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit md:col-span-2">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
