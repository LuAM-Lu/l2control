import { cn } from "@l2/ui";
import type { Excepcion } from "./shift-fixtures.ts";

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
        "rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      <h2 className="font-display mb-1 flex items-baseline gap-2 text-base font-bold text-ink">
        Excepciones del turno
        <span className="tnum text-[13px] font-medium text-ink-3">{excepciones.length}</span>
      </h2>
      <p className="mb-4 text-[12px] text-ink-3">
        Anulaciones, descuentos, cortesías y reimpresiones.
      </p>

      {excepciones.length === 0 ? (
        <p className="text-[13px] text-ink-3">Sin excepciones en este turno.</p>
      ) : (
        <ul className="flex flex-col">
          {excepciones.map((e, i) => (
            <li
              key={i}
              className="flex items-baseline gap-3 border-b border-line/50 py-2.5 text-[13px] last:border-0"
            >
              <span className="tnum shrink-0 text-ink-3">{e.hora}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn(
                      "font-mono text-[10.5px] font-semibold tracking-wide",
                      e.tipo === "ANULACIÓN" ? "text-state-crit" : "text-state-warn",
                    )}
                  >
                    {e.tipo}
                  </span>
                  <span className="text-ink-2">{e.detalle}</span>
                </span>
                <span className="mt-0.5 block text-[11.5px] text-ink-3">
                  {e.motivo} · {e.usuario}
                  {e.autorizadoPor && ` · autorizó ${e.autorizadoPor}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
