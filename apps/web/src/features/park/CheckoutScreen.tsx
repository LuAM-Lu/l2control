"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CircleCheckBig,
  LogOut,
  TriangleAlert,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import {
  CheckoutCommandSchema,
  WristbandCodeSchema,
  type MonitorSnapshotDto,
} from "@l2/contracts";
import { Badge, Button, Container, Initial, MoneyDisplay, ScannerField, StatTile } from "@l2/ui";
import { PackageOpen } from "lucide-react";
import { buildCheckoutPreview, moneyDtoToMajor } from "./settlement.ts";
import { formatClock, DEFAULT_TIME_FORMAT, type TimeFormat } from "./time-format.ts";

/**
 * Salida y liquidación del parque — F5-14.
 *
 * Dos decisiones de diseño que vienen del negocio, no del código:
 *
 *  · **Se liquidan varios niños a la vez.** Una familia se va junta; obligar a
 *    cerrar de uno en uno y cobrar tres veces sería más lento y produciría
 *    tres documentos donde el negocio quiere uno.
 *  · **El desglose se muestra siempre.** Con el representante delante, «son
 *    6,50» sin explicación es una discusión; «5,00 del paquete más 1,50 por 7
 *    minutos de más» no lo es. El desglose es atención al cliente.
 *
 * Las dos rutas de liquidación producen **el mismo total** (F5-14): cobrar en
 * taquilla, o cargar a la cuenta de una mesa.
 */
