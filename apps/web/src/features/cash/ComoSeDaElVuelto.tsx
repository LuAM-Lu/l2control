"use client";

import { useEffect, useState } from "react";
import { Banknote, Minus, Plus, Smartphone, Split, TriangleAlert } from "lucide-react";
import { changeInBolivares, proposeChange } from "@l2/domain-cash";
import { money, toMajor, type FrozenRate, type Money } from "@l2/domain-money";
import { Button, Dialog, cn, formatMoneyVE } from "@l2/ui";
import { BANCOS_VE } from "./bancos.ts";
import { gavetaAlcanza } from "./vuelto.acciones.ts";
import { faltaEnElVuelto, partesDelVuelto, type FormaDelVuelto } from "./vuelto.ts";

/**
 * Cómo se da el vuelto — B3-19 (M-37, U-12).
 *
 * En el local el vuelto se da en dólares, en bolívares, por Pago Móvil o mezclado. Aquí se elige, y cada parte sale de su
 * moneda y su medio: el arqueo de $ y de Bs cuadra y el recibo lo dice. La caja ayuda: «Repartido» propone los dólares
 * enteros en billetes y los centavos en bolívares, a la tasa del cobro, y avisa si la gaveta no alcanza esa moneda (sin
 * decir cuánto hay: el arqueo es a ciegas).
 */
