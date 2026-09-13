"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScanLine, TriangleAlert, Utensils, Wallet, X } from "lucide-react";
import {
  CheckoutCommandSchema,
  WristbandCodeSchema,
  type MonitorSnapshotDto,
} from "@l2/contracts";
import {
  Badge,
  Button,
  Container,
  Initial,
  MoneyDisplay,
  ScannerField,
  ScanPrompt,
  StatTile,
  avisar,
  formatMoneyVE,
} from "@l2/ui";
import { PackageOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { sum, toMajor } from "@l2/domain-money";
import { pendiente, registrarSalida } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
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
  pulseraInicial = null,
}: {
  snapshot: MonitorSnapshotDto;
  timeFormat?: TimeFormat;
  /** Desde la ficha del monitor: el niño ya viene elegido. Se valida igual
   *  que un escaneo, porque llega por la URL. */
  pulseraInicial?: string | null;
}) {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Cerrar una salida es una acción terminada: se anuncia y la pantalla queda lista para la siguiente. */
  const anunciarCierre = (c: { ninos: number; total: string; destino: string }) =>
    avisar.ok(`${c.ninos} ${c.ninos === 1 ? "salida cerrada" : "salidas cerradas"} por ${formatMoneyVE(c.total, "USD")}`, {
      detalle: c.destino.charAt(0).toUpperCase() + c.destino.slice(1),
    });
  const { cuentas, guardar } = useCuentas();
  const router = useRouter();

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
      // Fail-closed: una estancia ya cerrada no se vuelve a liquidar.
      const suCuenta = cuentas.find((c) => c.sessionIds.includes(sesion.id));
      if (suCuenta?.closedSessionIds.includes(sesion.id)) {
        setAviso(`${sesion.kid.nickname ?? sesion.kid.name} ya salió`);
        return;
      }
      if (seleccionados.includes(sesion.id)) {
        setAviso(`${sesion.kid.name} ya está en esta salida`);
        return;
      }
      setSeleccionados((prev) => [...prev, sesion.id]);
      setAviso(null);
    },
    [snapshot.sessions, seleccionados, cuentas],
  );

  const inicial = useRef(pulseraInicial);
  useEffect(() => {
    const codigo = inicial.current;
    if (!codigo) return;
    inicial.current = null;
    handleScan(codigo);
  }, [handleScan]);

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
    anunciarCierre({
      ninos: seleccionados.length,
      total: moneyDtoToMajor(preview.total),
      destino: destino === "TAQUILLA" ? "cobrado en taquilla" : "cargado a la mesa 12",
    });
    setSeleccionados([]);
    setAviso(null);
  }

  const hayAlgo = preview.lines.length > 0;

  /**
   * Qué pasa con cada cuenta si esta salida se confirma (DEC-21). Se calcula
   * ANTES de confirmar para que el botón y el resumen digan exactamente lo
   * que va a ocurrir: nada, solo el excedente, o la cuenta entera.
   */
  const plan = useMemo(() => {
    const porCuenta = new Map<
      string,
      {
        cuenta: (typeof cuentas)[number];
        salen: string[];
        excedentes: { sessionId: string; concept: string; amount: { minor: string; currency: "USD" | "VES" | "USDT" } }[];
      }
    >();
    const sinCuenta: string[] = [];
    for (const l of preview.lines) {
      const c = cuentas.find(
        (x) => x.sessionIds.includes(l.sessionId) && !x.closedSessionIds.includes(l.sessionId),
      );
      const nombre = l.kid.nickname ?? l.kid.name;
      if (!c) {
        sinCuenta.push(nombre);
        continue;
      }
      const g = porCuenta.get(c.id) ?? { cuenta: c, salen: [], excedentes: [] };
      g.salen.push(l.sessionId);
      if (l.penaltyBlocks > 0) {
        g.excedentes.push({
          sessionId: l.sessionId,
          concept: `Tiempo de más · ${nombre} (${l.penaltyBlocks === 1 ? "1 bloque" : `${l.penaltyBlocks} bloques`})`,
          amount: l.overdue,
        });
      }
      porCuenta.set(c.id, g);
    }
    const resultados = [...porCuenta.values()].map((g) =>
      registrarSalida(g.cuenta, g.salen, g.excedentes),
    );
    return { resultados, sinCuenta };
  }, [preview.lines, cuentas]);

  const porCobrar = plan.resultados.filter((c) => c.status === "POR_COBRAR");
  const aCobrar = sum(porCobrar.map(pendiente), "USD");

  function confirmarSalida() {
    if (plan.sinCuenta.length > 0) {
      // Fail-closed: sin cuenta no se sabe quién paga ni qué se pagó ya.
      setAviso(`Sin cuenta: ${plan.sinCuenta.join(", ")}. No se puede cerrar su salida.`);
      return;
    }
    const r = CheckoutCommandSchema.safeParse({
      idempotencyKey: globalThis.crypto.randomUUID(),
      sessionIds: seleccionados,
      disposition: { kind: "TAQUILLA" },
    });
    if (!r.success) {
      setAviso(r.error.issues[0]?.message ?? "No se puede cerrar la salida");
      return;
    }

    // TODO(F5-14/backend): el servidor cerrará las estancias con estas reglas.
    for (const c of plan.resultados) guardar(c);
    const ninos = seleccionados.length;
    setSeleccionados([]);
    setAviso(null);

    const unica = porCobrar[0];
    if (porCobrar.length === 1 && unica) {
      router.push(`/caja?cuenta=${unica.id}&volver=/salida` as Route);
      return;
    }
    if (porCobrar.length > 1) {
      router.push("/caja?volver=/salida" as Route);
      return;
    }
    anunciarCierre({ ninos, total: "0.00", destino: "sin cargo: estaba todo pagado" });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-4">
          <div>
            <div>
              <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
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

      <Container as="main" ancho="operacion" className="grid flex-1 gap-5 py-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            <ScanPrompt
              icon={<ScanLine size={40} aria-hidden="true" />}
              titulo="Pasa la pulsera de quien se va"
              detalle="Si se va la familia entera, pasa todas seguidas: se liquidan juntas, con el desglose de cada niño, y se cobra una sola vez."
              pasos={["Pasa las pulseras", "Revisa el desglose", "Cobra o carga a la mesa"]}
            />
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
                A cobrar ahora
              </span>
              <MoneyDisplay value={toMajor(aCobrar)} currency="USD" size="lg" />
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              {preview.lines.length === 0
                ? "Sin niños en esta salida"
                : `${preview.lines.length} ${preview.lines.length === 1 ? "niño" : "niños"} · parque ${formatMoneyVE(moneyDtoToMajor(preview.total), "USD")}`}
            </p>
          </div>

          {/* Las dos rutas del plan. Producen el mismo total; cambia a dónde
              va la deuda. */}
          {/* Qué le pasa a cada cuenta, antes de confirmar (DEC-21). */}
          {plan.resultados.length > 0 && (
            <ul className="flex flex-col gap-2">
              {plan.resultados.map((c) => {
                const p = pendiente(c);
                return (
                  <li
                    key={c.id}
                    className="rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2.5 text-[13px]"
                  >
                    <p className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-ink">{c.family}</span>
                      <Badge tone={c.mode === "PREPAGO" ? "idle" : "brand"}>
                        {c.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"}
                      </Badge>
                    </p>
                    <p className="tnum mt-1 text-ink-3">
                      {p.amount === 0n
                        ? "Todo pagado: sale sin cargo"
                        : c.status === "POR_COBRAR"
                          ? `A cobrar ahora: ${formatMoneyVE(toMajor(p), "USD")}`
                          : `Se acumula ${formatMoneyVE(toMajor(p), "USD")} hasta que salga el resto`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <Button
            surface="pos"
            variant="primary"
            disabled={!hayAlgo}
            onClick={confirmarSalida}
            className="w-full"
          >
            <Wallet size={17} aria-hidden="true" />
            {porCobrar.length === 0
              ? "Registrar salida sin cargo"
              : porCobrar.length === 1
                ? `Cobrar ${formatMoneyVE(toMajor(aCobrar), "USD")} en caja`
                : `Enviar ${porCobrar.length} cuentas a caja`}
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
