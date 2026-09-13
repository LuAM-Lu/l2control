"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  Check,
  CircleCheckBig,
  CircleDollarSign,
  Coins,
  Copy,
  CreditCard,
  HandCoins,
  Keyboard,
  PiggyBank,
  Plus,
  ShoppingBag,
  Smartphone,
  X,
  Zap,
} from "lucide-react";
import {
  type FrozenRate,
  type Money,
  add,
  convert,
  invertRate,
  money,
  multiply,
  toMajor,
  zero,
} from "@l2/domain-money";
import {
  computeDocument,
  computeIgtf,
  pagoQueCubreConIgtf,
  type DocumentLine,
  type TaxRule,
} from "@l2/domain-tax";
import {
  closeSettlement,
  computeBalance,
  type ChangeDisposition,
  type PointOfSale,
  type Tender,
} from "@l2/domain-cash";
import { Badge, Button, Container, MoneyDisplay, NumericKeypad, Stepper, avisar, cn, formatMoneyVE } from "@l2/ui";
import type { MedioPago } from "./fixtures.ts";
import {
  PRODUCTOS_MOSTRADOR,
  CATEGORIAS_MOSTRADOR,
  type CategoriaMostrador,
  type ProductoMostrador,
  calcularBilletesSugeridos,
} from "./catalogo-mostrador.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { FamilyAccountSchema, type AccountLineDto, type FamilyAccountDto } from "@l2/contracts";
import {
  esLineaDeMostrador,
  lineasParaCobrar,
  marcarCobrada,
  pendiente,
  puedeDescartarse,
} from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";

