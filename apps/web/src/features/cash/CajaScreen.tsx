"use client";

import { useMemo, useState } from "react";
import {
  CircleCheckBig,
  Coins,
  HandCoins,
  PiggyBank,
  X,
} from "lucide-react";
import {
  type FrozenRate,
  type Money,
  add,
  convert,
  invertRate,
  money,
  toMajor,
  zero,
} from "@l2/domain-money";
import { computeDocument, computeIgtf, type DocumentLine, type TaxRule } from "@l2/domain-tax";
import {
  closeSettlement,
  computeBalance,
  type ChangeDisposition,
  type PointOfSale,
  type Tender,
} from "@l2/domain-cash";
import { Badge, Button, Container, Dialog, MoneyDisplay, NumericKeypad, cn } from "@l2/ui";
import type { MedioPago } from "./fixtures.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { FamilyAccountDto } from "@l2/contracts";
import { lineasParaCobrar, marcarCobrada, pendiente } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";

/**
 * Caja: cobro mixto, IGTF y vuelto — F4-03, F4-04b.
 *
 * EL DETALLE QUE HACE ESTA PANTALLA DISTINTA A UN POS CORRIENTE
 * El IGTF depende de EN QUÉ MONEDA SE PAGA, así que **lo que hay que cobrar
 * crece a medida que se añaden pagos en divisas**. No es un bug: es la norma.
 * Por eso el total a cobrar se recalcula con cada pago y la pantalla lo dice
 * con palabras, en vez de dejar al cajero descubrir que la cuenta «subió».
 *
 * Y el excedente NO se cierra solo: hay que decir qué se hace con él —vuelto,
 * propina o residuo—, porque un sobrante sin explicación es dinero perdido
 * (§5.6).
 */
