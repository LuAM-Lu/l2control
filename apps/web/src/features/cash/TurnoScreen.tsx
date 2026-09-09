"use client";

import { useMemo, useState } from "react";
import {
  CircleCheckBig,
  FileText,
  Lock,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { type CurrencyCode, type Money, toMajor, zero } from "@l2/domain-money";
import {
  countDenominations,
  reconcile,
  tallyShift,
  type ShiftMovement,
  type ShiftStatus,
} from "@l2/domain-cash";
import { Badge, Button, Input, MoneyDisplay, StatTile, cn } from "@l2/ui";
import { DENOMINACIONES, MEDIO_LABEL, type Excepcion } from "./shift-fixtures.ts";

/**
 * Turno de caja: arqueo y cortes X/Z — F4-05, F4-06, F4-07, F4-08.
 *
 * DOS DISTINCIONES QUE HACEN QUE UN ARQUEO SIRVA
 *
 *  1. **Solo se cuenta lo que está en la gaveta.** El Pago Móvil, el punto de
 *     venta y el Zelle no están en el cajón: contarlos contra el efectivo
 *     inventa una diferencia que no existe. Se concilian contra su propio
 *     estado de cuenta.
 *  2. **Cada moneda se cuadra por separado.** Un faltante en dólares y un
 *     sobrante en bolívares no se compensan; sumarlos escondería justo lo que
 *     hay que ver.
 *
 * Y el cajero cuenta BILLETES, no importes: pedirle el total ya sumado invita
 * a cuadrarlo «a ojo» contra lo que el sistema espera, que es lo que un
 * arqueo debe impedir.
 */
export function TurnoScreen({
  movements,
  excepciones,
}: {
  movements: readonly ShiftMovement[];
  excepciones: readonly Excepcion[];
  // El turno, la hora de apertura y quién está en caja los muestra la barra
  // de estación (§8.5): repetirlos aquí era la duplicación que hacía que cada
  // pantalla se viera distinta.
}) {
  const [status, setStatus] = useState<ShiftStatus>("ABIERTO");
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [cortesX, setCortesX] = useState(0);
  const [confirmandoZ, setConfirmandoZ] = useState(false);

  const tally = useMemo(() => tallyShift(movements), [movements]);

  /** Lo contado por el cajero, sumando denominaciones. */
  const contadoPorMoneda = useMemo(() => {
    const out = new Map<CurrencyCode, Money>();
    for (const moneda of ["USD", "VES"] as const) {
      const entries = DENOMINACIONES[moneda].map((d) => ({
        denomination: d,
        count: Number.parseInt(conteo[`${moneda}|${toMajor(d)}`] ?? "0", 10) || 0,
      }));
      out.set(moneda, countDenominations(entries, moneda));
    }
    return out;
  }, [conteo]);

  const cuadre = useMemo(
    () =>
      reconcile(
        tally.drawer.map((d) => ({
          currency: d.currency,
          counted: contadoPorMoneda.get(d.currency) ?? zero(d.currency),
          expected: d.expected,
        })),
      ),
    [tally.drawer, contadoPorMoneda],
  );

  const hayDiferencia = cuadre.some((c) => c.difference.amount !== 0n);
  const sellado = status === "CERRADO_Z";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-end justify-between gap-x-8 gap-y-4 px-6 py-4">
          <div>
            <div>
              <h1 className="font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink">
                Turno de caja
              </h1>
            </div>
          </div>

          <div className="flex items-end gap-6">
            <StatTile label="Cortes X" value={cortesX} />
            {sellado ? (
              <Badge tone="crit" icon={<Lock size={13} aria-hidden="true" />}>
                Turno sellado con corte Z
              </Badge>
            ) : (
              <Badge tone="ok">Abierto</Badge>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1500px] flex-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* -------------------------------------------- lo que dice el libro */}
        <section className="flex flex-col gap-6">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-display mb-1 text-lg font-bold text-ink">Movimiento por medio</h2>
            <p className="mb-4 text-[12.5px] text-ink-3">
              Lo que el libro registra. Los medios que no están en la gaveta se concilian contra su
              propio estado de cuenta, no contra el efectivo.
            </p>
            <ul className="flex flex-col gap-2">
              {tally.byMethod.map((m) => (
                <li
                  key={`${m.methodCode}|${m.currency}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-ink-2">{MEDIO_LABEL[m.methodCode] ?? m.methodCode}</span>
                    {!m.inDrawer && (
                      <span className="text-[10px] tracking-wide text-ink-3 uppercase">
                        fuera de gaveta
                      </span>
                    )}
                  </span>
                  <MoneyDisplay value={toMajor(m.total)} currency={m.currency} size="sm" />
                </li>
              ))}
            </ul>
          </div>

          {/* Excepciones — F4-08. Visibles, no enterradas en un log. */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-display mb-1 flex items-center gap-2 text-lg font-bold text-ink">
              <ShieldAlert size={17} className="text-state-warn" aria-hidden="true" />
              Excepciones del turno
            </h2>
            <p className="mb-4 text-[12.5px] text-ink-3">
              Anulaciones, descuentos, cortesías y reimpresiones, con quién las hizo y quién las
              autorizó.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["Hora", "Tipo", "Detalle", "Usuario", "Autorizó"].map((h) => (
                      <th
                        key={h}
                        className="pb-2 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excepciones.map((e, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      <td className="tnum py-2 text-ink-3">{e.hora}</td>
                      <td className="py-2">
                        <Badge tone={e.tipo === "ANULACIÓN" ? "crit" : "warn"}>{e.tipo}</Badge>
                      </td>
                      <td className="py-2 text-ink-2">
                        {e.detalle}
                        <span className="block text-[11px] text-ink-3">{e.motivo}</span>
                      </td>
                      <td className="py-2 text-ink-2">{e.usuario}</td>
                      <td className="py-2 text-ink-3">{e.autorizadoPor ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- el arqueo */}
        <section className="flex flex-col gap-6">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-display mb-1 text-lg font-bold text-ink">Arqueo físico</h2>
            <p className="mb-4 text-[12.5px] text-ink-3">
              Cuenta los billetes y monedas de la gaveta. El sistema no muestra lo que espera hasta
              que termines de contar.
            </p>

            {tally.drawer.map((d) => {
              const linea = cuadre.find((c) => c.currency === d.currency);
              const contado = contadoPorMoneda.get(d.currency) ?? zero(d.currency);
              const algoContado = contado.amount !== 0n;

              return (
                <div key={d.currency} className="mb-5 last:mb-0">
                  <h3 className="font-display mb-2 text-sm font-semibold text-ink">
                    Efectivo en {d.currency}
                  </h3>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DENOMINACIONES[d.currency as "USD" | "VES"].map((den) => {
                      const clave = `${d.currency}|${toMajor(den)}`;
                      return (
                        <Input
                          key={clave}
                          surface="admin"
                          label={toMajor(den)}
                          value={conteo[clave] ?? ""}
                          onChange={(e) =>
                            setConteo((prev) => ({ ...prev, [clave]: e.target.value }))
                          }
                          disabled={sellado}
                          inputMode="numeric"
                          placeholder="0"
                          autoComplete="off"
                        />
                      );
                    })}
                  </div>

                  <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink-2">Contado</dt>
                      <dd>
                        <MoneyDisplay value={toMajor(contado)} currency={d.currency} size="sm" />
                      </dd>
                    </div>

                    {/* El teórico solo aparece cuando ya se contó: verlo antes
                        invita a «cuadrar» el conteo en lugar de contar. */}
                    {algoContado ? (
                      <>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-ink-2">Teórico según el libro</dt>
                          <dd>
                            <MoneyDisplay
                              value={toMajor(d.expected)}
                              currency={d.currency}
                              size="sm"
                              tone="muted"
                            />
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-2">
                          <dt
                            className={cn(
                              "font-semibold",
                              linea && linea.difference.amount === 0n
                                ? "text-state-ok"
                                : "text-state-crit",
                            )}
                          >
                            {linea && linea.difference.amount === 0n
                              ? "Cuadra"
                              : linea && linea.difference.amount > 0n
                                ? "Sobra"
                                : "Falta"}
                          </dt>
                          <dd>
                            <MoneyDisplay
                              value={toMajor(linea?.difference ?? zero(d.currency))}
                              currency={d.currency}
                              size="md"
                              tone={
                                linea && linea.difference.amount === 0n ? "positive" : "negative"
                              }
                            />
                          </dd>
                        </div>
                      </>
                    ) : (
                      <p className="text-[12px] text-ink-3">
                        Cuenta el efectivo para ver el cuadre.
                      </p>
                    )}
                  </dl>
                </div>
              );
            })}
          </div>

          {/* ------------------------------------------------- los cortes */}
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-bold text-ink">Cortes</h2>

            <Button
              surface="pos"
              variant="neutral"
              disabled={sellado}
              onClick={() => setCortesX((n) => n + 1)}
              className="w-full"
            >
              <FileText size={16} aria-hidden="true" />
              Corte X · arqueo del turno
            </Button>
            <p className="text-[12px] text-ink-3">
              Se puede repetir cuantas veces haga falta. <strong>No cierra el turno</strong> y queda
              en auditoría.
            </p>

            {hayDiferencia && !sellado && (
              <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[12.5px] text-state-warn">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                Hay diferencia en el arqueo. El corte Z la dejará registrada con tu nombre; hace
                falta justificarla.
              </p>
            )}

            {!confirmandoZ ? (
              <Button
                surface="pos"
                variant="danger"
                disabled={sellado}
                onClick={() => setConfirmandoZ(true)}
                className="w-full"
              >
                <Lock size={16} aria-hidden="true" />
                Corte Z · cerrar el turno
              </Button>
            ) : (
              // Acción irreversible: la confirmación dice exactamente qué pasa,
              // y el botón de confirmar no está donde estaba el primero (§8.4).
              <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg p-3">
                <p className="text-[13px] text-ink">
                  El corte Z es <strong>irreversible</strong>. Sella los correlativos y después
                  ninguna operación monetaria podrá tocar este turno.
                </p>
                <div className="flex gap-2">
                  <Button
                    surface="tablet"
                    variant="ghost"
                    onClick={() => setConfirmandoZ(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    surface="tablet"
                    variant="danger"
                    onClick={() => {
                      setStatus("CERRADO_Z");
                      setConfirmandoZ(false);
                    }}
                    className="flex-1"
                  >
                    Sí, cerrar el turno
                  </Button>
                </div>
              </div>
            )}

            {sellado && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-3"
              >
                <CircleCheckBig
                  size={16}
                  className="mt-0.5 shrink-0 text-state-ok"
                  aria-hidden="true"
                />
                <p className="text-[13px] text-ink">
                  Turno cerrado con corte Z. Los correlativos quedaron sellados y no admite más
                  operaciones.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