export function CheckoutScreen({
  snapshot,
  timeFormat = DEFAULT_TIME_FORMAT,
}: {
  snapshot: MonitorSnapshotDto;
  timeFormat?: TimeFormat;
}) {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cerrado, setCerrado] = useState<{ ninos: number; total: string; destino: string } | null>(
    null,
  );

  const preview = useMemo(
    () => buildCheckoutPreview(snapshot, seleccionados),
    [snapshot, seleccionados],
  );

  const handleScan = useCallback(
    (code: string) => {
      const parsed = WristbandCodeSchema.safeParse(code);
      if (!parsed.success) {
        setAviso(`Código no reconocido: ${code}`);
        return;
      }
      const limpio = parsed.data;
      const sesion = snapshot.sessions.find((s) => s.wristbandCode === limpio);

      if (!sesion) {
        // Fail-closed: si la pulsera no corresponde a nadie en sala, no se
        // inventa una salida. Puede ser de otro día o de otro local.
        setAviso(`La pulsera ${limpio} no corresponde a ningún niño en sala`);
        return;
      }
      if (seleccionados.includes(sesion.id)) {
        setAviso(`${sesion.kid.name} ya está en esta salida`);
        return;
      }
      setSeleccionados((prev) => [...prev, sesion.id]);
      setAviso(null);
    },
    [snapshot.sessions, seleccionados],
  );

  const validarPulsera = useCallback(
    (code: string) => WristbandCodeSchema.safeParse(code).success,
    [],
  );

  const quitar = (id: string) =>
    setSeleccionados((prev) => prev.filter((x) => x !== id));

  function liquidar(destino: "TAQUILLA" | "MESA") {
    const comando = {
      idempotencyKey: globalThis.crypto.randomUUID(),
      sessionIds: seleccionados,
      // Unión discriminada: «cargar a mesa» sin mesa no se puede expresar.
      disposition:
        destino === "TAQUILLA"
          ? ({ kind: "TAQUILLA" } as const)
          : ({ kind: "MESA", tableId: "mesa-12" } as const),
    };

    const r = CheckoutCommandSchema.safeParse(comando);
    if (!r.success) {
      setAviso(r.error.issues[0]?.message ?? "No se puede cerrar la salida");
      return;
    }

    // TODO(F5-14/backend): aquí irá la llamada real. La clave de idempotencia
    // impide que un doble toque cobre dos veces (I-11).
    setCerrado({
      ninos: seleccionados.length,
      total: moneyDtoToMajor(preview.total),
      destino: destino === "TAQUILLA" ? "cobrado en taquilla" : "cargado a la mesa 12",
    });
    setSeleccionados([]);
    setAviso(null);
  }

  const hayAlgo = preview.lines.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4">
          <div>
            <div>
              <h1 className="font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink">
                Salida del parque
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-3">
                Pasa las pulseras de quienes se van
              </p>
            </div>
          </div>

          <div className="flex items-end gap-7">
            <StatTile label="En sala" value={snapshot.sessions.length} />
            <StatTile
              label="En esta salida"
              value={preview.lines.length}
              tone={hayAlgo ? "brand" : "idle"}
            />
          </div>
        </Container>
      </header>

      <Container as="main" ancho="operacion" className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col gap-4 min-w-0">
          <ScannerField
            onScan={handleScan}
            validate={validarPulsera}
            placeholder="Pasa la pulsera de quien se va…"
          />

          {aviso && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-3 text-[13px] text-state-warn"
            >
              <TriangleAlert size={15} aria-hidden="true" />
              {aviso}
            </p>
          )}

          {!hayAlgo ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-16 text-center">
              <LogOut size={30} className="mx-auto text-ink-3" aria-hidden="true" />
              <p className="font-display mt-3 text-lg font-semibold text-ink">
                Ninguna salida en curso
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">
                Se pueden pasar varias pulseras seguidas: la familia se va junta y se cobra una
                sola vez.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {preview.lines.map((l) => {
                const conExcedente = l.penaltyBlocks > 0;
                return (
                  <li
                    key={l.sessionId}
                    className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Initial
                        name={l.kid.nickname ?? l.kid.name}
                        tone={conExcedente ? "crit" : "ok"}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-display truncate text-lg leading-tight font-bold text-ink">
                          {l.kid.nickname ?? l.kid.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-3">
                          <span className="tnum font-mono">{l.wristbandCode}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tnum">
                            {formatClock(Date.parse(l.startedAt), timeFormat)} →{" "}
                            {formatClock(Date.parse(l.endedAt), timeFormat)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tnum">{l.consumedMinutes} min en sala</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => quitar(l.sessionId)}
                        aria-label={`Quitar a ${l.kid.name} de esta salida`}
                        className="grid size-9 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>

                    {/* El desglose, siempre visible. Es lo que evita la
                        discusión en taquilla. */}
                    <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-ink-2">Paquete contratado</dt>
                        <dd>
                          <MoneyDisplay
                            value={moneyDtoToMajor(l.packagePrice)}
                            currency={l.packagePrice.currency}
                            size="sm"
                            tone="muted"
                          />
                        </dd>
                      </div>

                      {conExcedente && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-state-warn">
                            Tiempo de más
                            <span className="tnum ml-1.5 text-ink-3">
                              ({l.billableOverdueMinutes} min ·{" "}
                              {l.penaltyBlocks === 1
                                ? "1 bloque"
                                : `${l.penaltyBlocks} bloques`}
                              )
                            </span>
                          </dt>
                          <dd>
                            <MoneyDisplay
                              value={moneyDtoToMajor(l.overdue)}
                              currency={l.overdue.currency}
                              size="sm"
                              tone="negative"
                            />
                          </dd>
                        </div>
                      )}

                      <div className="flex items-baseline justify-between gap-3 border-t border-line/60 pt-1.5">
                        <dt className="font-semibold text-ink">Subtotal</dt>
                        <dd>
                          <MoneyDisplay
                            value={moneyDtoToMajor(l.total)}
                            currency={l.total.currency}
                            size="md"
                          />
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex h-fit min-w-0 flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-lg font-bold text-ink">Liquidación</h2>

          <div className="border-t border-line pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
                Total
              </span>
              <MoneyDisplay
                value={moneyDtoToMajor(preview.total)}
                currency={preview.total.currency}
                size="lg"
              />
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              {preview.lines.length === 0
                ? "Sin niños en esta salida"
                : `${preview.lines.length} ${preview.lines.length === 1 ? "niño" : "niños"}`}
            </p>
          </div>

          {/* Las dos rutas del plan. Producen el mismo total; cambia a dónde
              va la deuda. */}
          <Button
            surface="pos"
            variant="primary"
            disabled={!hayAlgo}
            onClick={() => liquidar("TAQUILLA")}
            className="w-full"
          >
            <Wallet size={17} aria-hidden="true" />
            Cobrar en taquilla
          </Button>

          <Button
            surface="pos"
            variant="neutral"
            disabled={!hayAlgo}
            onClick={() => liquidar("MESA")}
            className="w-full"
          >
            <Utensils size={17} aria-hidden="true" />
            Cargar a una mesa
          </Button>

          <p className="text-center text-[12px] text-ink-3">
            Cargar a una mesa une esta deuda con la cuenta del restaurante: el representante paga
            una sola vez al final.
          </p>

          {cerrado && (
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
                {cerrado.ninos} {cerrado.ninos === 1 ? "salida cerrada" : "salidas cerradas"} por
                USD {cerrado.total}, {cerrado.destino}.
              </p>
            </div>
          )}

          {!hayAlgo && (
            <Badge tone="idle" icon={<PackageOpen size={13} aria-hidden="true" />}>
              Esperando pulseras
            </Badge>
          )}
        </aside>
      </Container>
    </div>
  );
}
