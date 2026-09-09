"use client";

import { useMemo, useState } from "react";
import {
  CircleCheckBig,
  Coins,
  HandCoins,
  PiggyBank,
  X,
} from "lucide-react";
import {
  type FrozenRate,
  type Money,
  add,
  fromMajor,
  toMajor,
  zero,
} from "@l2/domain-money";
import { computeDocument, computeIgtf, type DocumentLine, type TaxRule } from "@l2/domain-tax";
import {
  closeSettlement,
  computeBalance,
  type ChangeDisposition,
  type Tender,
} from "@l2/domain-cash";
import { Badge, Button, Container, Input, MoneyDisplay, StatTile, cn } from "@l2/ui";
import type { MedioPago } from "./fixtures.ts";

/**
 * Caja: cobro mixto, IGTF y vuelto — F4-03, F4-04b.
 *
 * EL DETALLE QUE HACE ESTA PANTALLA DISTINTA A UN POS CORRIENTE
 * El IGTF depende de EN QUÉ MONEDA SE PAGA, así que **lo que hay que cobrar
 * crece a medida que se añaden pagos en divisas**. No es un bug: es la norma.
 * Por eso el total a cobrar se recalcula con cada pago y la pantalla lo dice
 * con palabras, en vez de dejar al cajero descubrir que la cuenta «subió».
 *
 * Y el excedente NO se cierra solo: hay que decir qué se hace con él —vuelto,
 * propina o residuo—, porque un sobrante sin explicación es dinero perdido
 * (§5.6).
 */