export function ComoSeDaElVuelto({
  abierto,
  sobra,
  rate,
  forma,
  onCambiar,
  onCerrar,
}: {
  abierto: boolean;
  /** Lo que sobra, en dólares. */
  sobra: Money;
  /** La tasa del cobro (bolívares → dólares); sin ella, solo en dólares. */
  rate: FrozenRate | null;
  forma: FormaDelVuelto;
  onCambiar: (f: FormaDelVuelto) => void;
  onCerrar: () => void;
}) {
  const [faltan, setFaltan] = useState<readonly string[]>([]);
  const enBs = (usd: Money) => (rate ? formatMoneyVE(toMajor(changeInBolivares(usd, rate)), "VES") : "—");
  const partes = partesDelVuelto(forma, sobra) ?? [{ method: "EFECTIVO_USD" as const, enDolares: { minor: String(sobra.amount), currency: "USD" as const } }];
  const huella = partes.map((p) => `${p.method}:${p.enDolares.minor}`).join("|");

  // Lo que sale de la gaveta (el Pago Móvil no): ¿alcanza? Solo dice qué moneda no.
  useEffect(() => {
    if (!abierto) return;
    const salidas = partes
      .filter((p) => p.method !== "PAGO_MOVIL")
      .map((p) => {
        const usd = money(BigInt(p.enDolares.minor), "USD");
        const m = p.method === "EFECTIVO_VES" && rate ? changeInBolivares(usd, rate) : usd;
        return { minor: String(m.amount), currency: m.currency };
      });
    if (salidas.length === 0) return setFaltan([]);
    let vigente = true;
    void gavetaAlcanza({ salidas })
      .then((r) => vigente && setFaltan(r.ok ? r.valor.faltan : []))
      .catch(() => vigente && setFaltan([]));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, huella]);

  const propuesta = proposeChange(sobra, rate !== null);
  const enteros = Number(sobra.amount / 100n);
  const usaMovil = partes.some((p) => p.method === "PAGO_MOVIL");
  const falta = faltaEnElVuelto(forma, sobra);

  const opcion = (tipo: FormaDelVuelto["tipo"], titulo: string, detalle: string, Icono: typeof Banknote, deshabilitada = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={forma.tipo === tipo}
      disabled={deshabilitada}
      title={deshabilitada ? "Sin tasa no se da vuelto en bolívares" : undefined}
      onClick={() =>
        onCambiar(tipo === "REPARTIDO" ? { ...forma, tipo, dolares: Number(propuesta.enDolares.amount / 100n) } : { ...forma, tipo })
      }
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        forma.tipo === tipo ? "border-brand bg-brand/15 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
    >
      <Icono size={18} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{titulo}</span>
        <span className="tnum block text-[12.5px] text-ink-3">{detalle}</span>
      </span>
    </button>
  );

  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Cómo se da el vuelto · ${formatMoneyVE(toMajor(sobra), "USD")}`}
      descripcion="Cada parte sale de su moneda: el arqueo de dólares y de bolívares cuadra, y el recibo dice cómo se dio."
      className="w-[min(36rem,calc(100vw-2rem))]"
      pie={
        <div className="flex justify-end">
          <Button surface="pos" variant="primary" onClick={onCerrar} disabled={falta !== null}>
            {falta ?? "Listo"}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label="Cómo se da el vuelto" className="grid gap-1.5 sm:grid-cols-2">
        {opcion("USD", "Efectivo $", formatMoneyVE(toMajor(sobra), "USD"), Banknote)}
        {opcion("VES", "Efectivo Bs", enBs(sobra), Banknote, !rate)}
        {opcion("MOVIL", "Pago Móvil", enBs(sobra), Smartphone, !rate)}
        {opcion(
          "REPARTIDO",
          "Repartido",
          rate && propuesta.enBolivares.amount > 0n
            ? `${formatMoneyVE(toMajor(propuesta.enDolares), "USD")} + ${enBs(propuesta.enBolivares)}`
            : "Dólares y bolívares",
          Split,
          !rate,
        )}
      </div>

      {forma.tipo === "REPARTIDO" && (
        <div className="mt-3 flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink-2">En billetes de dólar</span>
            <span className="flex items-center gap-1.5">
              <Button surface="pos" variant="neutral" className="w-14 px-0" aria-label="Un dólar menos" disabled={forma.dolares <= 0} onClick={() => onCambiar({ ...forma, dolares: forma.dolares - 1 })}>
                <Minus size={16} aria-hidden="true" />
              </Button>
              <span className="tnum min-w-16 text-center text-[16px] font-bold text-ink">$ {forma.dolares}</span>
              <Button surface="pos" variant="neutral" className="w-14 px-0" aria-label="Un dólar más" disabled={forma.dolares >= enteros} onClick={() => onCambiar({ ...forma, dolares: forma.dolares + 1 })}>
                <Plus size={16} aria-hidden="true" />
              </Button>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink-2">
              El resto,{" "}
              <span className="tnum font-semibold text-ink">
                {enBs(money(sobra.amount - BigInt(Math.min(forma.dolares, enteros)) * 100n, "USD"))}
              </span>
              , en
            </span>
            <span role="radiogroup" aria-label="El resto, en" className="flex gap-1.5">
              {(
                [
                  ["VES", "Efectivo Bs"],
                  ["MOVIL", "Pago Móvil"],
                ] as const
              ).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={forma.restoEn === k}
                  onClick={() => onCambiar({ ...forma, restoEn: k })}
                  className={cn(
                    "min-h-14 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold",
                    forma.restoEn === k ? "border-brand bg-brand/15 text-ink" : "border-line text-ink-2 hover:border-line-strong",
                  )}
                >
                  {t}
                </button>
              ))}
            </span>
          </div>
        </div>
      )}

      {usaMovil && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Banco del cliente</span>
            <select
              value={forma.movil?.banco ?? ""}
              onChange={(e) => onCambiar({ ...forma, movil: { banco: e.target.value, referencia: forma.movil?.referencia ?? "" } })}
              className="min-h-14 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[14px] text-ink"
            >
              <option value="">Elige el banco</option>
              {BANCOS_VE.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Referencia del envío</span>
            <input
              data-privado=""
              inputMode="numeric"
              autoComplete="off"
              value={forma.movil?.referencia ?? ""}
              onChange={(e) => onCambiar({ ...forma, movil: { banco: forma.movil?.banco ?? "", referencia: e.target.value.replace(/\D/g, "").slice(0, 20) } })}
              placeholder="Los dígitos de la referencia"
              className="tnum min-h-14 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[14px] text-ink"
            />
          </label>
        </div>
      )}

      {faltan.length > 0 && (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn">
          <TriangleAlert size={15} aria-hidden="true" />
          {faltan.includes("VES") && faltan.includes("USD")
            ? "En la gaveta no alcanzan los dólares ni los bolívares para este vuelto."
            : faltan.includes("VES")
              ? "En la gaveta no alcanzan los bolívares para este vuelto: da más en dólares o por Pago Móvil."
              : "En la gaveta no alcanzan los dólares para este vuelto: da una parte en bolívares o por Pago Móvil."}
        </p>
      )}
    </Dialog>
  );
}
