"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, TriangleAlert, Undo2 } from "lucide-react";
import { MEDIO_CONSUMO_DEL_PERSONAL, type DestinoDevuelto, type DevolucionHechaDto, type ParqueDeLaVentaDto, type Rechazo, type VentaCerradaDto } from "@l2/contracts";
import { devolucionDe, repartirDevolucion, USDT_AT_PAR } from "@l2/domain-cash";
import { invertRate, money, toMajor, type CurrencyCode, type FrozenRate } from "@l2/domain-money";
import { frozenRateOf } from "@l2/domain-rates";
import { Button, Input, Sheet, cn, formatMoneyVE } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { etiquetaReferencia, textoDinero } from "./anulacion.ts";
import { devolverVenta, parqueDeLaVenta } from "./ventas.acciones";

/**
 * Un cliente devuelve parte de lo que compró — B3-14 (M-34, S-4).
 *
 * En una capa, en el orden en que se piensa: qué vuelve (las cantidades de cada cosa, nunca más de lo vendido, contando
 * lo ya devuelto, y si va al estante o a merma), cuánto vuelve (con su descuento, IVA e IGTF, calculado como lo calcula
 * el servidor), por qué pago (cada uno en su moneda, sin pasar de lo que le queda; uno electrónico, con la referencia de
 * su devolución), el motivo y quién autoriza. El servidor lo vuelve a comprobar todo.
 */
type Grupo = { clave: string; concepto: string; precio: VentaCerradaDto["lineas"][number]["amount"]; lineIds: string[] };

function desdeFuncional(moneda: string, tasa: VentaCerradaDto["tasa"]): FrozenRate | null {
  if (moneda === "USD") return null;
  if (moneda === "USDT") return invertRate(USDT_AT_PAR);
  return tasa ? invertRate(frozenRateOf({ pair: "USD/VES", value: tasa.value })) : null;
}

