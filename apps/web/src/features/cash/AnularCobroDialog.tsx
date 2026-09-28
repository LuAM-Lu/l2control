"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, ShieldCheck } from "lucide-react";
import { AnulacionSchema, type AnulacionDto, type Rechazo, type VentaCerradaDto } from "@l2/contracts";
import { can, type Actor } from "@l2/domain-identity";
import { Button, Dialog, Input, cn } from "@l2/ui";
import type { OperadorEnSesion } from "../identity/operador.ts";
import { useActorEnSesion } from "../identity/sesion.ts";
import { autorizadoresParaAnular } from "../cuentas/cuentas.acciones";
import { MOTIVOS, efectivoEnGaveta, etiquetaReferencia, textoDinero, textoMotivo } from "./anulacion.ts";

/**
 * Anular un cobro ya cerrado — DEC-24.
 *
 * Tres bloques en el orden en que se piensa, en una sola capa:
 *
 *  1. **Por qué.** Motivo de lista cerrada (§7.3); «Otro» pide explicarlo.
 *  2. **Cómo vuelve el dinero, pago a pago.** Por defecto por el mismo medio y
 *     en su moneda, por lo que quedó de ese pago (el vuelto no se devuelve). Un
 *     pago electrónico pide la referencia de su devolución; el punto, la
 *     aprobación de la anulación en el terminal. El efectivo es la alternativa
 *     con explicación, y solo si la gaveta lo tiene en esa moneda.
 *  3. **Quién autoriza.** Quien no puede anular por sí mismo elige a un
 *     supervisor o a la administración, que teclea su PIN. La lista y el PIN
 *     son del servidor (B3-3): él dice quién puede autorizar, comprueba el PIN
 *     con su bloqueo creciente y deja la autorización en la auditoría ANTES de
 *     revertir el libro (DEC-24). La administración anula sin autorización.
 *
 * El contrato valida la anulación entera antes de enviarla; si algo no
 * cumple, no se envía nada (fail-closed).
 */

const PIN_LONGITUD = 4;

type Via = "MISMO_MEDIO" | "EFECTIVO";

