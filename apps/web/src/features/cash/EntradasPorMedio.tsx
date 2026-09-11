import { MoneyDisplay, cn } from "@l2/ui";

/**
 * De dónde vino el dinero, por medio de pago — F4-07, F9-00.
 *
 * Lo usan el inicio del back-office y el turno de caja. Antes cada uno tenía
 * su versión —una lista plana en turno, barras en inicio— y mostraban la
 * misma cifra de dos maneras distintas.
 *
 * Se agrupa POR MONEDA y la barra compara solo dentro de su grupo. Poner
 * dólares y bolívares en la misma barra daría una imagen falsa: 18.272 Bs
 * parecería veinte veces más que 70,58 USD cuando es menos de la mitad.
 */

export type PorMedio = {
  medio: string;
  moneda: string;
  /** Unidades mayores ya formateadas, para mostrar. */
  total: string;
  /** Unidades menores como texto: la proporción se calcula con enteros. */
  minor: string;
  /** Si entra en el arqueo de efectivo o se concilia contra su estado de cuenta. */
  enGaveta: boolean;
};

export function EntradasPorMedio({
  porMedio,
  titulo = "Entró hoy",
  className,
}: {
  porMedio: readonly PorMedio[];
  titulo?: string;
  className?: string;
}) {
  const monedas = [...new Set(porMedio.map((m) => m.moneda))];

  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      <h2 className="font-display mb-4 text-base font-bold text-ink">{titulo}</h2>

      {porMedio.length === 0 ? (
        <p className="text-[13px] text-ink-3">Todavía no ha entrado dinero en este turno.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {monedas.map((moneda) => {
            const grupo = porMedio.filter((m) => m.moneda === moneda);
            const mayor = grupo.reduce(
              (max, m) => (BigInt(m.minor) > max ? BigInt(m.minor) : max),
              1n,
            );

            return (
              <div key={moneda}>
                <p className="mb-2 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                  {moneda}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {grupo.map((m) => {
                    // Proporción entera sobre unidades menores: el dinero no
                    // pasa por un decimal ni para dibujar una barra (§5.1).
                    const proporcion = Number((BigInt(m.minor) * 100n) / mayor);
                    return (
                      <li key={`${m.medio}|${m.moneda}`}>
                        <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate text-ink-2">{m.medio}</span>
                            {!m.enGaveta && (
                              <span
                                title="No entra en el arqueo de efectivo: se concilia contra su propio estado de cuenta"
                                className="shrink-0 text-[10px] tracking-wide text-ink-3 uppercase"
                              >
                                fuera de gaveta
                              </span>
                            )}
                          </span>
                          <MoneyDisplay value={m.total} currency={m.moneda} size="sm" />
                        </div>
                        <span
                          aria-hidden="true"
                          className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-base"
                        >
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              m.enGaveta ? "bg-brand/70" : "bg-line-strong",
                            )}
                            style={{ width: `${Math.max(proporcion, 2)}%` }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