const MEDIO_ICONS: Record<string, typeof Banknote> = {
  EFECTIVO_USD: Banknote,
  EFECTIVO_VES: Coins,
  PAGO_MOVIL: Smartphone,
  PDV_DEBITO: CreditCard,
  ZELLE: Zap,
  USDT: CircleDollarSign,
};

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
  onAgregarProducto,
  onCambiarCantidad,
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
  onAgregarProducto?: (producto: ProductoMostrador) => void;
  /** Deja un ítem de mostrador en esa cantidad; 0 lo elimina. */
  onCambiarCantidad?: (item: ItemDeMostrador, cantidad: number) => void;
}) {
  const FUNCIONAL = "USD" as const;

  const [pagos, setPagos] = useState<{ uid: string; medio: MedioPago; amount: Money }[]>([]);
  const [medioActivo, setMedioActivo] = useState<MedioPago>(mediosDisponibles[0]!);
  const [monto, setMonto] = useState("");
  const [destinoVuelto, setDestinoVuelto] = useState<"VUELTO" | "PROPINA" | "CAJA">("VUELTO");
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(
    cuenta.id.startsWith("c-dir-") || cuenta.family.startsWith("Mostrador"),
  );
  // El teclado se abre bajo demanda: «Cobrar exacto» y los billetes cubren el
  // caso común, y con todo abierto la columna no cabía a 1366×768 y el teclado
  // quedaba aplastado debajo del botón de cierre.
  const [teclado, setTeclado] = useState(false);
  /** Fila de mostrador tocada: enseña su cantidad y «Eliminar». */
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);

  // Estilo factura: los ítems iguales de mostrador van en UNA fila con su
  // cantidad. Cada unidad sigue siendo su propia línea en la cuenta; aquí solo
  // se agrupan para leerlas y editarlas. Lo consumido va siempre en su fila.
  const filas = useMemo(() => agruparFilas(lines, cuenta), [lines, cuenta]);

  function copiarTexto(texto: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(texto)
        .then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        })
        .catch(() => {});
    }
  }

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
      const r = closeSettlement({
        due: aCobrar,
        tenders,
        dispositions,
        functional: FUNCIONAL,
        maxRetained,
      });
      onCobrado({ total: toMajor(aCobrar), vuelto: toMajor(r.changeOut) });
      setPagos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el cobro");
    }
  }

  const puedeCobrar = balance !== null && falta.amount === 0n && pagos.length > 0;

  /* --------------------------------------------------------- conversiones y atajos */

  const digitos = monto.replace(/\D/g, "");
  const tecleado = money(BigInt(digitos === "" ? "0" : digitos), medioActivo.currency);
  const cubierto = balance !== null && falta.amount === 0n && pagos.length > 0;

  const aBolivares = rate ? (rate.from === falta.currency ? rate : invertRate(rate)) : null;
  const faltaEnBsMoney =
    aBolivares && aBolivares.from === falta.currency ? convert(falta, aBolivares) : null;
  const faltaEnBs = faltaEnBsMoney ? formatMoneyVE(toMajor(faltaEnBsMoney), "VES") : null;

  const aBolivaresParaSobra = rate ? (rate.from === sobra.currency ? rate : invertRate(rate)) : null;
  const sobraEnBsMoney =
    aBolivaresParaSobra && aBolivaresParaSobra.from === sobra.currency && sobra.amount > 0n
      ? convert(sobra, aBolivaresParaSobra)
      : null;
  const sobraEnBs = sobraEnBsMoney ? formatMoneyVE(toMajor(sobraEnBsMoney), "VES") : null;

  const tasaTexto = rate
    ? `${toMajor(money(rate.numerator, "VES")).replace(".", ",")} Bs/$`
    : null;

  // Monto exacto para cubrir 100% de la deuda con el medio activo en 1 toque
  const montoExacto: Money | null = useMemo(() => {
    if (falta.amount <= 0n) return null;

    if (medioActivo.currency === "VES") {
      if (!aBolivares || aBolivares.from !== falta.currency) return null;
      return convert(falta, aBolivares);
    }

    if (medioActivo.triggersIgtf) {
      // El pago cubre la deuda Y su propio IGTF. El USDT se trata 1:1 con el
      // dólar, como en el consolidado del IGTF (DEC-1).
      return pagoQueCubreConIgtf(money(falta.amount, medioActivo.currency), igtfBasisPoints);
    }

    return falta;
  }, [falta, medioActivo, aBolivares, igtfBasisPoints]);

  const billetesSugeridos = useMemo(() => {
    return calcularBilletesSugeridos(falta.amount);
  }, [falta.amount]);

  function cobrarMontoExacto() {
    if (!montoExacto) return;
    setError(null);
    setPagos((prev) => [
      ...prev,
      { uid: globalThis.crypto.randomUUID(), medio: medioActivo, amount: montoExacto },
    ]);
    setMonto("");
  }

  function agregarBilleteRapido(dolares: number) {
    setError(null);
    const valor = money(BigInt(dolares) * 100n, "USD");
    setPagos((prev) => [
      ...prev,
      { uid: globalThis.crypto.randomUUID(), medio: medioActivo, amount: valor },
    ]);
    setMonto("");
  }

  return (
    <>
        {/* ═══════════════════════ la cuenta ═══════════════════════════ */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div>
              <h2 className="font-display text-base font-bold text-ink">La cuenta</h2>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                {cuenta.family} · {cuenta.mode === "PREPAGO" ? "prepago" : "cuenta abierta"}
              </span>
            </div>
            {onAgregarProducto && (
              <button
                type="button"
                onClick={() => setMostrarCatalogo((prev) => !prev)}
                className={cn(
                  "inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold transition-all",
                  mostrarCatalogo
                    ? "border-brand bg-brand/15 text-brand"
                    : "border-line bg-base text-ink-2 hover:border-brand/50 hover:text-ink",
                )}
              >
                <ShoppingBag size={13} />
                <span>{mostrarCatalogo ? "Ocultar ítems" : "Añadir ítems"}</span>
              </button>
            )}
          </div>

          {/* Catálogo táctil de mostrador (snacks, bebidas, golosinas) */}
          {mostrarCatalogo && onAgregarProducto && (
            <div className="border-b border-line bg-base/50 p-3">
              <CartaMostrador aBolivares={aBolivares} onElegir={onAgregarProducto} alto="max-h-52" />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* Estilo factura: concepto a la izquierda, importe alineado a la
                derecha, filas compactas y sin numerar. Lo que se añadió en
                mostrador se toca para quitarlo: la fila crece y enseña el
                botón, en vez de llevar una «x» diminuta en cada renglón. */}
            <div className="flex items-baseline justify-between border-b border-line pb-1.5 text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
              <span>Concepto</span>
              <span>Importe</span>
            </div>
            <ul className="flex flex-col divide-y divide-dashed divide-line/60">
              {filas.map((f) => {
                const importe = formatMoneyVE(toMajor(multiply(f.precio, BigInt(f.cantidad))), f.precio.currency);
                const editable = f.item !== null && onCambiarCantidad !== undefined;
                const abierta = editable && filaAbierta === f.clave;
                const nombre = (
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    {f.item && <ShoppingBag size={12} className="shrink-0 self-center text-ink-3" aria-hidden="true" />}
                    <span className="truncate text-ink-2">{f.concepto}</span>
                    {f.cantidad > 1 && <span className="tnum shrink-0 text-[12px] font-semibold text-ink-3">× {f.cantidad}</span>}
                  </span>
                );
                return (
                  <li key={f.clave} className={cn(abierta && "bg-surface-2/60")}>
                    {editable ? (
                      <button
                        type="button"
                        aria-expanded={abierta}
                        aria-label={`${f.concepto}, ${f.cantidad} ${f.cantidad === 1 ? "unidad" : "unidades"}, ${importe}. Cambiar cantidad`}
                        onClick={() => setFilaAbierta(abierta ? null : f.clave)}
                        className="flex min-h-9 w-full cursor-pointer items-baseline justify-between gap-3 py-1.5 text-left text-[13.5px] transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {nombre}
                        <span className="tnum shrink-0 font-medium text-ink">{importe}</span>
                      </button>
                    ) : (
                      <div className="flex min-h-9 items-baseline justify-between gap-3 py-1.5 text-[13.5px]">
                        {nombre}
                        <span className="tnum shrink-0 font-medium text-ink">{importe}</span>
                      </div>
                    )}
                    {abierta && f.item && (
                      <div className="flex flex-wrap items-center gap-2 pb-2">
                        <Stepper
                          value={f.cantidad}
                          onChange={(n) => onCambiarCantidad?.(f.item!, n)}
                          label={`Cantidad de ${f.concepto}`}
                          min={0}
                          max={50}
                          surface="pos"
                        />
                        <span className="tnum text-[12px] text-ink-3">
                          {formatMoneyVE(toMajor(f.precio), f.precio.currency)} c/u
                        </span>
                        <Button
                          surface="pos"
                          variant="danger"
                          className="ml-auto text-[13px]"
                          onClick={() => {
                            onCambiarCantidad?.(f.item!, 0);
                            setFilaAbierta(null);
                          }}
                        >
                          <X size={15} aria-hidden="true" />
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Los pagos son parte del mismo documento, no una tarjeta aparte. */}
            {pagos.length === 0 ? (
              <p className="mt-4 border-t border-line/40 pt-4 text-[13px] text-ink-3">
                Todavía no se ha recibido ningún pago. Elige el medio, teclea el monto o pulsa
                «Cobrar exacto». Se pueden combinar varios: efectivo y punto, dólares y bolívares.
              </p>
            ) : (
              <div className="mt-5">
                <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  Pagos recibidos
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {pagos.map((p) => {
                    const linea = igtf.lines.find((l) => l.methodCode === p.medio.code);
                    const Icon = MEDIO_ICONS[p.medio.code] ?? Banknote;
                    return (
                      <li
                        key={p.uid}
                        className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-base/60 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon size={14} className="text-ink-3 shrink-0" aria-hidden="true" />
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

          {/* Los totales quedan CLAVADOS abajo */}
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
        <aside className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-3.5 shadow-card [&>*]:shrink-0 md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3 lg:row-span-1">
          {/* ── la cifra que manda: visor bimoneda simultáneo y adaptable ── */}
          <div
            className={cn(
              "relative overflow-hidden rounded-[var(--radius-control)] border p-3.5",
              "transition-all duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
              cubierto
                ? "border-state-ok/40 bg-state-ok-bg/40 shadow-xs"
                : "border-line-strong bg-base shadow-xs",
            )}
          >
            {/* Con el teclado abierto el visor baja a un renglón: el teclado necesita el alto. */}
            <div className={cn("flex items-center justify-between gap-2 border-b border-line/40 pb-2", teclado && !cubierto && "hidden")}>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    cubierto ? "bg-state-ok" : "bg-brand animate-pulse",
                  )}
                />
                <p className="text-[11px] font-bold tracking-[0.08em] text-ink uppercase">
                  {cubierto ? "Cubierto · listo para cerrar" : "Falta por cobrar"}
                </p>
              </div>
              {tasaTexto && (
                <span className="tnum inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-ink-2 shadow-2xs">
                  <span className="text-ink-3">Tasa:</span>
                  <span className="text-ink">{tasaTexto}</span>
                </span>
              )}
            </div>

            {cubierto ? (
              <div className="mt-2.5 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-bold text-state-ok">
                    Total cubierto con éxito
                  </span>
                  <span className="text-[11px] font-bold tracking-wider text-state-ok uppercase">
                    Listo
                  </span>
                </div>
                {sobra.amount > 0n ? (
                  <div className="mt-1 rounded-[var(--radius-control)] border border-brand/30 bg-brand/10 p-2.5">
                    <span className="mb-1 block text-[10.5px] font-bold tracking-wider text-brand uppercase">
                      Vuelto a entregar al cliente:
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="tnum text-xl font-bold text-ink">
                        {formatMoneyVE(toMajor(sobra), "USD")}
                      </span>
                      {sobraEnBs && (
                        <span className="tnum text-sm font-semibold text-ink-2">
                          ≈ {sobraEnBs}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    El monto cobrado cuadra exactamente con el total de la cuenta.
                  </p>
                )}
              </div>
            ) : teclado ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[11px] font-bold tracking-[0.08em] text-ink uppercase">Falta</span>
                <MoneyDisplay value={toMajor(falta)} currency="USD" size="lg" className="ml-auto" />
                {faltaEnBs && <span className="tnum text-sm font-semibold text-ink-2">{faltaEnBs}</span>}
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                <div>
                  <MoneyDisplay
                    value={toMajor(falta)}
                    currency="USD"
                    size="hero"
                    className="leading-none tracking-tight"
                  />
                </div>
                {faltaEnBs && (
                  <div className="flex items-center justify-between rounded border border-line/60 bg-surface/80 px-2.5 py-1.5 shadow-2xs">
                    <span className="text-[10px] font-semibold tracking-wider text-ink-3 uppercase">
                      En bolívares (BCV)
                    </span>
                    <span
                      className={cn(
                        "tnum font-bold text-ink-2",
                        faltaEnBs.length > 13 ? "text-base" : "text-lg md:text-xl",
                      )}
                    >
                      {faltaEnBs}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── atajo 1 toque: cobrar exacto ── */}
          {!cubierto && !teclado && montoExacto && (
            <button
              type="button"
              onClick={cobrarMontoExacto}
              className={cn(
                "group flex min-h-14 w-full cursor-pointer items-center justify-between rounded-[var(--radius-control)] border px-3 py-2 text-left",
                "border-brand/40 bg-brand/10 hover:border-brand hover:bg-brand/20",
                "transition-all duration-[var(--dur-rapida)] active:scale-[0.99]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="grid size-6 place-content-center rounded bg-brand text-ink-inverse transition-transform group-hover:scale-110">
                  <Zap size={14} className="fill-current" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[12px] font-bold text-ink">
                    Cobrar exacto ({medioActivo.label})
                  </span>
                  <span className="text-[10px] text-ink-3">
                    1 toque · Sin usar el teclado
                  </span>
                </span>
              </span>
              <span className="tnum rounded border border-brand/20 bg-surface px-2 py-0.5 text-[12.5px] font-bold text-brand shadow-2xs">
                {formatMoneyVE(toMajor(montoExacto), medioActivo.currency)}
              </span>
            </button>
          )}

          {/* ── medio de pago con iconos y jerarquía financiera ── */}
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Medio de pago">
            {mediosDisponibles.map((m) => {
              const activo = m.code === medioActivo.code;
              const bloqueado = m.currency !== FUNCIONAL && !rate;
              const Icon = MEDIO_ICONS[m.code] ?? Banknote;
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
                    "flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border p-2 text-left",
                    "transition-all duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "disabled:cursor-not-allowed disabled:opacity-35",
                    activo
                      ? "border-brand bg-brand/12 text-ink ring-1 ring-brand/30 shadow-2xs"
                      : "border-line bg-base text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="truncate text-[12px] leading-tight font-bold">
                      {m.label}
                    </span>
                    <Icon size={13} className={activo ? "text-brand" : "text-ink-3"} aria-hidden="true" />
                  </div>
                  <div className="mt-0.5 flex w-full items-center justify-between text-[9.5px]">
                    <span className={m.currency === "VES" ? "font-semibold text-ink-2" : "text-ink-3"}>
                      {m.currency}
                    </span>
                    {m.triggersIgtf ? (
                      <span className="rounded bg-state-warn-bg px-1 py-0.2 font-bold text-state-warn">
                        +3% IGTF
                      </span>
                    ) : (
                      <span className="text-ink-3">0% IGTF</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── panel contextual: billetes rápidos inteligentes para Efectivo $ ── */}
          {!cubierto && !teclado && medioActivo.code === "EFECTIVO_USD" && (
            <div className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line bg-surface/60 p-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-semibold tracking-wider text-ink-3 uppercase">
                  Billetes rápidos ({falta.amount >= 5000n ? "Monto inteligente" : "Efectivo $"})
                </span>
                <span className="text-[10px] text-ink-3">Añade directo</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {billetesSugeridos.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => agregarBilleteRapido(b)}
                    className={cn(
                      "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded border border-line bg-base",
                      "font-mono text-sm font-bold text-ink transition-colors",
                      "hover:border-brand hover:bg-brand/15 hover:text-brand active:scale-95",
                    )}
                  >
                    ${b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── panel contextual: datos de Pago Móvil ── */}
          {!teclado && medioActivo.code === "PAGO_MOVIL" && (
            <div
              aria-label="Datos de Pago Móvil del local"
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-brand/30 bg-surface py-1.5 pr-1.5 pl-2.5 text-[11px]"
            >
              <Smartphone size={14} className="shrink-0 text-brand" aria-hidden="true" />
              <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] gap-x-3">
                <span className="text-[9.5px] text-ink-3 uppercase">Banco</span>
                <span className="text-[9.5px] text-ink-3 uppercase">Teléfono</span>
                <span className="text-[9.5px] text-ink-3 uppercase">RIF</span>
                <span className="font-bold text-ink">Banesco 0134</span>
                <span className="tnum truncate font-bold text-ink">0414-234.56.78</span>
                <span className="tnum font-bold text-ink">J-40123456-7</span>
              </div>
              <button
                type="button"
                onClick={() => copiarTexto("Banesco (0134) - 0414-234.56.78 - J-40123456-7")}
                aria-label="Copiar los datos de Pago Móvil"
                className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1 rounded border border-line bg-base px-2.5 text-[11.5px] font-medium text-ink-2 hover:border-brand hover:text-brand"
              >
                {copiado ? <Check size={12} className="text-state-ok" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                <span>{copiado ? "Copiado" : "Copiar"}</span>
              </button>
            </div>
          )}

          {/* ── panel contextual: Zelle ── */}
          {!teclado && medioActivo.code === "ZELLE" && (
            <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-line bg-surface p-2 text-xs">
              <div>
                <span className="block text-[9.5px] uppercase text-ink-3">Zelle del comercio</span>
                <span className="font-bold text-ink">pagos@parquel2.com</span>
                <span className="block text-[10px] text-ink-3">Parque Infantil L2 C.A.</span>
              </div>
              <button
                type="button"
                onClick={() => copiarTexto("pagos@parquel2.com")}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded border border-line bg-base px-3 text-[11.5px] font-medium text-ink-2 hover:border-brand hover:text-brand"
              >
                {copiado ? <Check size={11} className="text-state-ok" /> : <Copy size={11} />}
                <span>{copiado ? "Copiado" : "Copiar"}</span>
              </button>
            </div>
          )}

          {/* ── otro monto: teclado bajo demanda ── */}
          {!cubierto && !teclado && (
            <Button surface="pos" variant="neutral" className="w-full text-[15px]" onClick={() => setTeclado(true)}>
              <Keyboard size={17} aria-hidden="true" />
              Otro monto ({medioActivo.currency})
            </Button>
          )}
          {teclado && (
            <>
              <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-base py-1 pr-1.5 pl-3">
                <span className="text-[10.5px] font-bold tracking-[0.08em] text-ink-3 uppercase">
                  Monto manual ({medioActivo.currency})
                </span>
                <span
                  aria-live="polite"
                  className={cn("tnum ml-auto text-xl leading-none font-bold", digitos === "" ? "text-ink-3" : "text-ink")}
                >
                  {toMajor(tecleado)}
                </span>
                <button
                  type="button"
                  aria-label="Cerrar el teclado"
                  title="Cerrar el teclado"
                  onClick={() => {
                    setTeclado(false);
                    setMonto("");
                  }}
                  className="grid size-10 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
              <NumericKeypad
                value={monto}
                onChange={setMonto}
                maxLength={9}
                // Filas de 56 px: el objetivo de POS de §8.4, sin robar el alto que
                // necesita la columna a 1366×768.
                surface="tablet"
                onSubmit={agregarPago}
                submitLabel="Añadir"
                className="shrink-0"
              />
            </>
          )}

          {faltaTasa && (
            <p role="alert" className="text-[12px] text-state-crit">
              Hay un pago en otra moneda sin tasa congelada. No se puede cobrar (ADR-005).
            </p>
          )}

          {/* El excedente exige una decisión: no se cierra solo (§5.6). */}
          {sobra.amount > 0n && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/8 p-2.5">
              <div className="flex items-baseline justify-between">
                <p className="text-[11.5px] font-medium text-ink-2">Destino del vuelto:</p>
                {sobraEnBs && (
                  <span className="tnum text-[11px] font-semibold text-brand">
                    {sobraEnBs}
                  </span>
                )}
              </div>
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
                        ? "border-brand bg-brand/15 text-brand font-semibold"
                        : "border-line text-ink-2 hover:text-ink",
                    )}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
              {destinoVuelto === "CAJA" && sobra.amount > maxRetained.amount && (
                <p className="text-[11.5px] text-state-crit">
                  Por encima del umbral ({toMajor(maxRetained)} USD) no se puede dejar en caja: hay
                  que dar vuelto o marcarlo como propina.
                </p>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit"
            >
              {error}
            </p>
          )}

          <Button
            surface="pos"
            variant="primary"
            disabled={!puedeCobrar}
            onClick={cobrar}
            className={cn(
              "w-full text-base font-bold transition-all",
              puedeCobrar
                ? "min-h-14 bg-state-ok text-ink shadow-md shadow-state-ok/20 hover:bg-state-ok/90 active:scale-[0.99]"
                : "min-h-14 py-1.5 flex flex-col items-center justify-center leading-tight gap-0.5",
            )}
          >
            {puedeCobrar ? (
              <span className="flex items-center justify-center gap-2">
                <CircleCheckBig size={18} />
                <span>Cerrar cobro (Total {formatMoneyVE(toMajor(aCobrar), "USD")})</span>
              </span>
            ) : (
              <>
                <span className="text-sm sm:text-[15px] font-bold text-ink">
                  Faltan {formatMoneyVE(toMajor(falta), "USD")}
                </span>
                {faltaEnBs && (
                  <span className="text-[11px] font-semibold text-ink-3">
                    ≈ {faltaEnBs}
                  </span>
                )}
              </>
            )}
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
  const { cuentas, guardar, descartar } = useCuentas();
  const router = useRouter();
  const porCobrar = cuentas.filter((c) => c.status === "POR_COBRAR");
  const [elegida, setElegida] = useState<string | null>(cuentaInicial);
  const actual = porCobrar.find((c) => c.id === elegida) ?? porCobrar[0] ?? null;
  const lineas = useMemo(() => (actual ? lineasParaCobrar(actual) : []), [actual]);
  const origen = volver !== null ? (ORIGEN[volver] ?? null) : null;
  /** Venta directa en curso, antes de elegir el primer producto. */
  const [ventaNueva, setVentaNueva] = useState(false);
  const aBolivares = cobro.rate ? (cobro.rate.from === "USD" ? cobro.rate : invertRate(cobro.rate)) : null;

  function alCobrar(cuenta: FamilyAccountDto, r: { total: string; vuelto: string }) {
    guardar(marcarCobrada(cuenta));
    setElegida(null);
    avisar.ok(`Cobrado: ${formatMoneyVE(r.total, "USD")} · ${cuenta.family}`, {
      ...(r.vuelto !== "0.00" ? { detalle: `Vuelto entregado: ${formatMoneyVE(r.vuelto, "USD")}` } : {}),
      ...(origen ? { accion: { texto: `Volver a ${origen.nombre}`, alPulsar: () => router.push(origen.ruta) } } : {}),
    });
  }

  function onNuevaVentaDirecta() {
    setVentaNueva(true);
  }

  /**
   * La venta directa NACE con el primer producto elegido. Antes se abría con un
   * «Agua mineral» ya cargado: si la cajera no lo quitaba, se cobraba algo que
   * nadie pidió (fail-closed: no se cobra nada que no se haya elegido).
   *
   * ⚠ DEUDA: una venta de mostrador no es una cuenta de familia. Se modela con
   * `FamilyAccountSchema` y una estancia ficticia `s-mostrador` porque el
   * contrato exige un niño; necesita su propio tipo de cuenta en el contrato.
   */
  function crearVentaDirecta(producto: ProductoMostrador) {
    const numero = cuentas.filter((c) => c.id.startsWith("c-dir-")).length + 1;
    const id = `c-dir-${globalThis.crypto.randomUUID().slice(0, 6)}`;
    const nueva: FamilyAccountDto = FamilyAccountSchema.parse({
      id,
      family: `Mostrador #${numero}`,
      mode: "PREPAGO",
      status: "POR_COBRAR",
      openedAt: new Date().toISOString(),
      sessionIds: ["s-mostrador"],
      closedSessionIds: ["s-mostrador"],
      lines: [
        {
          id: `${id}-snk-1`,
          concept: producto.name,
          kind: "RESTAURANTE",
          amount: { minor: producto.priceMinor, currency: "USD" },
          paid: false,
        },
      ],
    });
    guardar(nueva);
    setElegida(nueva.id);
    setVentaNueva(false);
  }

  function onAgregarProductoACuenta(producto: ProductoMostrador) {
    if (!actual) return;
    const nuevaLinea: AccountLineDto = {
      id: `${actual.id}-snk-${globalThis.crypto.randomUUID().slice(0, 6)}`,
      concept: producto.name,
      kind: "RESTAURANTE",
      amount: { minor: producto.priceMinor, currency: "USD" },
      paid: false,
    };
    const actualizada = FamilyAccountSchema.parse({
      ...actual,
      lines: [...actual.lines, nuevaLinea],
      status: "POR_COBRAR",
    });
    guardar(actualizada);
  }

  /**
   * Deja un ítem de mostrador en la cantidad pedida, en UN solo guardado: quita
   * las últimas unidades o añade nuevas justo detrás de las que ya había, así
   * la fila no salta de sitio. Con 0 desaparece. Si una venta directa se queda
   * vacía, se descarta entera: no hay nada que cobrar.
   */
  function onCambiarCantidadEnCuenta(item: ItemDeMostrador, cantidad: number) {
    if (!actual) return;
    const esDelItem = (l: AccountLineDto) =>
      esLineaDeMostrador(l) && l.concept === item.concepto && l.amount.minor === item.priceMinor;
    const suyas = actual.lines.filter(esDelItem);
    const objetivo = Math.max(0, Math.min(50, Math.trunc(cantidad)));
    if (objetivo === suyas.length) return;

    let lineas: AccountLineDto[];
    if (objetivo < suyas.length) {
      const fuera = new Set(suyas.slice(objetivo).map((l) => l.id));
      lineas = actual.lines.filter((l) => !fuera.has(l.id));
    } else {
      const producto = PRODUCTOS_MOSTRADOR.find((p) => p.name === item.concepto && p.priceMinor === item.priceMinor);
      // Fail-closed: si el producto ya no está en la carta, no se venden más.
      if (!producto) return;
      const nuevas: AccountLineDto[] = Array.from({ length: objetivo - suyas.length }, () => ({
        id: `${actual.id}-snk-${globalThis.crypto.randomUUID().slice(0, 6)}`,
        concept: producto.name,
        kind: "RESTAURANTE",
        amount: { minor: producto.priceMinor, currency: "USD" },
        paid: false,
      }));
      const ultima = actual.lines.findLastIndex(esDelItem);
      lineas = ultima < 0 ? [...actual.lines, ...nuevas] : [...actual.lines.slice(0, ultima + 1), ...nuevas, ...actual.lines.slice(ultima + 1)];
    }

    if (!lineas.some((l) => !l.paid)) {
      if (puedeDescartarse(actual)) {
        descartar(actual.id);
        setElegida(null);
        avisar.info(`${actual.family} descartada: no quedaba nada por cobrar`);
      }
      return;
    }
    guardar(FamilyAccountSchema.parse({ ...actual, lines: lineas, status: "POR_COBRAR" }));
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
          // En tablet vertical, dos columnas: la cola sobre la cuenta y el
          // cobro al lado, a todo el alto. En escritorio, tres.
          "md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]",
          "lg:min-h-0 lg:grid-cols-[16rem_minmax(0,1fr)_clamp(360px,30vw,420px)]",
        )}
      >
        <ColaCuentas
          cuentas={porCobrar}
          actual={actual?.id ?? null}
          onElegir={(id) => {
            setVentaNueva(false);
            setElegida(id);
          }}
          onNuevaVentaDirecta={onNuevaVentaDirecta}
          ventaNueva={ventaNueva}
        />
        {ventaNueva ? (
          <NuevaVentaDirecta
            aBolivares={aBolivares}
            onElegir={crearVentaDirecta}
            onCancelar={() => setVentaNueva(false)}
          />
        ) : actual ? (
          <CobroCuenta
            key={actual.id}
            {...cobro}
            cuenta={actual}
            lines={lineas}
            onCobrado={(r) => alCobrar(actual, r)}
            onAgregarProducto={onAgregarProductoACuenta}
            onCambiarCantidad={onCambiarCantidadEnCuenta}
          />
        ) : (
          <SinCuentas />
        )}
      </Container>
    </div>
  );
}

function ColaCuentas({
  cuentas,
  actual,
  onElegir,
  onNuevaVentaDirecta,
  ventaNueva,
}: {
  cuentas: readonly FamilyAccountDto[];
  actual: string | null;
  onElegir: (id: string) => void;
  onNuevaVentaDirecta: () => void;
  ventaNueva: boolean;
}) {
  return (
    <section
      aria-label="Cuentas por cobrar"
      className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:col-start-1 md:row-start-1 lg:col-start-1 lg:row-start-1"
    >
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-base font-bold text-ink">Por cobrar</h2>
        <span className="tnum text-[12px] text-ink-3">{cuentas.length}</span>
      </div>

      <div className="border-b border-line/40 p-2">
        <button
          type="button"
          onClick={onNuevaVentaDirecta}
          aria-pressed={ventaNueva}
          className={cn(
            "flex min-h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed px-3 text-[13px] font-bold transition-all active:scale-[0.99]",
            ventaNueva ? "border-brand bg-brand/20 text-brand" : "border-brand/50 bg-brand/10 text-brand hover:border-brand hover:bg-brand/20",
          )}
        >
          <Plus size={15} aria-hidden="true" />
          <span>Venta directa</span>
        </button>
      </div>

      {cuentas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">La cola está vacía.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
          {cuentas.map((c) => {
            const activa = c.id === actual;
            const esDirecta = c.id.startsWith("c-dir-") || c.family.startsWith("Mostrador");
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={activa}
                  onClick={() => onElegir(c.id)}
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                    "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    activa && !ventaNueva ? "border-brand bg-brand/12" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {c.family}
                    </span>
                    <MoneyDisplay value={toMajor(pendiente(c))} currency="USD" size="sm" />
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {esDirecta ? "Venta mostrador" : c.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"}
                    {!esDirecta && ` · ${c.sessionIds.length} ${c.sessionIds.length === 1 ? "niño" : "niños"}`}
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

/**
 * La carta de mostrador: una rejilla táctil por categorías. La usan la venta
 * directa y «Añadir productos» de una cuenta abierta, así que vive una vez.
 */
function CartaMostrador({
  aBolivares,
  onElegir,
  alto,
}: {
  aBolivares: FrozenRate | null;
  onElegir: (p: ProductoMostrador) => void;
  /** Alto máximo de la rejilla, que se desplaza por dentro si no cabe. */
  alto?: string;
}) {
  const [categoria, setCategoria] = useState<CategoriaMostrador>("Todos");
  const productos = categoria === "Todos" ? PRODUCTOS_MOSTRADOR : PRODUCTOS_MOSTRADOR.filter((p) => p.category === categoria);
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div role="group" aria-label="Categorías de mostrador" className="flex flex-wrap gap-1.5">
        {CATEGORIAS_MOSTRADOR.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={categoria === cat}
            onClick={() => setCategoria(cat)}
            className={cn(
              "min-h-10 cursor-pointer rounded-[var(--radius-control)] px-3 text-xs font-semibold transition-colors",
              categoria === cat ? "bg-brand text-on-brand" : "border border-line/60 bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className={cn("grid grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3", alto)}>
        {productos.map((p) => {
          const usd = money(BigInt(p.priceMinor), "USD");
          const bs = aBolivares ? convert(usd, aBolivares) : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onElegir(p)}
              className="flex min-h-14 cursor-pointer flex-col items-start justify-between rounded-[var(--radius-control)] border border-line bg-surface p-2 text-left transition-all hover:border-brand hover:bg-brand/10 active:scale-[0.98]"
            >
              <span className="text-[12.5px] leading-tight font-bold text-ink">{p.name}</span>
              <span className="mt-1 flex w-full flex-wrap items-baseline justify-between gap-x-2">
                <span className="tnum text-xs font-bold text-brand">{formatMoneyVE(toMajor(usd), "USD")}</span>
                {bs && <span className="tnum text-[10px] font-medium text-ink-3">{formatMoneyVE(toMajor(bs), "VES")}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Venta directa antes del primer producto: la carta y nada cobrado. */
function NuevaVentaDirecta({
  aBolivares,
  onElegir,
  onCancelar,
}: {
  aBolivares: FrozenRate | null;
  onElegir: (p: ProductoMostrador) => void;
  onCancelar: () => void;
}) {
  return (
    <>
      <section
        aria-label="Nueva venta directa"
        className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-brand/40 bg-surface shadow-card md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1"
      >
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-bold text-ink">Venta directa</h2>
          <p className="text-[12.5px] text-ink-3">Toca el primer producto: la venta nace con él. Nada se cobra antes.</p>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <CartaMostrador aBolivares={aBolivares} onElegir={onElegir} alto="lg:max-h-none" />
        </div>
      </section>
      <aside className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 py-10 text-center md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3 lg:row-span-1">
        <ShoppingBag size={28} className="text-ink-3" aria-hidden="true" />
        <p className="font-display text-lg font-bold text-ink">El cobro aparece al elegir</p>
        <p className="max-w-xs text-[13px] text-ink-2">Con el primer producto se abre la cuenta de mostrador y su cobro.</p>
        <Button surface="pos" variant="neutral" onClick={onCancelar}>
          Cancelar la venta
        </Button>
      </aside>
    </>
  );
}

/** La clave de un ítem de mostrador: lo que se vende y a qué precio. */
type ItemDeMostrador = Readonly<{ concepto: string; priceMinor: string }>;

type Fila = Readonly<{
  clave: string;
  concepto: string;
  precio: Money;
  cantidad: number;
  /** El ítem editable, o `null` si la fila es algo ya consumido. */
  item: ItemDeMostrador | null;
}>;

/** Agrupa las líneas por ítem de mostrador, en el orden en que apareció cada uno. */
function agruparFilas(lines: readonly DocumentLine[], cuenta: FamilyAccountDto): Fila[] {
  const filas = new Map<string, Fila>();
  for (const l of lines) {
    const linea = cuenta.lines.find((x) => x.id === l.id);
    const deMostrador = linea !== undefined && esLineaDeMostrador(linea);
    const clave = deMostrador ? `mostrador|${l.description}|${l.unitPrice.amount}` : l.id;
    const previa = filas.get(clave);
    filas.set(clave, {
      clave,
      concepto: l.description,
      precio: l.unitPrice,
      cantidad: (previa?.cantidad ?? 0) + Number(l.quantity),
      item: deMostrador ? { concepto: l.description, priceMinor: String(l.unitPrice.amount) } : null,
    });
  }
  return [...filas.values()];
}

function SinCuentas() {
  return (
    <section className="flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 py-10 text-center md:col-span-2 md:row-start-2 lg:col-start-2 lg:row-start-1">
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