export function AnularCobroDialog({
  venta,
  ventas,
  operador,
  onAnular,
  onCerrar,
}: {
  venta: VentaCerradaDto | null;
  /** Todas las ventas: para saber cuánto efectivo hay para devolver. */
  ventas: readonly VentaCerradaDto[];
  operador: OperadorEnSesion | null;
  /**
   * Anula en el servidor. `autorizacion` es la del 🔐 (quién, su PIN y el motivo) cuando quien opera
   * no puede anular por sí mismo. Devuelve el rechazo, si lo hay, para enseñarlo aquí.
   */
  onAnular: (venta: VentaCerradaDto, anulacion: AnulacionDto, autorizacion?: unknown) => Promise<Rechazo | null>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<AnulacionDto["reason"] | null>(null);
  const [nota, setNota] = useState("");
  const [vias, setVias] = useState<Record<number, Via>>({});
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [autorizadorId, setAutorizadorId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  /** Quiénes pueden autorizar, según el servidor. `null` mientras se pregunta. */
  const [lista, setLista] = useState<{ id: string; nombre: string; rol: string }[] | null>(null);
  const [para, setPara] = useState<string | null>(null);

  // Cada venta abre el formulario limpio. Derivado en el render, sin efecto.
  if ((venta?.id ?? null) !== para) {
    setPara(venta?.id ?? null);
    setMotivo(null);
    setNota("");
    setVias({});
    setRefs({});
    setAutorizadorId(null);
    setPin("");
    setErrores({});
  }

  const solicitante: Actor | null = useActorEnSesion();
  const permiso = solicitante ? can(solicitante, "cobro.anular") : "DENEGADO";
  const pideAutorizacion = permiso === "REQUIERE_AUTORIZACION";

  // Quién puede autorizar lo dice el servidor, cada vez que se abre para anular.
  const abierto = venta !== null;
  useEffect(() => {
    if (!abierto || !pideAutorizacion) return;
    let vivo = true;
    setLista(null);
    autorizadoresParaAnular()
      .then((l) => vivo && setLista(l))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [abierto, pideAutorizacion]);

  /** Quién firma la anulación: quien la autoriza o, si puede por sí mismo, quien opera. */
  const autorizadores = useMemo(() => {
    if (!operador) return [];
    if (permiso === "PERMITIDO") return [{ id: operador.id, nombre: operador.nombre, rol: operador.role as string }];
    return lista ?? [];
  }, [operador, permiso, lista]);
  const autorizador = autorizadores.find((a) => a.id === autorizadorId) ?? (autorizadores.length === 1 ? autorizadores[0]! : null);

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
    if (!venta || !operador || enviando) return;
    const nuevos: Record<string, string> = {};
    if (!motivo) nuevos.motivo = "Elige el motivo";
    if (!autorizador) nuevos.autorizador = "Elige quién autoriza";
    if (pideAutorizacion && pin.length !== PIN_LONGITUD) nuevos.pin = "Escribe el PIN de 4 dígitos";
    if (faltaEfectivo) nuevos.efectivo = `En la gaveta no hay efectivo en ${faltaEfectivo} suficiente para devolver`;

    const anulacion = {
      at: new Date().toISOString(),
      requestedBy: { id: operador.id, name: operador.nombre },
      authorizedBy: autorizador ? { id: autorizador.id, name: autorizador.nombre, role: autorizador.rol } : null,
      reason: motivo,
      ...(nota.trim() ? { note: nota.trim() } : {}),
      refunds: conDevolucion.map(([p, i]) => ({
        paymentIndex: i,
        via: p.cash ? ("MISMO_MEDIO" as const) : viaDe(i),
        amount: p.refundable,
        reference: !p.cash && viaDe(i) === "MISMO_MEDIO" ? (refs[i] ?? "").trim() || null : null,
      })),
    };

    // Todo lo que falta, de una vez, junto a su campo. El PIN no se comprueba
    // hasta que la anulación está completa.
    const forma = AnulacionSchema.safeParse(anulacion);
    const campos: Record<string, string> = { ...nuevos };
    for (const issue of forma.success ? [] : forma.error.issues) {
      const [raiz, indice, campo] = issue.path;
      if (raiz === "note") campos.nota ??= issue.message;
      else if (raiz === "refunds" && campo === "reference") campos[`ref-${String(indice)}`] ??= issue.message;
      else if (raiz === "reason" || raiz === "authorizedBy") continue; // ya dichos arriba
      else campos.general ??= issue.message;
    }
    // Lo que solo sabe la venta: referencia obligatoria y explicación del efectivo.
    for (const [p, i] of conDevolucion) {
      if (!p.cash && viaDe(i) === "MISMO_MEDIO" && !(refs[i] ?? "").trim()) {
        campos[`ref-${i}`] = p.dataKind === "PUNTO" ? "Escribe la aprobación de la anulación en el terminal" : "Escribe la referencia de la devolución";
      }
    }
    if (efectivoAlternativo && nota.trim().length < 5) campos.nota = "Explica por qué se devuelve en efectivo";
    if (Object.keys(campos).length > 0) {
      setErrores(campos);
      return;
    }

    // El PIN lo comprueba el servidor, con su bloqueo, antes de tocar el libro.
    const autorizacion =
      pideAutorizacion && autorizador
        ? { autorizadorId: autorizador.id, pin, motivo: `${textoMotivo(motivo!)}${nota.trim() ? ` · ${nota.trim()}` : ""}`.slice(0, 280) }
        : undefined;
    setEnviando(true);
    const rechazo = await onAnular(venta, forma.data!, autorizacion).catch(() => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se anuló nada." }) as Rechazo);
    setEnviando(false);
    if (!rechazo) return;
    if (pideAutorizacion && /PIN|bloquead|autorizar/i.test(rechazo.mensaje)) {
      setPin("");
      setErrores({ pin: rechazo.mensaje });
    } else {
      setErrores({ general: rechazo.mensaje });
    }
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={`Anular cobro · Orden ${venta.recibo.orden}`}
      descripcion={`${venta.recibo.cuenta} · ${venta.recibo.total}. La cuenta vuelve a «por cobrar»; nada se borra.`}
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="danger" onClick={() => void confirmar()} disabled={permiso === "DENEGADO" || enviando}>
            {enviando ? "Anulando…" : "Anular y devolver"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
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
                  motivo === m.id ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
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
        </fieldset>

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
                {vuelto > 0n && (
                  <p className="tnum text-[11.5px] text-ink-3">
                    Entregó {textoDinero(p.paid)}; el vuelto ya salió y no se devuelve.
                  </p>
                )}
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
                            viaDe(i) === v ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
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
                      <p className="text-[12px] text-ink-3">
                        Solo si no se puede por {p.label}: explícalo arriba. Sale de la gaveta en la misma moneda.
                      </p>
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            <ShieldCheck size={13} aria-hidden="true" /> 3 · Autorización
          </legend>
          {permiso === "DENEGADO" ? (
            <p className="text-[12.5px] text-state-crit">Tu puesto no puede anular cobros.</p>
          ) : permiso === "PERMITIDO" ? (
            <p className="text-[12.5px] text-ink-2">Autorizas tú, como administración: queda a tu nombre.</p>
          ) : lista === null ? (
            <p className="text-[12.5px] text-ink-3" role="status">
              Buscando quién puede autorizar…
            </p>
          ) : autorizadores.length === 0 ? (
            <p className="text-[12.5px] text-state-crit">No hay un supervisor ni un administrador activo que pueda autorizarlo.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Quién autoriza" className="flex flex-wrap gap-1.5">
                {autorizadores.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="radio"
                    aria-checked={autorizador?.id === a.id}
                    onClick={() => {
                      setAutorizadorId(a.id);
                      setPin("");
                    }}
                    className={cn(
                      "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 text-left transition-colors",
                      autorizador?.id === a.id ? "border-brand bg-brand/12 text-ink" : "border-line text-ink-2 hover:text-ink",
                    )}
                  >
                    <span className="text-[13px] font-semibold">{a.nombre}</span>
                    <span className="text-[11px] text-ink-3">{a.rol === "ADMIN" ? "Administración" : "Supervisión"}</span>
                  </button>
                ))}
              </div>
              {errores.autorizador && <p className="text-[12px] text-state-crit">{errores.autorizador}</p>}
              <Input
                label={autorizador ? `PIN de ${autorizador.nombre}` : "PIN de quien autoriza"}
                surface="tablet"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_LONGITUD}
                value={pin}
                disabled={!autorizador || enviando}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LONGITUD))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmar();
                  }
                }}
                error={errores.pin || undefined}
              />
            </>
          )}
        </fieldset>

        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