export function DevolverVentaDialog({ venta, onCerrar, onHecha }: { venta: VentaCerradaDto | null; onCerrar: () => void; onHecha: (h: DevolucionHechaDto) => void }) {
  const [para, setPara] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [destinos, setDestinos] = useState<Record<string, DestinoDevuelto>>({});
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [clave, setClave] = useState(() => globalThis.crypto.randomUUID());
  const a = useAutorizacion("venta.devolver", venta !== null);
  /** El tiempo del parque de la venta (B3-18): cada paquete, si su niño sigue en la sala y lo que no usó. */
  const [parque, setParque] = useState<ParqueDeLaVentaDto["lineas"] | null>(null);
  /** Qué vuelve de cada paquete: nada, lo que no usó o entero (un problema del local). */
  const [delParque, setDelParque] = useState<Record<string, "NADA" | "NO_USADO" | "ENTERO">>({});
  useEffect(() => {
    if (!venta) return;
    let vivo = true;
    setParque(null);
    parqueDeLaVenta(venta.id)
      .then((r) => vivo && setParque(r.ok ? r.valor.lineas : []))
      .catch(() => vivo && setParque([]));
    return () => {
      vivo = false;
    };
  }, [venta?.id]);
  const delParqueIds = new Set((parque ?? []).map((p) => p.lineId));

  // Cada venta abre el formulario limpio. Derivado en el render, sin efecto.
  if ((venta?.id ?? null) !== para) {
    setPara(venta?.id ?? null);
    setCantidades({});
    setDestinos({});
    setRefs({});
    setMotivo("");
    setErrores({});
    setDelParque({});
    setClave(globalThis.crypto.randomUUID());
  }

  // Lo que se puede devolver: lo vendido que no fue cortesía ni volvió ya, agrupado por cosa y precio.
  const grupos = useMemo((): Grupo[] => {
    if (!venta) return [];
    const devueltas = new Set(venta.devoluciones.flatMap((d) => d.lineas.map((l) => l.lineId)));
    const m = new Map<string, Grupo>();
    for (const l of venta.lineas) {
      // El tiempo del parque va aparte (B3-18), con lo que no usó.
      if (l.cortesia || devueltas.has(l.lineId) || delParqueIds.has(l.lineId)) continue;
      const k = `${l.concept}|${l.amount.minor}|${l.taxCode ?? ""}`;
      const g = m.get(k) ?? { clave: k, concepto: l.concept, precio: l.amount, lineIds: [] };
      g.lineIds.push(l.lineId);
      m.set(k, g);
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta, parque]);

  const devueltasYa = new Set((venta?.devoluciones ?? []).flatMap((d) => d.lineas.map((l) => l.lineId)));
  const paquetes = (parque ?? []).filter((p) => !devueltasYa.has(p.lineId));
  const elegidas = [
    ...grupos.flatMap((g) => g.lineIds.slice(0, cantidades[g.clave] ?? 0).map((lineId) => ({ lineId, destino: destinos[g.clave] ?? "ESTANTE" }))),
    ...paquetes.flatMap((p) => {
      const como = delParque[p.lineId] ?? "NADA";
      return como === "NADA" ? [] : [{ lineId: p.lineId, destino: "ESTANTE" as const, ...(como === "NO_USADO" ? { noUsado: true } : {}) }];
    }),
  ];
  /** Lo que no usó cada paquete elegido así: de su línea vuelve solo eso. */
  const parciales = new Map(paquetes.flatMap((p) => (delParque[p.lineId] === "NO_USADO" && p.noUsado ? [[p.lineId, money(BigInt(p.noUsado.minor), "USD")] as const] : [])));

  // Lo que vuelve y por qué pago: la misma cuenta que hace el servidor (el dominio).
  const calculo = useMemo(() => {
    if (!venta) return null;
    const f = venta.total.currency as CurrencyCode;
    const bpGeneral = Math.max(0, ...venta.impuestos.map((x) => x.basisPoints));
    const d = devolucionDe(
      {
        lineas: venta.lineas.map((l) => ({ lineId: l.lineId, amount: money(BigInt(l.amount.minor), f), taxBp: l.taxCode === "EXENTA" ? 0 : bpGeneral })),
        subtotal: money(BigInt(venta.subtotal.minor), f),
        descuento: money(BigInt(venta.descuento?.importe.minor ?? "0"), f),
        ivaIncluido: venta.ivaIncluido,
        igtf: money(BigInt(venta.igtf.amount.minor), f),
        total: money(BigInt(venta.total.minor), f),
      },
      elegidas.map((e) => e.lineId),
      parciales,
    );
    const reparto = repartirDevolucion(
      d.total,
      venta.payments.map((p) => ({ restante: money(BigInt(p.refundable.minor), p.refundable.currency as CurrencyCode), desdeFuncional: desdeFuncional(p.refundable.currency, venta.tasa) })),
    );
    return { d, reparto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta, elegidas.map((e) => `${e.lineId}:${"noUsado" in e ? 1 : 0}`).join(",")]);

  if (!venta) return <Sheet abierto={false} onCerrar={onCerrar} titulo="Devolver">{null}</Sheet>;

  async function confirmar() {
    if (!venta || !calculo) return;
    const e: Record<string, string> = {};
    if (elegidas.length === 0) e.lineas = "Elige lo que se devuelve";
    if (motivo.trim().length < 3) e.motivo = "Di por qué devuelve";
    if (calculo.reparto.falta.amount > 0n) e.general = "Lo que queda de los pagos no alcanza para devolverlo.";
    calculo.reparto.montos.forEach((m, i) => {
      const p = venta.payments[i]!;
      if (m.amount > 0n && !p.cash && p.methodCode !== MEDIO_CONSUMO_DEL_PERSONAL && (refs[i] ?? "").trim().length < 4) e[`ref.${i}`] = "Escribe la referencia de la devolución";
    });
    const falta = a.falta();
    if (Object.keys(e).length > 0 || falta) {
      setErrores({ ...e, ...((falta ?? {}) as Record<string, string>) });
      return;
    }
    setEnviando(true);
    const reintegros = calculo.reparto.montos.flatMap((m, i) =>
      m.amount > 0n
        ? [
            {
              paymentIndex: i,
              amount: { minor: String(m.amount), currency: m.currency },
              ...(venta.payments[i]!.cash || venta.payments[i]!.methodCode === MEDIO_CONSUMO_DEL_PERSONAL ? {} : { reference: (refs[i] ?? "").trim() }),
            },
          ]
        : [],
    );
    const r = await devolverVenta(
      { idempotencyKey: clave, saleId: venta.id, lineas: elegidas, reintegros, motivo: motivo.trim() },
      a.autorizacion(`Devolver de la orden #${String(venta.orderNumber).padStart(4, "0")}: ${formatMoneyVE(toMajor(calculo.d.total), "USD")} · ${motivo.trim()}`),
    ).catch(() => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se devolvió nada." }) as Rechazo);
    setEnviando(false);
    if (r.ok) {
      onHecha(r.valor);
      return;
    }
    const ep = erroresDeRechazo(r.mensaje);
    if (ep.pin) a.borrarPin();
    setErrores({ general: r.mensaje, ...(ep as Record<string, string>) });
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={`Devolver de la orden #${String(venta.orderNumber).padStart(4, "0")}`}
      descripcion="Lo que el cliente devuelve: vuelve por su pago, en su moneda, desde la gaveta de hoy, con el PIN de administración. Lo que vuelve al estante se vuelve a vender."
      className="md:w-[min(42rem,100vw)]"
      pie={
        <div className="flex w-full flex-col gap-2">
          {errores.general && (
            <p role="alert" className="flex items-start gap-1.5 text-[12.5px] font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errores.general}
            </p>
          )}
          <Button surface="pos" variant="primary" className="w-full gap-1.5" disabled={enviando || elegidas.length === 0} onClick={() => void confirmar()}>
            <Undo2 size={17} aria-hidden="true" />
            {enviando ? "Devolviendo…" : calculo && elegidas.length > 0 ? `Devolver ${formatMoneyVE(toMajor(calculo.d.total), "USD")}` : "Elige lo que se devuelve"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-etiqueta font-semibold text-ink-2 uppercase">1 · Qué devuelve</legend>
          {/* B3-18: el tiempo del parque de un niño que ya salió: lo que no usó, o entero si fue un problema del local. */}
          {paquetes.map((p) => {
            const l = venta.lineas.find((x) => x.lineId === p.lineId)!;
            const como = delParque[p.lineId] ?? "NADA";
            const opciones = [
              ["NADA", "No"],
              ...(p.noUsado ? ([["NO_USADO", `Lo que no usó · ${textoDinero(p.noUsado)}`]] as const) : []),
              ["ENTERO", `Entero · ${textoDinero(l.amount)}`],
            ] as const;
            return (
              <div key={p.lineId} className={cn("flex flex-col gap-2 rounded-[var(--radius-control)] border px-3 py-2", como !== "NADA" ? "border-brand/60 bg-brand/5" : "border-line")}>
                <span className="block text-[14px] font-semibold text-ink">{l.concept}</span>
                {p.enSala ? (
                  <span className="text-[12.5px] text-ink-3">El niño sigue en la sala: su tiempo se devuelve después de su salida.</span>
                ) : (
                  <span role="radiogroup" aria-label={`Qué vuelve de ${l.concept}`} className="flex flex-wrap gap-1.5">
                    {opciones.map(([k, texto]) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={como === k}
                        onClick={() => setDelParque((d) => ({ ...d, [p.lineId]: k }))}
                        className={cn(
                          "tnum min-h-12 flex-1 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold",
                          como === k ? "border-brand bg-brand/15 text-ink" : "border-line text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {texto}
                      </button>
                    ))}
                  </span>
                )}
                {!p.enSala && !p.noUsado && <span className="text-[12px] text-ink-3">Usó todo lo que pagó (o tuvo más tiempo): solo se devuelve entero.</span>}
              </div>
            );
          })}
          {grupos.length === 0 && paquetes.length === 0 ? (
            <p className="text-[13px] text-ink-3">De esta venta ya no queda nada que devolver.</p>
          ) : (
            grupos.map((g) => {
              const n = cantidades[g.clave] ?? 0;
              const destino = destinos[g.clave] ?? "ESTANTE";
              return (
                <div key={g.clave} className={cn("flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2", n > 0 ? "border-brand/60 bg-brand/5" : "border-line")}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-ink">{g.concepto}</span>
                    <span className="tnum block text-[12px] text-ink-3">
                      {textoDinero(g.precio)} c/u · vendidos {g.lineIds.length}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button surface="tablet" variant="neutral" aria-label={`Uno menos de ${g.concepto}`} disabled={n === 0} onClick={() => setCantidades((c) => ({ ...c, [g.clave]: n - 1 }))}>
                      <Minus size={16} aria-hidden="true" />
                    </Button>
                    <span className="tnum w-8 text-center text-[16px] font-bold text-ink" aria-live="polite">
                      {n}
                    </span>
                    <Button surface="tablet" variant="neutral" aria-label={`Uno más de ${g.concepto}`} disabled={n >= g.lineIds.length} onClick={() => setCantidades((c) => ({ ...c, [g.clave]: n + 1 }))}>
                      <Plus size={16} aria-hidden="true" />
                    </Button>
                  </span>
                  {n > 0 && (
                    <span role="radiogroup" aria-label={`A dónde va ${g.concepto}`} className="flex basis-full gap-1.5">
                      {(["ESTANTE", "MERMA"] as const).map((x) => (
                        <button
                          key={x}
                          type="button"
                          role="radio"
                          aria-checked={destino === x}
                          onClick={() => setDestinos((d) => ({ ...d, [g.clave]: x }))}
                          className={cn(
                            "min-h-12 flex-1 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold",
                            destino === x ? "border-brand bg-brand/15 text-ink" : "border-line text-ink-2 hover:border-line-strong",
                          )}
                        >
                          {x === "ESTANTE" ? "Vuelve al estante" : "A merma"}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              );
            })
          )}
          {errores.lineas && <p className="text-nota text-state-crit">{errores.lineas}</p>}
        </fieldset>

        {calculo && elegidas.length > 0 && (
          <section aria-label="Lo que vuelve" className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base/40 p-3">
            <h3 className="text-etiqueta font-semibold text-ink-2 uppercase">2 · Cuánto vuelve y por qué pago</h3>
            <dl className="tnum grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-[13px]">
              <dt className="text-ink-2">Lo devuelto</dt>
              <dd className="text-right">{formatMoneyVE(toMajor(calculo.d.base), "USD")}</dd>
              {calculo.d.descuento.amount > 0n && (
                <>
                  <dt className="text-ink-2">Su parte del descuento</dt>
                  <dd className="text-right">- {formatMoneyVE(toMajor(calculo.d.descuento), "USD")}</dd>
                </>
              )}
              {calculo.d.iva.amount > 0n && (
                <>
                  <dt className="text-ink-2">IVA</dt>
                  <dd className="text-right">{formatMoneyVE(toMajor(calculo.d.iva), "USD")}</dd>
                </>
              )}
              <dt className="font-semibold text-ink">Se devuelve</dt>
              <dd className="text-right text-[15px] font-bold text-ink">{formatMoneyVE(toMajor(calculo.d.total), "USD")}</dd>
            </dl>
            <ul className="flex flex-col gap-2 border-t border-line pt-2">
              {calculo.reparto.montos.map((m, i) => {
                const p = venta.payments[i]!;
                if (m.amount === 0n) return null;
                return (
                  <li key={i} className="flex flex-col gap-1.5">
                    <span className="tnum flex justify-between text-[13.5px]">
                      <span className="font-semibold text-ink">{p.label}</span>
                      <span className="font-semibold text-ink">{formatMoneyVE(toMajor(m), m.currency)}</span>
                    </span>
                    {/* El consumo del personal (B3-17) vuelve a su vale: no hay referencia. */}
                    {p.methodCode === MEDIO_CONSUMO_DEL_PERSONAL && <span className="text-detalle text-ink-3">Vuelve a su vale: no entró dinero.</span>}
                    {!p.cash && p.methodCode !== MEDIO_CONSUMO_DEL_PERSONAL && (
                      <Input
                        label={etiquetaReferencia(p)}
                        surface="tablet"
                        value={refs[i] ?? ""}
                        maxLength={40}
                        autoComplete="off"
                        data-privado=""
                        error={errores[`ref.${i}`]}
                        onChange={(e) => setRefs((r) => ({ ...r, [i]: e.target.value }))}
                      />
                    )}
                    {p.cash && <span className="text-[12px] text-ink-3">En efectivo, de la gaveta de hoy.</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <Input label="3 · Por qué devuelve" surface="tablet" value={motivo} maxLength={200} placeholder="Vino dañado, no era lo que pidió…" error={errores.motivo} onChange={(e) => setMotivo(e.target.value)} />

        <CampoAutorizacion
          a={a}
          numero={4}
          denegado="Tu puesto no puede devolver ventas."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
      </div>
    </Sheet>
  );
}
