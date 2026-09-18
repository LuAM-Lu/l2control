import { cn } from "@l2/ui";
import type { Excepcion } from "./turno.ts";

/**
 * Excepciones del turno — F4-08.
 *
 * Anulaciones, descuentos, cortesías y reimpresiones, con quién las hizo y
 * quién las autorizó. Visibles donde se trabaja, no enterradas en un registro
 * que nadie abre (§7.5).
 *
 * Lo usan el inicio y el turno de caja. Antes el turno lo pintaba como tabla
 * de cinco columnas y el inicio como lista: la misma información con dos
 * formas, que es de lo que está hecho un producto que se siente desordenado.
 */
export function ExcepcionesTurno({
  excepciones,
  className,
}: {
  excepciones: readonly Excepcion[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:p-4.5 shadow-card",
        className,
      )}
    >
      <h2 className="font-display mb-0.5 flex items-baseline gap-2 text-base font-bold text-ink">
        Excepciones del turno
        <span className="tnum text-[13px] font-medium text-ink-3">{excepciones.length}</span>
      </h2>
      <p className="mb-3 text-xs text-ink-3">
        Anulaciones, descuentos, cortesías y reimpresiones.
      </p>

      {excepciones.length === 0 ? (
        <p className="text-[13px] text-ink-3">Sin excepciones en este turno.</p>
      ) : (
        <ul className="flex flex-col max-h-[350px] overflow-y-auto overflow-x-hidden">
          {excepciones.map((e, i) => (
            <li
              key={i}
              className="flex items-start gap-3 border-b border-line/50 py-2.5 text-[13px] last:border-0 hover:bg-surface-2/30 px-1.5 rounded-[var(--radius-control)] transition-colors duration-[var(--dur-rapida)]"
            >
              <span className="tnum shrink-0 pt-0.5 text-[12px] text-ink-3">{e.hora}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-[var(--radius-control)] border text-[10.5px] font-mono font-medium tracking-wide",
                      e.tipo === "ANULACIÓN"
                        ? "border-state-crit/30 bg-state-crit-bg text-state-crit"
                        : e.tipo === "CORTESÍA"
                          ? "border-line bg-surface-2 text-ink-2"
                          : "border-state-warn/30 bg-state-warn-bg text-state-warn",
                    )}
                  >
                    {e.tipo}
                  </span>
                  <span className="font-medium text-ink">{e.detalle}</span>
                </span>
                <span className="mt-1 block text-[12px] text-ink-2">
                  {e.motivo} · <span className="text-ink-3">{e.usuario}</span>
                  {e.autorizadoPor && (
                    <span className="text-ink-3"> · autorizó <strong className="font-medium text-ink-2">{e.autorizadoPor}</strong></span>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
