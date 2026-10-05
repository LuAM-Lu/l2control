"use client";

import type { ExcepcionDto } from "@l2/contracts";
import { money, toMajor, type CurrencyCode } from "@l2/domain-money";
import { MoneyDisplay, cn } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";

/**
 * Excepciones del turno — F4-08, del servidor desde B3-5.
 *
 * Anulaciones, cortesías, reimpresiones, redondeos que quedaron en caja, cuentas incobrables y la
 * diferencia del arqueo, con quién las hizo, por qué y quién las autorizó. Visibles donde se
 * trabaja, no enterradas en un registro que nadie abre (§7.5).
 *
 * Lo usan Inicio (el día) y el turno de caja (el turno): la misma información con la misma forma.
 */

const TIPO: Record<ExcepcionDto["tipo"], { texto: string; tono: "crit" | "warn" | "neutro" }> = {
  ANULACION: { texto: "Anulación", tono: "crit" },
  INCOBRABLE: { texto: "Incobrable", tono: "crit" },
  DIFERENCIA: { texto: "Diferencia de arqueo", tono: "warn" },
  DESCUENTO: { texto: "Descuento", tono: "warn" },
  RESIDUO: { texto: "Redondeo en caja", tono: "neutro" },
  CORTESIA: { texto: "Cortesía", tono: "neutro" },
  REIMPRESION: { texto: "Reimpresión", tono: "neutro" },
  // Lo cargado desde papel (B3-7): sin revisar pide atención; revisado ya no.
  PAPEL: { texto: "Desde papel", tono: "warn" },
};

export function ExcepcionesTurno({
  excepciones,
  titulo = "Excepciones del turno",
  sinTitulo = false,
  className,
}: {
  excepciones: readonly ExcepcionDto[];
  titulo?: string;
  /** Dentro de una hoja que ya lleva el título, sin repetirlo. */
  sinTitulo?: boolean;
  className?: string;
}) {
  const { ajustes } = useSucursal();
  return (
    <section className={cn("flex min-h-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card xl:p-4.5", className)}>
      {!sinTitulo && (
        <>
          <h2 className="font-display mb-0.5 flex items-baseline gap-2 text-base font-bold text-ink">
            {titulo}
            <span className="tnum text-[13px] font-medium text-ink-3">{excepciones.length}</span>
          </h2>
          <p className="mb-3 text-xs text-ink-3">Anulaciones, cortesías, reimpresiones, incobrables y diferencias de arqueo.</p>
        </>
      )}

      {excepciones.length === 0 ? (
        <p className="text-[13px] text-ink-3">Sin excepciones.</p>
      ) : (
        <ul className="flex min-h-0 flex-col overflow-x-hidden overflow-y-auto">
          {excepciones.map((e, i) => {
            const t = TIPO[e.tipo];
            return (
              <li key={`${e.at}-${i}`} className="flex items-start gap-3 rounded-[var(--radius-control)] border-b border-line/50 px-1.5 py-2.5 text-[13px] last:border-0">
                <span className="tnum shrink-0 pt-0.5 text-[12px] text-ink-3">{formatClock(Date.parse(e.at), ajustes.formatoHora, ajustes.zonaHoraria)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-[var(--radius-control)] border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide",
                        t.tono === "crit"
                          ? "border-state-crit/30 bg-state-crit-bg text-state-crit"
                          : t.tono === "warn"
                            ? "border-state-warn/30 bg-state-warn-bg text-state-warn"
                            : "border-line bg-surface-2 text-ink-2",
                      )}
                    >
                      {t.texto}
                    </span>
                    <span className="min-w-0 font-medium text-ink">{e.detalle}</span>
                    {e.importe && (
                      <MoneyDisplay
                        value={toMajor(money(BigInt(e.importe.minor), e.importe.currency as CurrencyCode))}
                        currency={e.importe.currency}
                        size="sm"
                        className="ml-auto"
                      />
                    )}
                  </span>
                  <span className="mt-1 block text-[12px] text-ink-2">
                    {e.motivo} · <span className="text-ink-3">{e.usuario}</span>
                    {e.autorizadoPor && (
                      <span className="text-ink-3">
                        {" "}
                        · autorizó <strong className="font-medium text-ink-2">{e.autorizadoPor}</strong>
                      </span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
