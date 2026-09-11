import { Store, Ticket } from "lucide-react";
import type { PointOfSale } from "@l2/domain-cash";
import { MoneyDisplay, cn } from "@l2/ui";

/**
 * Lo cobrado en cada punto de cobro — F4-01b, DEC-13.
 *
 * DEC-13 eligió **una sola caja**: un turno, una gaveta, un arqueo. El precio
 * de esa simplicidad es que, si el arqueo no cuadra, hay que poder decir de
 * qué punto viene la diferencia. Esta pieza lo dice: por punto y por moneda,
 * cuánto se cobró y cuánto efectivo aportó a la gaveta.
 *
 * Las dos cifras son distintas a propósito. Lo cobrado incluye el Pago Móvil y
 * el Zelle; el efectivo a gaveta no, y además descuenta el vuelto que se dio
 * en ese punto. Es la segunda la que explica un faltante en el cajón.
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

/** Los dos puntos, siempre en el mismo orden y siempre visibles: un punto sin
 *  cobros también es un dato. */
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
        "rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      <h2 className="font-display mb-1 text-base font-bold text-ink">Por punto de cobro</h2>
      <p className="mb-4 text-[12px] text-ink-3">
        Una sola caja, dos puntos. Si el arqueo no cuadra, aquí se ve de dónde viene.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {PUNTOS.map(({ id, nombre, detalle, Icono }) => {
          const propias = filas.filter((f) => f.punto === id);
          return (
            <div
              key={id}
              className="rounded-[var(--radius-control)] border border-line bg-base/40 p-3.5"
            >
              <p className="font-display flex items-center gap-2 text-sm font-bold text-ink">
                <Icono size={15} className="text-ink-3" aria-hidden="true" />
                {nombre}
              </p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">{detalle}</p>

              {propias.length === 0 ? (
                <p className="mt-3 text-[12.5px] text-ink-3">Sin cobros en este turno.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {propias.map((f) => (
                    <li key={f.moneda} className="flex flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                          {f.moneda}
                        </span>
                        <MoneyDisplay value={f.cobrado} currency={f.moneda} size="sm" />
                      </span>
                      <span className="tnum text-right text-[11.5px] text-ink-3">
                        efectivo a gaveta {f.efectivoNeto}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
