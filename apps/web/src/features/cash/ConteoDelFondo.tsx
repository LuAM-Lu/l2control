"use client";

import { countDenominations } from "@l2/domain-cash";
import { toMajor, type Money } from "@l2/domain-money";
import { MoneyDisplay, Stepper } from "@l2/ui";
import { DENOMINACIONES } from "./turno.ts";

/**
 * El fondo de la apertura contado por billete — B3-22 (M-38, W-9).
 *
 * Con fondo fijo, la caja no teclea el fondo: lo cuenta billete por billete, como en el arqueo, y el servidor lo compara
 * con lo que quedó en el último cierre. Una moneda por columna, cada billete en un renglón con su cantidad.
 */

export const MONEDAS_DEL_FONDO = ["USD", "VES"] as const;
type Moneda = (typeof MONEDAS_DEL_FONDO)[number];
export type ConteoDelFondo = Readonly<Record<string, number>>;

const clave = (m: Moneda, den: Money) => `${m}|${toMajor(den)}`;
const dto = (m: Money) => ({ minor: String(m.amount), currency: m.currency });

/** Lo que suma cada moneda. */
export function totalDelConteo(conteo: ConteoDelFondo, m: Moneda): Money {
  return countDenominations(DENOMINACIONES[m].map((d) => ({ denomination: d, count: conteo[clave(m, d)] ?? 0 })), m);
}

/** Los billetes, como los pide el servidor (`ConteoMonedaSchema`): sin los que no hay. */
export function billetesDelConteo(conteo: ConteoDelFondo) {
  return MONEDAS_DEL_FONDO.map((m) => ({
    currency: m,
    billetes: DENOMINACIONES[m].map((d) => ({ denominacion: dto(d), cantidad: conteo[clave(m, d)] ?? 0 })).filter((b) => b.cantidad > 0),
  }));
}

export function ConteoDelFondo({ conteo, onCambiar, deshabilitado }: { conteo: ConteoDelFondo; onCambiar: (c: ConteoDelFondo) => void; deshabilitado?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MONEDAS_DEL_FONDO.map((m) => (
        <fieldset key={m} className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 flex w-full items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{m === "USD" ? "Dólares" : "Bolívares"}</span>
            <MoneyDisplay value={toMajor(totalDelConteo(conteo, m))} currency={m} size="sm" />
          </legend>
          {DENOMINACIONES[m].map((den) => (
            <div key={clave(m, den)} className="flex items-center justify-between gap-1.5">
              <span className="tnum w-12 shrink-0 text-detalle font-semibold text-ink">{toMajor(den)}</span>
              <Stepper
                value={conteo[clave(m, den)] ?? 0}
                onChange={(v) => onCambiar({ ...conteo, [clave(m, den)]: v })}
                label={`Billetes de ${toMajor(den)} ${m}`}
                disabled={deshabilitado === true}
                surface="tablet"
              />
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
