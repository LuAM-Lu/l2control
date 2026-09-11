"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckBig, FileText, Lock, OctagonAlert, TriangleAlert } from "lucide-react";
import { type CurrencyCode, type Money, multiply, toMajor, zero } from "@l2/domain-money";
import {
  countDenominations,
  reconcile,
  tallyShift,
  type ShiftMovement,
  type ShiftStatus,
} from "@l2/domain-cash";
import { Badge, Button, Container, MoneyDisplay, Stepper, Tabs, cn } from "@l2/ui";
import { DENOMINACIONES, MEDIO_LABEL, type Excepcion } from "./shift-fixtures.ts";
import { EntradasPorMedio, type PorMedio } from "./EntradasPorMedio.tsx";
import { ExcepcionesTurno } from "./ExcepcionesTurno.tsx";
import { PuntosDeCobro, type FilaPunto } from "./PuntosDeCobro.tsx";

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
  const [pestana, setPestana] = useState("arqueo");

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

  const sellado = status === "CERRADO_Z";

  // F2-12: «la sesión no sobrevive al cierre del turno». Tras el corte Z el
  // equipo vuelve al acceso. Se dejan unos segundos para leer la
  // confirmación, y el botón permite irse ya.
  const router = useRouter();
  const [regreso, setRegreso] = useState<number | null>(null);
  useEffect(() => {
    if (!sellado) return;
    setRegreso(5);
    const id = window.setInterval(
      () => setRegreso((n) => (n === null ? null : Math.max(0, n - 1))),
      1000,
    );
    return () => window.clearInterval(id);
  }, [sellado]);
  useEffect(() => {
    if (regreso === 0) router.replace("/acceso");
  }, [regreso, router]);

  /** Si el cajero ya empezó a contar alguna moneda. */
  const contadoAlgo = [...contadoPorMoneda.values()].some((m) => m.amount !== 0n);

  // La diferencia solo se señala en lo que ya se contó. Antes el aviso de
  // «hay diferencia» salía con la gaveta sin tocar: todo lo esperado aparecía
  // como faltante antes de contar un solo billete.
  const hayDiferencia = cuadre.some(
    (c) =>
      (contadoPorMoneda.get(c.currency)?.amount ?? 0n) !== 0n && c.difference.amount !== 0n,
  );

  const porMedio: PorMedio[] = tally.byMethod
    .filter((m) => m.total.amount > 0n)
    .map((m) => ({
      medio: MEDIO_LABEL[m.methodCode] ?? m.methodCode,
      moneda: m.currency,
      total: toMajor(m.total),
      minor: m.total.amount.toString(),
      enGaveta: m.inDrawer,
    }));

  const puntos: FilaPunto[] = tally.byPoint.map((p) => ({
    punto: p.point,
    moneda: p.currency,
    cobrado: toMajor(p.charged),
    efectivoNeto: toMajor(p.cashNet),
  }));

  /**
   * DENSIDAD Y JERARQUÍA — la tarea manda.
   *
   * La tarea de esta pantalla es contar la gaveta y cerrar. Antes esa tarea
   * compartía el ancho a partes iguales con información de solo lectura, los
   * campos de billetes eran de tamaño ratón, y los cortes quedaban bajo el
   * pliegue. Ahora:
   *
   *  · el arqueo ocupa la columna ancha, fila por denominación, con contador
   *    táctil y subtotal al lado — se ve qué se contó y qué no;
   *  · el cuadre y los cortes van al lado, clavados, donde está el resultado
   *    de lo que se acaba de hacer;
   *  · lo que dice el libro queda debajo, para quien lo quiera revisar.
   */
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <Container
          ancho="operacion"
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
        >
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
              Turno de caja
            </h1>
            <p className="tnum text-[13px] text-ink-3">
              {cortesX} {cortesX === 1 ? "corte X" : "cortes X"} en este turno
            </p>
          </div>
          {sellado ? (
            <Badge tone="crit" icon={<Lock size={13} aria-hidden="true" />}>
              Sellado con corte Z
            </Badge>
          ) : (
            <Badge tone="ok" icon={<CircleCheckBig size={13} aria-hidden="true" />}>
              Abierto
            </Badge>
          )}
        </Container>
      </header>

      <Container as="main" ancho="operacion" className="flex flex-1 flex-col gap-5 py-4 lg:min-h-0">
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Divulgación progresiva (§8.8): lo que se HACE —contar— va al
              frente; lo que se consulta —el libro— queda a un toque. Antes
              iba todo apilado y la pantalla desbordaba 644 px. */}
          <Tabs
            etiqueta="Turno de caja"
            activa={pestana}
            onCambiar={setPestana}
            className="min-w-0 lg:min-h-0"
            pestanas={[
              {
                id: "arqueo",
                etiqueta: "Arqueo",
                contenido: (
              <section className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
                  <h2 className="font-display text-base font-bold text-ink">Arqueo físico</h2>
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                    Cuenta billetes, no importes
                  </span>
                </div>

                <div className="grid gap-px bg-line md:grid-cols-2">
                  {tally.drawer.map((d) => {
                    const contado = contadoPorMoneda.get(d.currency) ?? zero(d.currency);
                    return (
                      <div key={d.currency} className="bg-surface px-5 py-4">
                        <h3 className="mb-3 flex items-baseline justify-between gap-3">
                          <span className="font-display text-sm font-bold text-ink">
                            Efectivo en {d.currency}
                          </span>
                          <MoneyDisplay value={toMajor(contado)} currency={d.currency} size="sm" />
                        </h3>

                        <ul className="flex flex-col gap-1.5">
                          {DENOMINACIONES[d.currency as "USD" | "VES"].map((den) => {
                            const clave = `${d.currency}|${toMajor(den)}`;
                            const cantidad = Number.parseInt(conteo[clave] ?? "0", 10) || 0;
                            const subtotal = multiply(den, BigInt(cantidad));
                            return (
                              <li key={clave} className="flex items-center justify-between gap-3">
                                <span className="tnum w-16 shrink-0 font-semibold text-ink">
                                  {toMajor(den)}
                                </span>
                                <Stepper
                                  value={cantidad}
                                  onChange={(n) =>
                                    setConteo((prev) => ({ ...prev, [clave]: String(n) }))
                                  }
                                  label={`Billetes de ${toMajor(den)} ${d.currency}`}
                                  disabled={sellado}
                                />
                                <span
                                  className={cn(
                                    "tnum w-24 shrink-0 text-right text-[13px]",
                                    cantidad > 0 ? "text-ink-2" : "text-ink-3/60",
                                  )}
                                >
                                  {toMajor(subtotal)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
                ),
              },
              {
                id: "puntos",
                etiqueta: "Por punto de cobro",
                contenido: <PuntosDeCobro filas={puntos} />,
              },
              {
                id: "medios",
                etiqueta: "Por medio",
                contenido: <EntradasPorMedio porMedio={porMedio} titulo="Movimiento por medio" />,
              },
              {
                id: "excepciones",
                etiqueta: "Excepciones",
                contador: excepciones.length,
                contenido: <ExcepcionesTurno excepciones={excepciones} />,
              },
            ]}
          />

          {/* ═══════════════════ cuadre y cortes ═══════════════════ */}
          <aside className="flex h-fit min-w-0 flex-col gap-4 lg:sticky lg:top-20">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
              <h2 className="font-display mb-3 text-base font-bold text-ink">Cuadre</h2>

              <ul className="flex flex-col">
                {tally.drawer.map((d) => {
                  const contado = contadoPorMoneda.get(d.currency) ?? zero(d.currency);
                  const linea = cuadre.find((c) => c.currency === d.currency);
                  const diferencia = linea?.difference ?? zero(d.currency);
                  const contada = contado.amount !== 0n;
                  const cuadra = diferencia.amount === 0n;

                  return (
                    <li
                      key={d.currency}
                      className="flex flex-col gap-1 border-b border-line/60 py-3 first:pt-0 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                          {d.currency} contado
                        </span>
                        {!contada ? (
                          <span className="text-[12px] text-ink-3">sin contar</span>
                        ) : cuadra ? (
                          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-state-ok">
                            <CircleCheckBig size={13} aria-hidden="true" />
                            Cuadra
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[12.5px] font-semibold text-state-crit">
                            <OctagonAlert size={13} aria-hidden="true" />
                            {diferencia.amount > 0n ? "Sobra" : "Falta"}{" "}
                            <span className="tnum">
                              {toMajor({
                                amount:
                                  diferencia.amount < 0n ? -diferencia.amount : diferencia.amount,
                                currency: diferencia.currency,
                              })}
                            </span>
                          </span>
                        )}
                      </div>

                      <MoneyDisplay value={toMajor(contado)} currency={d.currency} size="xl" />

                      {/* El teórico solo aparece cuando ya se contó: verlo antes
                          invita a «cuadrar» el conteo en lugar de contar. */}
                      {contada && (
                        <span className="tnum text-[12px] text-ink-3">
                          Teórico según el libro: {toMajor(d.expected)} {d.currency}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
              <h2 className="font-display text-base font-bold text-ink">Cortes</h2>

              <Button
                surface="pos"
                variant="neutral"
                disabled={sellado}
                onClick={() => setCortesX((n) => n + 1)}
                className="w-full text-base"
              >
                <FileText size={16} aria-hidden="true" />
                Corte X · arqueo parcial
              </Button>
              <p className="-mt-1 text-[12px] text-ink-3">
                Se repite las veces que haga falta. <strong>No cierra el turno.</strong>
              </p>

              {!sellado && !contadoAlgo && (
                <p className="rounded-[var(--radius-control)] border border-line bg-base/50 px-3 py-2 text-[12.5px] text-ink-2">
                  Cuenta la gaveta antes del corte Z.
                </p>
              )}

              {!sellado && hayDiferencia && (
                <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[12.5px] text-state-warn">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Hay diferencia. El corte Z la dejará registrada con tu nombre y hará falta
                  justificarla.
                </p>
              )}

              {!confirmandoZ ? (
                <Button
                  surface="pos"
                  variant="danger"
                  disabled={sellado}
                  onClick={() => setConfirmandoZ(true)}
                  className="w-full text-base"
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
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">
                      Turno cerrado con corte Z. Los correlativos quedaron sellados y no admite más
                      operaciones.
                    </p>
                    <p className="tnum mt-2 text-[12.5px] text-ink-2">
                      El equipo vuelve a la pantalla de acceso en {regreso ?? 5} s.
                    </p>
                    <Button
                      surface="tablet"
                      variant="neutral"
                      onClick={() => router.replace("/acceso")}
                      className="mt-2 w-full"
                    >
                      Ir al acceso ahora
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

      </Container>
    </div>
  );
}
