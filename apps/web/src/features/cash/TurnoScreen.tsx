"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CircleCheckBig, Lock, OctagonAlert, TriangleAlert, Wallet } from "lucide-react";
import type { TurnoDto } from "@l2/contracts";
import { type CurrencyCode, type Money, fromMajor, money, multiply, toMajor, zero } from "@l2/domain-money";
import { countDenominations, openingMovements, reconcile, tallyShift, type ShiftMovement } from "@l2/domain-cash";
import { Badge, Button, Container, Input, MoneyDisplay, Stepper, Tabs, avisar, cn } from "@l2/ui";
import { DENOMINACIONES, MEDIO_LABEL, type Excepcion } from "./turno.ts";
import { EntradasPorMedio, type PorMedio } from "./EntradasPorMedio.tsx";
import { ExcepcionesTurno } from "./ExcepcionesTurno.tsx";
import { PuntosDeCobro, type FilaPunto } from "./PuntosDeCobro.tsx";
import { abrirTurno } from "./turno.acciones";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";

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
/**
 * El turno de caja del equipo (B3-1). Sin turno abierto, la pantalla es la apertura: se declara el
 * fondo de la gaveta por moneda y el servidor pone lo demás. Con turno, el arqueo; los cortes X y
 * Z guardados llegan con B3-5.
 */
export function TurnoScreen({
  turno,
  movements,
  excepciones,
}: {
  /** El turno del equipo, del servidor; `null` si no hay ninguno abierto. */
  turno: TurnoDto | null;
  /** Lo cobrado en el turno, del libro (B3-5). El fondo inicial sale del propio turno. */
  movements: readonly ShiftMovement[];
  excepciones: readonly Excepcion[];
}) {
  const todos = useMemo(
    () =>
      turno
        ? [...openingMovements(turno.fondos.map((f) => money(BigInt(f.amount.minor), f.amount.currency))), ...movements]
        : [],
    [turno, movements],
  );
  if (!turno) return <AperturaTurno />;
  return <TurnoAbierto turno={turno} movements={todos} excepciones={excepciones} />;
}

/**
 * Un importe como lo teclea una persona en Venezuela, en unidades menores. Con coma, la coma es
 * el decimal y los puntos son miles («1.500,50»); sin coma, el punto es el decimal. Vacío = cero.
 */
function importe(texto: string, moneda: "USD" | "VES"): Money | null {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return zero(moneda);
  if (!/^[\d.,]+$/.test(t)) return null;
  try {
    return fromMajor(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t, moneda);
  } catch {
    return null;
  }
}

