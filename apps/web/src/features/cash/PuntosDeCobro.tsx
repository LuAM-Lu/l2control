import { Banknote, Store, Ticket } from "lucide-react";
import type { PointOfSale } from "@l2/domain-cash";
import { MoneyDisplay, formatMoneyVE, cn } from "@l2/ui";

/**
 * Lo cobrado en cada punto de cobro — F4-01b, DEC-13.
 *
 * DEC-13 eligió **una sola caja**: un turno, una gaveta, un arqueo. El precio
 * de esa simplicidad es que, si el arqueo no cuadra, hay que poder decir de
 * qué punto viene la diferencia. Esta pieza lo dice: por punto y por moneda,
 * cuánto se cobró y cuánto efectivo aportó a la gaveta.
 */

export type FilaPunto = {
  punto: PointOfSale;
  moneda: string;
  /** Todo lo cobrado en ese punto, por cualquier medio. Unidades mayores. */
  cobrado: string;
  /** Efecto neto sobre la gaveta: efectivo recibido menos vuelto entregado. */
  efectivoNeto: string;
};

type DefPunto = Readonly<{
  id: PointOfSale;
  nombre: string;
  detalle: string;
  Icono: typeof Ticket;
}>;

const PUNTOS: readonly DefPunto[] = [
  { id: "TAQUILLA", nombre: "Taquilla", detalle: "Entrada y salida del parque", Icono: Ticket },
  { id: "MOSTRADOR", nombre: "Mostrador", detalle: "Caja del local", Icono: Store },
];

export function PuntosDeCobro({
  filas,
  className,
}: {
  filas: readonly FilaPunto[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:p-4.5 shadow-card flex flex-col justify-between",
        className,
      )}
    >
      <div>
        <div className="mb-3">
          <h2 className="font-display mb-0.5 text-base font-bold text-ink">Por punto de cobro</h2>
          <p className="text-xs text-ink-3">
            Conciliación por terminal física y aporte neto a gaveta.
          </p>
        </div>

        <div className="grid grid-cols-1 min-[500px]:grid-cols-2 gap-2.5">
          {PUNTOS.map(({ id, nombre, detalle, Icono }) => {
            const propias = filas.filter((f) => f.punto === id);
            const esTaquilla = id === "TAQUILLA";

            return (
              <div
                key={id}
                className="rounded-[var(--radius-control)] border border-line/60 bg-surface-2/40 p-2.5 transition-colors duration-[var(--dur-rapida)] hover:border-line hover:bg-surface-2/70"
              >
                {/* Cabecera del terminal con avatar estilizado */}
                <div className="flex items-center justify-between gap-2 border-b border-line/40 pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6.5 shrink-0 items-center justify-center rounded-lg border shadow-sm",
                        esTaquilla
                          ? "border-brand/30 bg-brand/15 text-brand"
                          : "border-line-strong bg-surface text-ink",
                      )}
                    >
                      <Icono size={14} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="font-display text-xs font-bold leading-none text-ink">
                        {nombre}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-3">{detalle}</p>
                    </div>
                  </div>
                  <span className="rounded bg-surface px-1.5 py-0.2 text-[9.5px] font-medium tracking-wide text-ink-3 uppercase">
                    {esTaquilla ? "Acceso" : "Local"}
                  </span>
                </div>

                {propias.length === 0 ? (
                  <p className="mt-2.5 text-xs text-ink-3">Sin cobros en este turno.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {propias.map((f) => (
                      <li
                        key={f.moneda}
                        className="rounded-md border border-line/40 bg-base/50 p-1.5 transition-colors hover:border-line"
                      >
                        {/* Monto en su propio renglón si no cabe: una cifra en bolívares
                            de 6 a 8 dígitos no se sale de la tarjeta (CLAUDE.md). */}
                        <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <InsigniaMoneda moneda={f.moneda} />
                            <span className="text-xs font-semibold text-ink-2">
                              {f.moneda}
                            </span>
                          </div>
                          <MoneyDisplay value={f.cobrado} currency={f.moneda} size="sm" className="ml-auto" />
                        </div>

                        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-1.5 border-t border-line/30 pt-0.5 text-[10px]">
                          <span className="flex items-center gap-1 text-ink-3">
                            <Banknote size={10} className="text-brand" aria-hidden="true" />
                            <span>Cajón:</span>
                          </span>
                          <span className="tnum ml-auto font-medium text-ink-2">
                            {formatMoneyVE(f.efectivoNeto, f.moneda)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function InsigniaMoneda({ moneda }: { moneda: string }) {
  if (moneda === "USD") {
    return (
      <span className="inline-flex size-4.5 items-center justify-center rounded-md border border-brand/30 bg-brand/15 text-[10.5px] font-bold text-brand">
        $
      </span>
    );
  }
  if (moneda === "VES") {
    return (
      <span className="inline-flex h-4.5 items-center justify-center rounded-md border border-line px-1 text-[9.5px] font-bold text-ink-2">
        Bs
      </span>
    );
  }
  return (
    <span className="inline-flex size-4.5 items-center justify-center rounded-md border border-state-ok/30 bg-state-ok-bg text-[10px] font-bold text-state-ok">
      ₮
    </span>
  );
}
