import {
  Banknote,
  Coins,
  CreditCard,
  Landmark,
  Smartphone,
  Wallet,
  Zap,
} from "lucide-react";
import { MoneyDisplay, cn } from "@l2/ui";

/**
 * De dónde vino el dinero, por medio de pago — F4-07, F9-00.
 *
 * Lo usan el inicio del back-office y el turno de caja. Se agrupa POR MONEDA
 * y la barra compara solo dentro de su grupo.
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
        "rounded-[var(--radius-card)] border border-line bg-surface p-4 xl:p-4.5 shadow-card flex flex-col justify-between",
        className,
      )}
    >
      <div>
        <div className="mb-3">
          <h2 className="font-display mb-0.5 text-base font-bold text-ink">{titulo}</h2>
          <p className="text-xs text-ink-3">Desglose del turno por método y destino.</p>
        </div>

        {porMedio.length === 0 ? (
          <p className="text-xs text-ink-3">Todavía no ha entrado dinero en este turno.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {monedas.map((moneda) => {
              const grupo = porMedio.filter((m) => m.moneda === moneda);

              return (
                <div key={moneda} className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-bold tracking-[0.1em] text-ink-3 uppercase">
                      {moneda}
                    </span>
                    <span className="h-px flex-1 bg-line/40" />
                  </div>

                  <ul className="flex flex-col gap-1.5">
                    {grupo.map((m) => {
                      const { Icon, estilo } = obtenerEstiloMedio(m.medio);

                      return (
                        <li
                          key={`${m.medio}|${m.moneda}`}
                          className="flex items-center justify-between gap-2 rounded-md border border-line/40 bg-surface-2/30 px-2.5 py-1.5 transition-colors hover:border-line hover:bg-surface-2/60"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                "flex size-5.5 shrink-0 items-center justify-center rounded-md border shadow-xs",
                                estilo,
                              )}
                            >
                              <Icon size={12} aria-hidden="true" />
                            </span>
                            <span className="truncate text-xs font-medium text-ink">
                              {m.medio}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-semibold tracking-wide uppercase",
                                m.enGaveta
                                  ? "border border-brand/25 bg-brand/10 text-brand"
                                  : "border border-line bg-surface text-ink-3",
                              )}
                            >
                              {m.enGaveta ? (
                                <>
                                  <Wallet size={8.5} aria-hidden="true" />
                                  <span className="hidden min-[400px]:inline">Gaveta</span>
                                </>
                              ) : (
                                <>
                                  <Landmark size={8.5} aria-hidden="true" />
                                  <span className="hidden min-[400px]:inline">Banco</span>
                                </>
                              )}
                            </span>
                          </div>

                          <MoneyDisplay value={m.total} currency={m.moneda} size="sm" />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function obtenerEstiloMedio(medio: string) {
  const m = medio.toLowerCase();
  if (m.includes("efectivo")) {
    return {
      Icon: Banknote,
      estilo: "border-brand/30 bg-brand/15 text-brand",
    };
  }
  if (m.includes("zelle")) {
    return {
      Icon: Zap,
      estilo: "border-amber-400/30 bg-amber-400/15 text-brand",
    };
  }
  if (m.includes("móvil") || m.includes("movil")) {
    return {
      Icon: Smartphone,
      estilo: "border-line-strong bg-surface text-ink",
    };
  }
  if (m.includes("punto") || m.includes("débito") || m.includes("tarjeta")) {
    return {
      Icon: CreditCard,
      estilo: "border-line-strong bg-surface text-ink",
    };
  }
  if (m.includes("usdt") || m.includes("cripto")) {
    return {
      Icon: Coins,
      estilo: "border-state-ok/30 bg-state-ok-bg text-state-ok",
    };
  }
  return {
    Icon: Wallet,
    estilo: "border-line bg-surface text-ink-2",
  };
}