function CobroCuenta({
  lines,
  cuenta,
  onCobrado,
  rules,
  tenders: mediosDisponibles,
  igtfBasisPoints,
  maxRetained,
  rate,
  serverNow,
}: {
  lines: readonly DocumentLine[];
  /** La cuenta que se cobra: su familia y su modo encabezan el ticket. */
  cuenta: FamilyAccountDto;
  onCobrado: (r: { total: string; vuelto: string }) => void;
  rules: readonly TaxRule[];
  tenders: readonly MedioPago[];
  igtfBasisPoints: number;
  maxRetained: Money;
  /** Tasa congelada de esta transacción (ADR-005). `null` bloquea el cobro en Bs.
   *  La tasa se MUESTRA en la barra de estación (§8.5); aquí solo se usa. */
  rate: FrozenRate | null;
  /**
   * Desde qué punto cobra este equipo (DEC-13). Sale del dispositivo —el
   * aparato es del puesto (DEC-17)—, no de una elección del cajero en cada
   * cobro: pedírselo a mano es garantizar que un día se equivoque.
   */
  puntoDeCobro: PointOfSale;
  serverNow: number;
}) {
  const FUNCIONAL = "USD" as const;

  const [pagos, setPagos] = useState<{ uid: string; medio: MedioPago; amount: Money }[]>([]);
  const [medioActivo, setMedioActivo] = useState<MedioPago>(mediosDisponibles[0]!);
  const [monto, setMonto] = useState("");
  const [destinoVuelto, setDestinoVuelto] = useState<"VUELTO" | "PROPINA" | "CAJA">("VUELTO");
  const [error, setError] = useState<string | null>(null);
  const [cobrado, setCobrado] = useState<{ total: string; vuelto: string } | null>(null);

  /* ------------------------------------------------- documento (IVA) */

  const doc = useMemo(
    () => computeDocument({ lines, rules, at: serverNow, currency: FUNCIONAL }),
    [lines, rules, serverNow],
  );

  /* ------------------------------------------------------ IGTF */

  const tenders: Tender[] = useMemo(
    () =>
      pagos.map((p) => ({
        method: p.medio,
        amount: p.amount,
        rate: p.amount.currency === FUNCIONAL ? null : rate,
      })),
    [pagos, rate],
  );

  const igtf = useMemo(
    () =>
      computeIgtf(
        pagos.map((p) => ({ method: p.medio, amount: p.amount })),
        igtfBasisPoints,
        FUNCIONAL,
      ),
    [pagos, igtfBasisPoints],
  );

  // El IGTF de un pago en USDT viene en USDT; se trata 1:1 con el dólar para
  // el consolidado, y queda anotado como cuestión para el contador (DEC-1).
  const igtfTotal = useMemo(
    () =>
      igtf.lines.reduce<Money>(
        (acc, l) =>
          l.igtf.currency === FUNCIONAL || l.igtf.currency === "USDT"
            ? add(acc, { amount: l.igtf.amount, currency: FUNCIONAL })
            : acc,
        zero(FUNCIONAL),
      ),
    [igtf],
  );

  /** Lo que realmente hay que cobrar: documento + IGTF de los pagos hechos. */
  const aCobrar = add(doc.total, igtfTotal);

  /* --------------------------------------------------------- balance */

  const balance = useMemo(() => {
    try {
      return computeBalance(aCobrar, tenders, FUNCIONAL);
    } catch {
      // Falta la tasa: se refleja como «nada entregado» y el aviso lo explica.
      return null;
    }
  }, [aCobrar, tenders]);

  const faltaTasa = tenders.some((t) => t.amount.currency !== FUNCIONAL && !t.rate);
  const sobra = balance?.surplus ?? zero(FUNCIONAL);
  const falta = balance?.outstanding ?? aCobrar;

  /* --------------------------------------------------------- acciones */

  /**
   * El teclado entrega dígitos y **cada dígito es una unidad menor**: teclear
   * 1102 son 11,02. Es la convención de cualquier caja registradora y evita el
   * error más caro del sector —una coma mal puesta multiplica por cien— sin
   * pedirle al cajero que apunte a una tecla de punto decimal.
   */
  function agregarPago() {
    setError(null);
    const digitos = monto.replace(/\D/g, "");
    const valor: Money = money(BigInt(digitos === "" ? "0" : digitos), medioActivo.currency);
    if (valor.amount <= 0n) {
      setError("El monto debe ser mayor que cero");
      return;
    }
    if (medioActivo.currency !== FUNCIONAL && !rate) {
      setError("Sin tasa confirmada del día no se puede cobrar en esa moneda");
      return;
    }
    setPagos((prev) => [
      ...prev,
      { uid: globalThis.crypto.randomUUID(), medio: medioActivo, amount: valor },
    ]);
    setMonto("");
  }

  function cobrar() {
    setError(null);
    const dispositions: ChangeDisposition[] = [];
    if (sobra.amount > 0n) {
      if (destinoVuelto === "VUELTO") {
        dispositions.push({ kind: "CHANGE_OUT", amount: sobra, rate: null });
      } else if (destinoVuelto === "PROPINA") {
        dispositions.push({ kind: "TIP_FROM_CHANGE", amount: sobra });
      } else {
        dispositions.push({ kind: "ROUNDING_RETAINED", amount: sobra });
      }
    }

    try {
      // El dominio comprueba la invariante de §5.6. Si no cuadra, no cierra —
      // y el mensaje del error explica por qué, en lugar de fallar en silencio.
      const r = closeSettlement({
        due: aCobrar,
        tenders,
        dispositions,
        functional: FUNCIONAL,
        maxRetained,
      });
      setCobrado({ total: toMajor(aCobrar), vuelto: toMajor(r.changeOut) });
      onCobrado({ total: toMajor(aCobrar), vuelto: toMajor(r.changeOut) });
      setPagos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el cobro");
    }
  }

  const puedeCobrar = balance !== null && falta.amount === 0n && pagos.length > 0;

  /* --------------------------------------------------------- pintado */

  /**
   * DENSIDAD Y JERARQUÍA — por qué esta pantalla está montada así.
   *
   * Una caja no es un documento que se lee: es un puesto de trabajo. Antes
   * dejaba media ventana en negro y la cifra que de verdad importa —lo que
   * falta por cobrar— era un dato pequeño arriba a la derecha, del mismo
   * tamaño que todo lo demás. Eso obliga al cajero a BUSCAR con una cola
   * delante.
   *
   * Tres decisiones lo corrigen:
   *
   *  1. Manda una sola cifra. Lo que falta se lee de un vistazo, con su
   *     equivalente en bolívares debajo, que es lo primero que pregunta el
   *     cliente.
   *  2. La pantalla se ancla al alto de la ventana y **cada columna se
   *     desplaza por dentro**. El teclado está siempre en el mismo sitio
   *     aunque la cuenta tenga veinte líneas; los totales quedan clavados
   *     abajo, que es cuando hacen falta. Eso distingue una aplicación de
   *     una página web.
   *  3. Se teclea con el dedo, no con el ratón: teclado numérico grande, que
   *     ocupa el espacio sobrante en vez de dejarlo vacío.
   */

  const digitos = monto.replace(/\D/g, "");
  const tecleado = money(BigInt(digitos === "" ? "0" : digitos), medioActivo.currency);
  const cubierto = falta.amount === 0n && pagos.length > 0;

  // El equivalente en bolívares se muestra siempre que haya tasa: calcularlo
  // de cabeza con una cola delante es donde se pierde dinero. Nunca sustituye
  // a la cifra funcional, la acompaña (§5.2).
  // La tasa se captura como la publica el BCV —cuántos bolívares vale un
  // dólar—, así que para expresar en Bs un importe en USD hay que darle la
  // vuelta. Es la MISMA tasa congelada, invertida como fracción exacta.
  const aBolivares = rate ? (rate.from === falta.currency ? rate : invertRate(rate)) : null;
  const faltaEnBs =
    aBolivares && aBolivares.from === falta.currency ? toMajor(convert(falta, aBolivares)) : null;

  return (
    <>
        {/* ═══════════════════════ la cuenta ═══════════════════════════ */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
          <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-display text-base font-bold text-ink">La cuenta</h2>
            <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              {cuenta.family} · {cuenta.mode === "PREPAGO" ? "prepago" : "cuenta abierta"}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ul className="flex flex-col">
              {lines.map((l) => (
                <li
                  key={l.id}
                  className="flex items-baseline justify-between gap-3 border-b border-line/40 py-2.5 text-[15px] last:border-0"
                >
                  <span className="text-ink-2">
                    {l.description}
                    {l.quantity > 1n && (
                      <span className="tnum ml-1 text-ink-3">×{String(l.quantity)}</span>
                    )}
                  </span>
                  <MoneyDisplay
                    value={toMajor({
                      amount: l.unitPrice.amount * l.quantity,
                      currency: l.unitPrice.currency,
                    })}
                    currency={l.unitPrice.currency}
                    size="md"
                    tone="muted"
                  />
                </li>
              ))}
            </ul>

            {/* Los pagos son parte del mismo documento, no una tarjeta aparte. */}
            {pagos.length === 0 ? (
              <p className="mt-4 border-t border-line/40 pt-4 text-[13px] text-ink-3">
                Todavía no se ha recibido ningún pago. Elige el medio, teclea el monto y pulsa
                «Añadir». Se pueden combinar varios: efectivo y punto, dólares y bolívares.
              </p>
            ) : (
              <div className="mt-5">
                <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  Pagos recibidos
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {pagos.map((p) => {
                    const linea = igtf.lines.find((l) => l.methodCode === p.medio.code);
                    return (
                      <li
                        key={p.uid}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-base/60 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge tone={p.medio.triggersIgtf ? "warn" : "idle"}>
                            {p.medio.label}
                          </Badge>
                          {p.medio.triggersIgtf && linea && (
                            <span className="text-[11px] whitespace-nowrap text-ink-3">
                              + IGTF {toMajor(linea.igtf)}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <MoneyDisplay
                            value={toMajor(p.amount)}
                            currency={p.amount.currency}
                            size="md"
                          />
                          <button
                            type="button"
                            onClick={() => setPagos((prev) => prev.filter((x) => x.uid !== p.uid))}
                            aria-label={`Quitar el pago de ${p.medio.label}`}
                            className="grid size-9 cursor-pointer place-content-center rounded text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit"
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Los totales quedan CLAVADOS abajo: no se van con el desplazamiento
              de la lista, que es justo cuando el cajero los necesita. */}
          <dl className="flex flex-col gap-1.5 border-t border-line bg-base/40 px-5 py-4 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Subtotal</dt>
              <dd>
                <MoneyDisplay value={toMajor(doc.subtotal)} currency="USD" size="sm" tone="muted" />
              </dd>
            </div>
            {doc.buckets.map((b) => (
              <div key={b.code} className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-2">
                  IVA {b.basisPoints / 100}%
                  <span className="tnum ml-1.5 text-ink-3">sobre {toMajor(b.base)}</span>
                </dt>
                <dd>
                  <MoneyDisplay value={toMajor(b.tax)} currency="USD" size="sm" tone="muted" />
                </dd>
              </div>
            ))}

            {/* El IGTF va SEPARADO del IVA, como exige §5.3. */}
            {igtfTotal.amount > 0n && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-state-warn">
                  IGTF {igtfBasisPoints / 100}%
                  <span className="ml-1.5 text-ink-3">solo sobre lo pagado en divisas</span>
                </dt>
                <dd>
                  <MoneyDisplay
                    value={toMajor(igtfTotal)}
                    currency="USD"
                    size="sm"
                    tone="negative"
                  />
                </dd>
              </div>
            )}

            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
              <dt className="font-display text-base font-bold text-ink">Total a cobrar</dt>
              <dd>
                <MoneyDisplay value={toMajor(aCobrar)} currency="USD" size="lg" />
              </dd>
            </div>

            {igtfTotal.amount > 0n && (
              <p className="mt-1 rounded-[var(--radius-control)] border border-state-warn/30 bg-state-warn-bg px-3 py-2 text-[12px] text-state-warn">
                El total subió porque el IGTF grava el <strong>medio de pago</strong>, no la venta:
                solo se aplica a lo que se paga en divisas o cripto.
              </p>
            )}
          </dl>
        </section>

        {/* ═══════════════════════ cobrar ══════════════════════════════ */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          {/* ── la cifra que manda ── */}
          <div
            className={cn(
              "rounded-[var(--radius-control)] border px-4 py-3.5",
              "transition-colors duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
              cubierto ? "border-state-ok/40 bg-state-ok-bg/50" : "border-line-strong bg-base",
            )}
          >
            <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
              {cubierto ? "Cubierto · listo para cerrar" : "Falta por cobrar"}
            </p>
            <MoneyDisplay
              value={toMajor(falta)}
              currency="USD"
              size="hero"
              tone={cubierto ? "positive" : "default"}
              className="mt-1"
            />
            {faltaEnBs && !cubierto && (
              <p className="tnum mt-1 text-sm text-ink-2">
                {faltaEnBs} <span className="text-ink-3">Bs a la tasa de esta venta</span>
              </p>
            )}
            {sobra.amount > 0n && (
              <p className="tnum mt-1 text-sm text-brand">Sobran {toMajor(sobra)} USD</p>
            )}
          </div>

          {/* ── medio de pago ── */}
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Medio de pago">
            {mediosDisponibles.map((m) => {
              const activo = m.code === medioActivo.code;
              const bloqueado = m.currency !== FUNCIONAL && !rate;
              return (
                <button
                  key={m.code}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  disabled={bloqueado}
                  onClick={() => setMedioActivo(m)}
                  title={bloqueado ? "Sin tasa del día no se puede cobrar en esta moneda" : m.label}
                  className={cn(
                    "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-2.5 text-left",
                    "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "disabled:cursor-not-allowed disabled:opacity-35",
                    activo
                      ? "border-brand bg-brand/15 text-ink"
                      : "border-line bg-base text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  <span className="truncate text-[12.5px] leading-tight font-semibold">
                    {m.label}
                  </span>
                  <span className="text-[10px] text-ink-3">
                    {m.currency}
                    {m.triggersIgtf && " · IGTF"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── lo tecleado, en grande y en su moneda ── */}
          <div className="flex items-baseline justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-base px-4 py-2.5">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              {medioActivo.currency}
            </span>
            <span
              aria-live="polite"
              className={cn(
                "tnum text-3xl leading-none font-bold",
                digitos === "" ? "text-ink-3" : "text-ink",
              )}
            >
              {toMajor(tecleado)}
            </span>
          </div>

          {/* ── el teclado ocupa lo que sobre: nunca hay que estirarse ── */}
          <NumericKeypad
            value={monto}
            onChange={setMonto}
            maxLength={9}
            surface="tablet"
            onSubmit={agregarPago}
            submitLabel="Añadir"
            className="min-h-0 flex-1 grid-rows-4 [&>button]:h-full [&>button]:min-h-11"
          />

          {faltaTasa && (
            <p role="alert" className="text-[12.5px] text-state-crit">
              Hay un pago en otra moneda sin tasa congelada. No se puede cobrar (ADR-005).
            </p>
          )}

          {/* El excedente exige una decisión: no se cierra solo (§5.6). */}
          {sobra.amount > 0n && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/8 p-3">
              <p className="text-[12px] text-ink-2">¿Qué se hace con la diferencia?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["VUELTO", "Vuelto", HandCoins],
                    ["PROPINA", "Propina", Coins],
                    ["CAJA", "A caja", PiggyBank],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDestinoVuelto(k)}
                    className={cn(
                      "flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border text-[11px]",
                      "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                      destinoVuelto === k
                        ? "border-brand bg-brand/15 text-brand"
                        : "border-line text-ink-2 hover:text-ink",
                    )}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
              {destinoVuelto === "CAJA" && sobra.amount > maxRetained.amount && (
                <p className="text-[12px] text-state-crit">
                  Por encima del umbral ({toMajor(maxRetained)} USD) no se puede dejar en caja: hay
                  que dar vuelto o marcarlo como propina.
                </p>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12.5px] text-state-crit"
            >
              {error}
            </p>
          )}

          {cobrado && (
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
                Cobrados USD {cobrado.total}
                {cobrado.vuelto !== "0.00" && ` · vuelto USD ${cobrado.vuelto}`}.
              </p>
            </div>
          )}

          <Button
            surface="pos"
            variant="primary"
            disabled={!puedeCobrar}
            onClick={cobrar}
            className="w-full text-base"
          >
            {puedeCobrar ? "Cerrar cobro" : `Faltan ${toMajor(falta)} USD`}
          </Button>
        </aside>
    </>
  );
}

/* ═════════════════════════════════════════════ la caja: cola y cobro ══ */

/**
 * Caja como COLA DE CUENTAS POR COBRAR — DEC-21, §9.10.9, §8.8.
 *
 * Maestro-detalle (Apple HIG): a la izquierda las cuentas que esperan, a la
 * derecha el cobro de la elegida, con la selección siempre resaltada. Llegan
 * desde la entrada —prepago— y desde la salida —excedente o cuenta abierta—,
 * y al cobrar la caja devuelve a la pantalla de origen.
 */

/** A dónde puede volver la caja. Solo rutas conocidas: un `?volver=` libre
 *  sería una redirección abierta. */
const ORIGEN: Readonly<Record<string, { ruta: Route; nombre: string }>> = {
  "/entrada": { ruta: "/entrada", nombre: "Entrada" },
  "/salida": { ruta: "/salida", nombre: "Salida" },
};

type CobroProps = Parameters<typeof CobroCuenta>[0];

export function CajaScreen({
  cuentaInicial,
  volver,
  ...cobro
}: Omit<CobroProps, "lines" | "cuenta" | "onCobrado"> & {
  cuentaInicial: string | null;
  volver: string | null;
}) {
  const { cuentas, guardar } = useCuentas();
  const router = useRouter();
  const porCobrar = cuentas.filter((c) => c.status === "POR_COBRAR");
  const [elegida, setElegida] = useState<string | null>(cuentaInicial);
  const actual = porCobrar.find((c) => c.id === elegida) ?? porCobrar[0] ?? null;
  const lineas = useMemo(() => (actual ? lineasParaCobrar(actual) : []), [actual]);
  const origen = volver !== null ? (ORIGEN[volver] ?? null) : null;
  const [resultado, setResultado] = useState<{
    familia: string;
    total: string;
    vuelto: string;
  } | null>(null);

  function alCobrar(cuenta: FamilyAccountDto, r: { total: string; vuelto: string }) {
    guardar(marcarCobrada(cuenta));
    setElegida(null);
    setResultado({ familia: cuenta.family, ...r });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabecera delgada: el título no compite con la cifra. */}
      <header className="border-b border-line">
        <Container ancho="operacion" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
          <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
            Caja
          </h1>
          <p className="tnum text-[13px] text-ink-3">
            {porCobrar.length} {porCobrar.length === 1 ? "cuenta por cobrar" : "cuentas por cobrar"}{" "}
            · cobra en {cobro.puntoDeCobro === "TAQUILLA" ? "taquilla" : "mostrador"}
          </p>
        </Container>
      </header>

      <Container
        as="main"
        ancho="operacion"
        className={cn(
          "grid flex-1 gap-4 py-4",
          // Desde lg la caja se reparte el alto de la ventana y cada columna
          // se desplaza por dentro (§8.8). Por debajo, flujo normal.
          "lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)_clamp(360px,30vw,420px)]",
        )}
      >
        <ColaCuentas cuentas={porCobrar} actual={actual?.id ?? null} onElegir={setElegida} />
        {actual ? (
          <CobroCuenta
            key={actual.id}
            {...cobro}
            cuenta={actual}
            lines={lineas}
            onCobrado={(r) => alCobrar(actual, r)}
          />
        ) : (
          <SinCuentas />
        )}
      </Container>

      {/* Resultado del cobro: una decisión corta —volver o seguir—, que es
          justo para lo que sirve un diálogo (§8.8). */}
      <Dialog
        abierto={resultado !== null}
        onCerrar={() => setResultado(null)}
        titulo="Cobro cerrado"
        {...(resultado ? { descripcion: `Cuenta de ${resultado.familia}` } : {})}
        pie={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            {origen && (
              <Button
                surface="tablet"
                variant="primary"
                className="flex-1"
                onClick={() => router.push(origen.ruta)}
              >
                Volver a {origen.nombre}
              </Button>
            )}
            <Button
              surface="tablet"
              variant={origen ? "neutral" : "primary"}
              className="flex-1"
              onClick={() => setResultado(null)}
            >
              {porCobrar.length > 0 ? "Siguiente cuenta" : "Listo"}
            </Button>
          </div>
        }
      >
        {resultado && (
          <div className="flex items-start gap-3">
            <CircleCheckBig size={22} className="mt-0.5 shrink-0 text-state-ok" aria-hidden="true" />
            <div className="text-[14px]">
              <p className="text-ink">
                Cobrados <strong className="tnum">USD {resultado.total}</strong>.
              </p>
              {resultado.vuelto !== "0.00" && (
                <p className="tnum mt-1 text-ink-2">Vuelto entregado: USD {resultado.vuelto}</p>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function ColaCuentas({
  cuentas,
  actual,
  onElegir,
}: {
  cuentas: readonly FamilyAccountDto[];
  actual: string | null;
  onElegir: (id: string) => void;
}) {
  return (
    <section
      aria-label="Cuentas por cobrar"
      className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card"
    >
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-base font-bold text-ink">Por cobrar</h2>
        <span className="tnum text-[12px] text-ink-3">{cuentas.length}</span>
      </div>
      {cuentas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">La cola está vacía.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {cuentas.map((c) => {
            const activa = c.id === actual;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={activa}
                  onClick={() => onElegir(c.id)}
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border px-3 py-2.5 text-left",
                    "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    activa ? "border-brand bg-brand/12" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">{c.family}</span>
                    <MoneyDisplay value={toMajor(pendiente(c))} currency="USD" size="sm" />
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {c.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"} · {c.sessionIds.length}{" "}
                    {c.sessionIds.length === 1 ? "niño" : "niños"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SinCuentas() {
  return (
    <section className="flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 py-10 text-center lg:col-span-2">
      <CircleCheckBig size={32} className="text-state-ok" aria-hidden="true" />
      <p className="font-display text-xl font-bold text-ink">Nada por cobrar</p>
      <p className="max-w-sm text-[14px] leading-relaxed text-ink-2">
        Las cuentas llegan aquí desde la entrada, cuando la familia paga al entrar, y desde la
        salida, cuando queda algo pendiente.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link
          href="/entrada"
          className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
        >
          Ir a la entrada
        </Link>
        <Link
          href="/salida"
          className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
        >
          Ir a la salida
        </Link>
      </div>
    </section>
  );
}