export function CajaScreen({
  lines,
  rules,
  tenders: mediosDisponibles,
  igtfBasisPoints,
  maxRetained,
  rate,
  serverNow,
}: {
  lines: readonly DocumentLine[];
  rules: readonly TaxRule[];
  tenders: readonly MedioPago[];
  igtfBasisPoints: number;
  maxRetained: Money;
  /** Tasa congelada de esta transacción (ADR-005). `null` bloquea el cobro en Bs.
   *  La tasa se MUESTRA en la barra de estación (§8.5); aquí solo se usa. */
  rate: FrozenRate | null;
  serverNow: number;
}) {
  const FUNCIONAL = "USD" as const;

  const [pagos, setPagos] = useState<{ uid: string; medio: MedioPago; amount: Money }[]>([]);
  const [medioActivo, setMedioActivo] = useState<MedioPago>(mediosDisponibles[0]!);
  const [monto, setMonto] = useState("");
  const [destinoVuelto, setDestinoVuelto] = useState<"VUELTO" | "PROPINA" | "CAJA">("VUELTO");
  const [error, setError] = useState<string | null>(null);
  const [cobrado, setCobrado] = useState<{ total: string; vuelto: string } | null>(null);

  /* ------------------------------------------------- documento (IVA) */

  const doc = useMemo(
    () => computeDocument({ lines, rules, at: serverNow, currency: FUNCIONAL }),
    [lines, rules, serverNow],
  );

  /* ------------------------------------------------------ IGTF */

  const tenders: Tender[] = useMemo(
    () =>
      pagos.map((p) => ({
        method: p.medio,
        amount: p.amount,
        rate: p.amount.currency === FUNCIONAL ? null : rate,
      })),
    [pagos, rate],
  );

  const igtf = useMemo(
    () =>
      computeIgtf(
        pagos.map((p) => ({ method: p.medio, amount: p.amount })),
        igtfBasisPoints,
        FUNCIONAL,
      ),
    [pagos, igtfBasisPoints],
  );

  // El IGTF de un pago en USDT viene en USDT; se trata 1:1 con el dólar para
  // el consolidado, y queda anotado como cuestión para el contador (DEC-1).
  const igtfTotal = useMemo(
    () =>
      igtf.lines.reduce<Money>(
        (acc, l) =>
          l.igtf.currency === FUNCIONAL || l.igtf.currency === "USDT"
            ? add(acc, { amount: l.igtf.amount, currency: FUNCIONAL })
            : acc,
        zero(FUNCIONAL),
      ),
    [igtf],
  );

  /** Lo que realmente hay que cobrar: documento + IGTF de los pagos hechos. */
  const aCobrar = add(doc.total, igtfTotal);

  /* --------------------------------------------------------- balance */

  const balance = useMemo(() => {
    try {
      return computeBalance(aCobrar, tenders, FUNCIONAL);
    } catch {
      // Falta la tasa: se refleja como «nada entregado» y el aviso lo explica.
      return null;
    }
  }, [aCobrar, tenders]);

  const faltaTasa = tenders.some((t) => t.amount.currency !== FUNCIONAL && !t.rate);
  const sobra = balance?.surplus ?? zero(FUNCIONAL);
  const falta = balance?.outstanding ?? aCobrar;

  /* --------------------------------------------------------- acciones */

  function agregarPago() {
    setError(null);
    let valor: Money;
    try {
      valor = fromMajor(monto.replace(",", "."), medioActivo.currency);
    } catch {
      setError("Monto no válido");
      return;
    }
    if (valor.amount <= 0n) {
      setError("El monto debe ser mayor que cero");
      return;
    }
    if (medioActivo.currency !== FUNCIONAL && !rate) {
      setError("Sin tasa confirmada del día no se puede cobrar en esa moneda");
      return;
    }
    setPagos((prev) => [
      ...prev,
      { uid: globalThis.crypto.randomUUID(), medio: medioActivo, amount: valor },
    ]);
    setMonto("");
  }

  function cobrar() {
    setError(null);
    const dispositions: ChangeDisposition[] = [];
    if (sobra.amount > 0n) {
      if (destinoVuelto === "VUELTO") {
        dispositions.push({ kind: "CHANGE_OUT", amount: sobra, rate: null });
      } else if (destinoVuelto === "PROPINA") {
        dispositions.push({ kind: "TIP_FROM_CHANGE", amount: sobra });
      } else {
        dispositions.push({ kind: "ROUNDING_RETAINED", amount: sobra });
      }
    }

    try {
      // El dominio comprueba la invariante de §5.6. Si no cuadra, no cierra —
      // y el mensaje del error explica por qué, en lugar de fallar en silencio.
      const r = closeSettlement({
        due: aCobrar,
        tenders,
        dispositions,
        functional: FUNCIONAL,
        maxRetained,
      });
      setCobrado({ total: toMajor(aCobrar), vuelto: toMajor(r.changeOut) });
      setPagos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el cobro");
    }
  }

  const puedeCobrar = balance !== null && falta.amount === 0n && pagos.length > 0;

  /* --------------------------------------------------------- pintado */

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4">
          <div>
            <div>
              <h1 className="font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink">
                Caja
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3">Cobro mixto multimoneda</p>
            </div>
          </div>
          <div className="flex items-end gap-7">
            <StatTile label="Falta" value={toMajor(falta)} suffix="USD" tone={falta.amount > 0n ? "warn" : "ok"} />
            {sobra.amount > 0n && (
              <StatTile label="Sobra" value={toMajor(sobra)} suffix="USD" tone="brand" />
            )}
          </div>
        </Container>
      </header>

      <Container as="main" ancho="operacion" className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ----------------------------------------------- la cuenta */}
        <section className="flex flex-col gap-4 min-w-0">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-display mb-4 text-lg font-bold text-ink">La cuenta</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {lines.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-2">
                    {l.description}
                    {l.quantity > 1n && <span className="tnum ml-1 text-ink-3">×{String(l.quantity)}</span>}
                  </span>
                  <MoneyDisplay
                    value={toMajor({ amount: l.unitPrice.amount * l.quantity, currency: l.unitPrice.currency })}
                    currency={l.unitPrice.currency}
                    size="sm"
                    tone="muted"
                  />
                </li>
              ))}
            </ul>

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-2">Subtotal</dt>
                <dd><MoneyDisplay value={toMajor(doc.subtotal)} currency="USD" size="sm" tone="muted" /></dd>
              </div>
              {doc.buckets.map((b) => (
                <div key={b.code} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-2">
                    IVA {b.basisPoints / 100}%
                    <span className="tnum ml-1.5 text-ink-3">sobre {toMajor(b.base)}</span>
                  </dt>
                  <dd><MoneyDisplay value={toMajor(b.tax)} currency="USD" size="sm" tone="muted" /></dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-2">
                <dt className="font-semibold text-ink">Total del documento</dt>
                <dd><MoneyDisplay value={toMajor(doc.total)} currency="USD" size="md" /></dd>
              </div>

              {/* El IGTF va SEPARADO del IVA, como exige §5.3. */}
              {igtfTotal.amount > 0n && (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-state-warn">
                      IGTF {igtfBasisPoints / 100}%
                      <span className="ml-1.5 text-ink-3">solo sobre lo pagado en divisas</span>
                    </dt>
                    <dd><MoneyDisplay value={toMajor(igtfTotal)} currency="USD" size="sm" tone="negative" /></dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-2">
                    <dt className="font-semibold text-ink">Total a cobrar</dt>
                    <dd><MoneyDisplay value={toMajor(aCobrar)} currency="USD" size="lg" /></dd>
                  </div>
                </>
              )}
            </dl>

            {igtfTotal.amount > 0n && (
              <p className="mt-3 rounded-[var(--radius-control)] border border-state-warn/30 bg-state-warn-bg px-3 py-2 text-[12px] text-state-warn">
                El total subió porque el IGTF grava el <strong>medio de pago</strong>, no la venta:
                solo se aplica a lo que se paga en divisas o cripto.
              </p>
            )}
          </div>

          {/* pagos añadidos */}
          {pagos.length > 0 && (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <h2 className="font-display mb-3 text-lg font-bold text-ink">Pagos recibidos</h2>
              <ul className="flex flex-col gap-2">
                {pagos.map((p) => {
                  const linea = igtf.lines.find((l) => l.methodCode === p.medio.code);
                  return (
                    <li key={p.uid} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge tone={p.medio.triggersIgtf ? "warn" : "idle"}>{p.medio.label}</Badge>
                        {p.medio.triggersIgtf && linea && (
                          <span className="text-[11px] text-ink-3">
                            + IGTF {toMajor(linea.igtf)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <MoneyDisplay value={toMajor(p.amount)} currency={p.amount.currency} size="sm" />
                        <button
                          type="button"
                          onClick={() => setPagos((prev) => prev.filter((x) => x.uid !== p.uid))}
                          aria-label={`Quitar el pago de ${p.medio.label}`}
                          className="grid size-7 cursor-pointer place-content-center rounded text-ink-3 hover:text-state-crit"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* ------------------------------------------------- cobrar */}
        <aside className="flex h-fit min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-lg font-bold text-ink">Cobrar</h2>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
            {mediosDisponibles.map((m) => {
              const activo = m.code === medioActivo.code;
              const bloqueado = m.currency !== FUNCIONAL && !rate;
              return (
                <button
                  key={m.code}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  disabled={bloqueado}
                  onClick={() => setMedioActivo(m)}
                  className={cn(
                    "flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 text-left transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    activo
                      ? "border-brand bg-brand/12 text-ink"
                      : "border-line bg-base text-ink-2 hover:text-ink",
                  )}
                >
                  <span className="text-[13px] font-semibold">{m.label}</span>
                  <span className="text-[10px] text-ink-3">
                    {m.currency}
                    {m.triggersIgtf && " · IGTF"}
                  </span>
                </button>
              );
            })}
          </div>

          <Input
            label={`Monto en ${medioActivo.currency}`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") agregarPago();
            }}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
          />

          <Button surface="pos" variant="neutral" onClick={agregarPago} className="w-full">
            <Coins size={16} aria-hidden="true" />
            Añadir pago
          </Button>

          {faltaTasa && (
            <p role="alert" className="text-[12.5px] text-state-crit">
              Hay un pago en otra moneda sin tasa congelada. No se puede cobrar (ADR-005).
            </p>
          )}

          {/* El excedente exige una decisión: no se cierra solo. */}
          {sobra.amount > 0n && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/8 p-3">
              <p className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-ink">Sobran</span>
                <MoneyDisplay value={toMajor(sobra)} currency="USD" size="md" />
              </p>
              <p className="text-[12px] text-ink-2">¿Qué se hace con la diferencia?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["VUELTO", "Vuelto", HandCoins],
                    ["PROPINA", "Propina", Coins],
                    ["CAJA", "A caja", PiggyBank],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDestinoVuelto(k)}
                    className={cn(
                      "flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border text-[11px] transition-colors",
                      destinoVuelto === k
                        ? "border-brand bg-brand/15 text-brand"
                        : "border-line text-ink-2 hover:text-ink",
                    )}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
              {destinoVuelto === "CAJA" && sobra.amount > maxRetained.amount && (
                <p className="text-[12px] text-state-crit">
                  Por encima del umbral ({toMajor(maxRetained)} USD) no se puede dejar en caja: hay
                  que dar vuelto o marcarlo como propina.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12.5px] text-state-crit">
              {error}
            </p>
          )}

          <Button
            surface="pos"
            variant="primary"
            disabled={!puedeCobrar}
            onClick={cobrar}
            className="w-full"
          >
            Cerrar cobro
          </Button>

          {!puedeCobrar && pagos.length > 0 && (
            <p className="text-center text-[12px] text-ink-3">
              {faltaTasa ? "Falta la tasa del día" : `Faltan ${toMajor(falta)} USD por cubrir`}
            </p>
          )}

          {cobrado && (
            <div role="status" className="flex items-start gap-3 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-3">
              <CircleCheckBig size={16} className="mt-0.5 shrink-0 text-state-ok" aria-hidden="true" />
              <p className="text-[13px] text-ink">
                Cobrados USD {cobrado.total}
                {cobrado.vuelto !== "0.00" && ` · vuelto USD ${cobrado.vuelto}`}.
              </p>
            </div>
          )}
        </aside>
      </Container>
    </div>
  );
}