/** Abrir el turno (F4-01): el fondo de la gaveta por moneda. Cero vale y se dice. */
function AperturaTurno() {
  const router = useRouter();
  const [usd, setUsd] = useState("");
  const [bs, setBs] = useState("");
  const [errores, setErrores] = useState<{ USD?: string | undefined; VES?: string | undefined }>({});
  const [enviando, setEnviando] = useState(false);

  const abrir = async (e: React.FormEvent) => {
    e.preventDefault();
    const fondoUsd = importe(usd, "USD");
    const fondoBs = importe(bs, "VES");
    if (!fondoUsd || !fondoBs) {
      setErrores({
        ...(fondoUsd ? {} : { USD: "Un importe en dólares, con hasta dos decimales" }),
        ...(fondoBs ? {} : { VES: "Un importe en bolívares, con hasta dos decimales" }),
      });
      return;
    }
    setEnviando(true);
    try {
      const r = await abrirTurno({
        fondos: [fondoUsd, fondoBs].map((f) => ({ currency: f.currency, amount: { minor: String(f.amount), currency: f.currency } })),
      });
      if (r.ok) {
        avisar.ok(`Turno abierto en ${r.valor.punto}: ya se puede cobrar`);
        router.refresh();
      } else {
        avisar.error(r.mensaje);
        // Otro toque ya lo abrió (o se abrió en otra pestaña): se enseña el que hay.
        if (r.motivo === "CONFLICTO") router.refresh();
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. El turno no se abrió.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container ancho="operacion" className="flex min-h-0 flex-1 items-start justify-center py-8">
      <form
        onSubmit={abrir}
        className="flex w-full max-w-md flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/12 text-brand">
            <Wallet size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Abrir el turno</h1>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Cuenta el fondo que hay en la gaveta antes de empezar. Sin turno abierto, la caja no cobra.
            </p>
          </div>
        </div>
        <Input
          surface="pos"
          label="Fondo en dólares"
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          value={usd}
          error={errores.USD}
          onChange={(e) => {
            setUsd(e.target.value);
            setErrores((x) => ({ ...x, USD: undefined }));
          }}
        />
        <Input
          surface="pos"
          label="Fondo en bolívares"
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          value={bs}
          error={errores.VES}
          hint="Vacío o cero si se empieza sin cambio."
          onChange={(e) => {
            setBs(e.target.value);
            setErrores((x) => ({ ...x, VES: undefined }));
          }}
        />
        <Button type="submit" surface="pos" variant="primary" className="w-full text-base" disabled={enviando}>
          {enviando ? "Abriendo…" : "Abrir turno"}
        </Button>
        <p className="text-[12px] text-ink-3">
          El turno queda a tu nombre, en este equipo y con el día de hoy como día de negocio.
        </p>
      </form>
    </Container>
  );
}

function TurnoAbierto({
  turno,
  movements,
  excepciones,
}: {
  turno: TurnoDto;
  movements: readonly ShiftMovement[];
  excepciones: readonly Excepcion[];
  // El turno, la hora de apertura y quién está en caja los muestra la barra
  // de estación (§8.5): repetirlos aquí era la duplicación que hacía que cada
  // pantalla se viera distinta.
}) {
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const { ajustes } = useSucursal();

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

  // El servidor solo devuelve el turno sin corte Z; el corte llega con B3-5.
  const sellado = turno.estado === "CERRADO_Z";

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

  // DEC-25/26: con solo la caja cobrando, lo normal es un único punto; la
  // pestaña «Por punto de cobro» solo aparece si de verdad cobró más de uno.
  const variosPuntos =
    new Set(
      tally.byPoint.filter((p) => p.charged.amount !== 0n || p.cashNet.amount !== 0n).map((p) => p.point),
    ).size > 1;
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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container
          ancho="operacion"
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 apaisado:bajo:py-2"
        >
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
              Turno de caja
            </h1>
            <p className="tnum flex items-center gap-1.5 text-[13px] text-ink-3">
              <CalendarClock size={14} aria-hidden="true" />
              Día de negocio {diaEnPalabras(turno.businessDate)} · {turno.punto} · abierto por {turno.abiertoPor.name} a las{" "}
              {formatClock(Date.parse(turno.abiertoEn), ajustes.formatoHora)}
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

      <Container as="main" ancho="operacion" className="flex flex-1 flex-col gap-5 py-4 apaisado:min-h-0 apaisado:bajo:py-3 apaisado:bajo:gap-3">
        <div className="grid gap-5 apaisado:min-h-0 apaisado:flex-1 apaisado:grid-cols-[minmax(0,1fr)_380px] apaisado:grid-rows-[minmax(0,1fr)]">
          {/* Divulgación progresiva (§8.8): lo que se HACE —contar— va al
              frente; lo que se consulta —el libro— queda a un toque. Antes
              iba todo apilado y la pantalla desbordaba 644 px. */}
          <Tabs
            etiqueta="Turno de caja"
            activa={pestana}
            onCambiar={setPestana}
            surface="pos"
            className="min-w-0 apaisado:min-h-0"
            pestanas={[
              {
                id: "arqueo",
                etiqueta: "Arqueo",
                contenido: (
              <section className="@container/arqueo min-w-0 overflow-clip rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
                  <h2 className="font-display text-base font-bold text-ink">Arqueo físico</h2>
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                    Cuenta billetes, no importes
                  </span>
                </div>

                <div className="grid gap-px bg-line @min-[49rem]/arqueo:grid-cols-2">
                  {tally.drawer.map((d) => {
                    const contado = contadoPorMoneda.get(d.currency) ?? zero(d.currency);
                    return (
                      <div key={d.currency} className="bg-surface px-4 py-4">
                        {/* Fija al desplazar (monedas apiladas). El relleno se compensa con
                            margen para no alargar el arqueo: a 1366×768 no debe desplazar. */}
                        <h3 className="sticky top-0 z-10 -mt-1 mb-2 flex items-baseline justify-between gap-3 bg-surface py-1">
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
                              <li key={clave} className="flex items-center justify-between gap-2">
                                <span className="tnum w-14 shrink-0 font-semibold text-ink">
                                  {toMajor(den)}
                                </span>
                                <Stepper
                                  value={cantidad}
                                  onChange={(n) =>
                                    setConteo((prev) => ({ ...prev, [clave]: String(n) }))
                                  }
                                  label={`Billetes de ${toMajor(den)} ${d.currency}`}
                                  disabled={sellado}
                                  surface="pos"
                                />
                                <span
                                  className={cn(
                                    "tnum w-20 min-w-0 shrink-0 text-right text-[13px]",
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
              variosPuntos ? {
                id: "puntos",
                etiqueta: "Por punto de cobro",
                contenido: <PuntosDeCobro filas={puntos} />,
              } : null,
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
            ].filter((p): p is NonNullable<typeof p> => p !== null)}
          />

          {/* ═══════════════════ cuadre y cortes ═══════════════════ */}
          <aside className="flex min-w-0 flex-col gap-4 apaisado:min-h-0 apaisado:overflow-y-auto apaisado:bajo:gap-3">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card apaisado:bajo:p-3">
              <h2 className="font-display mb-3 text-base font-bold text-ink apaisado:bajo:mb-2">Cuadre</h2>

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
                      className="flex flex-col gap-1 border-b border-line/60 py-3 first:pt-0 last:border-0 last:pb-0 apaisado:bajo:py-2"
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

                      <MoneyDisplay value={toMajor(contado)} currency={d.currency} size="xl" className="apaisado:bajo:text-2xl" />

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

            <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card apaisado:bajo:p-3">
              <h2 className="font-display text-base font-bold text-ink">Cortes</h2>
              <p className="flex items-start gap-2 text-[13px] text-ink-2">
                <Lock size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
                Los cortes X y Z se guardan en el servidor con el libro de pagos (B3-5). Hasta entonces la gaveta se
                cuenta aquí, pero el conteo no se guarda y el turno sigue abierto.
              </p>
              {!contadoAlgo && (
                <p className="rounded-[var(--radius-control)] border border-line bg-base/50 px-3 py-2 text-[12.5px] text-ink-2">
                  Cuenta la gaveta para ver si cuadra con el fondo y lo cobrado.
                </p>
              )}
              {hayDiferencia && (
                <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[12.5px] text-state-warn">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Hay diferencia entre lo contado y lo que dice el libro. Vuelve a contar antes de cerrar.
                </p>
              )}
            </div>
          </aside>
        </div>

      </Container>
    </div>
  );
}

/** «dom 27 sept»: un día de calendario en palabras. Es fecha, no instante: se pinta en UTC. */
function diaEnPalabras(dia: string): string {
  const partes = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    Date.parse(`${dia}T12:00:00.000Z`),
  );
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value.replace(".", "") ?? "";
  return `${de("weekday")} ${de("day")} ${de("month")}`;
}
