"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Check,
  CircleCheckBig,
  CircleDollarSign,
  Coins,
  Copy,
  CreditCard,
  HandCoins,
  Pencil,
  PiggyBank,
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
  fromMajor,
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
  refundableByTender,
  type ChangeDisposition,
  type PointOfSale,
  type Tender,
} from "@l2/domain-cash";
import { Button, Container, MoneyDisplay, NumericKeypad, Stepper, avisar, cn, formatMoneyVE } from "@l2/ui";
import type { MedioPago } from "./medios.ts";
import {
  PRODUCTOS_MOSTRADOR,
  CATEGORIAS_MOSTRADOR,
  type CategoriaMostrador,
  type ProductoMostrador,
  BILLETES_USD,
} from "./catalogo-mostrador.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  FamilyAccountSchema,
  CONSUMIDOR_FINAL,
  type AccountLineDto,
  type ClienteFacturaDto,
  type DatosDePagoDto,
  type FamilyAccountDto,
  type PagoDeVentaDto,
  type PosTerminalDto,
} from "@l2/contracts";
import { DatosPagoDialog, claveDeReferencia, resumenDatos, type Recordados } from "./DatosPagoDialog.tsx";
import { ClienteFacturaDialog, documentoEnmascarado } from "./ClienteFacturaDialog.tsx";
import { TECLA_MEDIO, useAtajos } from "./atajos.ts";
import { AtajosDialog, PistaTecla } from "./AtajosDialog.tsx";
import { ColaCuentas, filtrarCola, ordenarCola, type FiltroCola } from "./ColaCuentas.tsx";
import { ReciboDialog } from "./ReciboDialog.tsx";
import type { Recibo } from "./recibo.ts";
import { useVentas } from "./VentasProvider.tsx";
import { useOperador } from "../identity/operador.ts";
import { useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import {
  esLineaDeMostrador,
  esVentaDirecta,
  lineasParaCobrar,
  numeroDeOrden,
  marcarCobrada,
  puedeDescartarse,
} from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { formatClock } from "../park/time-format.ts";

/** USDT → USD a la par (DEC-1: cuestión abierta con el contador). */
const PARIDAD_USDT: FrozenRate = { from: "USDT", to: "USD", numerator: 1n, denominator: 1n };

/** Lo que la caja sabe al cerrar un cobro: para el aviso y para el recibo. */
type Cobrado = Readonly<{
  total: string;
  /** El total como dinero, para la venta registrada (regla 3). */
  totalDinero: Money;
  vuelto: string;
  cliente: ClienteFacturaDto;
  /** Los medios usados, sin repetir. */
  medios: readonly string[];
  /** Cada pago con lo que se devolvería si se anula (DEC-24). */
  pagosVenta: readonly PagoDeVentaDto[];
  /** Las líneas de la cuenta que salda este cobro. */
  lineIds: readonly string[];
  recibo: Recibo;
}>;

const DESTINO_SOBRA = { VUELTO: "Vuelto entregado", PROPINA: "Propina", CAJA: "Redondeo a caja" } as const;

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
  terminales,
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
  onCobrado: (r: Cobrado) => void;
  rules: readonly TaxRule[];
  tenders: readonly MedioPago[];
  /** Terminales de punto de venta del local (F4-04). */
  terminales: readonly PosTerminalDto[];
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

  const [pagos, setPagos] = useState<{ uid: string; medio: MedioPago; amount: Money; datos?: DatosDePagoDto }[]>([]);
  /** Pago esperando sus datos: no entra al cobro hasta confirmarlos (F4-04). */
  const [pendienteDeDatos, setPendienteDeDatos] = useState<{ medio: MedioPago; amount: Money } | null>(null);
  /** A nombre de quién sale la factura: consumidor final salvo que se pida (DEC-23). */
  const [cliente, setCliente] = useState<ClienteFacturaDto>(CONSUMIDOR_FINAL);
  const [identificando, setIdentificando] = useState(false);
  /** Último banco, terminal y red: la siguiente vez ya vienen puestos. */
  const [recordados, setRecordados] = useState<Recordados>({});
  const [medioActivo, setMedioActivo] = useState<MedioPago>(mediosDisponibles[0]!);
  const [monto, setMonto] = useState("");
  const [destinoVuelto, setDestinoVuelto] = useState<"VUELTO" | "PROPINA" | "CAJA">("VUELTO");
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(
    cuenta.id.startsWith("c-dir-") || cuenta.family.startsWith("Mostrador"),
  );
  /** Fila de mostrador tocada: enseña su cantidad y «Eliminar». */
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  /** El pago que se está corrigiendo. */
  const [editando, setEditando] = useState<string | null>(null);
  const pagoEditado = pagos.find((p) => p.uid === editando) ?? null;
  const operador = useOperador();

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
        // Cada moneda con SU tasa. Antes el USDT se convertía con la tasa de
        // bolívares: la conversión fallaba y un cobro con USDT no se podía
        // cerrar nunca. El USDT va 1:1 con el dólar, la misma paridad que ya
        // usa el consolidado del IGTF, pendiente de confirmar con el contador.
        rate: p.amount.currency === FUNCIONAL ? null : p.amount.currency === "USDT" ? PARIDAD_USDT : rate,
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
   * La única puerta de entrada de un pago. Si el medio exige datos (referencia,
   * TxID, terminal…), el pago espera en el diálogo y no cuenta hasta que se
   * confirman: un pago sin referencia no se puede conciliar (F4-04).
   */
  function registrarPago(medio: MedioPago, amount: Money) {
    setError(null);
    if (medio.datos) {
      setPendienteDeDatos({ medio, amount });
      return;
    }
    setPagos((prev) => [...prev, { uid: globalThis.crypto.randomUUID(), medio, amount }]);
    setMonto("");
  }

  function confirmarDatos(datos: DatosDePagoDto | null) {
    const p = pendienteDeDatos;
    if (!p || !datos) return;
    setPagos((prev) => [...prev, { uid: globalThis.crypto.randomUUID(), medio: p.medio, amount: p.amount, datos }]);
    setRecordados((r) => ({
      ...r,
      ...(datos.kind === "PAGO_MOVIL" ? { bankCode: datos.bankCode } : {}),
      ...(datos.kind === "PUNTO" ? { terminalId: datos.terminalId } : {}),
      ...(datos.kind === "USDT" ? { network: datos.network } : {}),
    }));
    setPendienteDeDatos(null);
    setMonto("");
  }

  /**
   * Corregir un pago mal tecleado: se toca y se cambian su monto o sus datos.
   * El cobro aún no está cerrado, así que no hay nada asentado que revertir:
   * el pago se sustituye en el borrador. Una vez cerrado, corregir es una
   * reversión con motivo (regla 5), no esto.
   */
  function confirmarEdicion(datos: DatosDePagoDto | null, montoNuevo: string | null) {
    const p = pagos.find((x) => x.uid === editando);
    if (!p) return;
    let amount = p.amount;
    if (montoNuevo) {
      try {
        amount = fromMajor(montoNuevo, p.amount.currency);
      } catch {
        // `normalizarMonto` ya lo validó; si aun así no cabe, no se cambia nada.
        return;
      }
    }
    setPagos((prev) => prev.map((x) => (x.uid === p.uid ? { ...x, amount, ...(datos ? { datos } : {}) } : x)));
    setEditando(null);
  }

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
    registrarPago(medioActivo, valor);
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
      onCobrado({
        total: toMajor(aCobrar),
        totalDinero: aCobrar,
        vuelto: toMajor(r.changeOut),
        cliente,
        medios: [...new Set(pagos.map((p) => p.medio.label))],
        // Lo que se devolvería de cada pago, calculado AHORA con la tasa del
        // cobro: el excedente (vuelto, propina o residuo) no se devuelve.
        pagosVenta: refundableByTender(tenders, sobra, FUNCIONAL).map((devolvible, i) => ({
          methodCode: pagos[i]!.medio.code,
          label: pagos[i]!.medio.label,
          cash: pagos[i]!.medio.canGiveChange,
          dataKind: pagos[i]!.medio.datos ?? null,
          paid: { minor: String(pagos[i]!.amount.amount), currency: pagos[i]!.amount.currency },
          refundable: { minor: String(devolvible.amount), currency: devolvible.currency },
        })),
        lineIds: lines.map((l) => l.id),
        recibo: armarRecibo(),
      });
      setPagos([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el cobro");
    }
  }

  /** La foto del cobro para el recibo, con los textos ya formateados (recibo.ts). */
  function armarRecibo(): Recibo {
    const ahora = new Date();
    const dinero = (m: Money) => formatMoneyVE(toMajor(m), m.currency);
    const totalBs = aBolivares && aBolivares.from === aCobrar.currency ? convert(aCobrar, aBolivares) : null;
    return {
      orden: numeroDeOrden(cuenta),
      cuenta: esVentaDirecta(cuenta) ? "Venta de mostrador" : cuenta.family,
      cuando: `${ahora.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${formatClock(ahora.getTime())}`,
      facturaA:
        cliente.kind === "CONSUMIDOR_FINAL" ? "Consumidor final" : `${cliente.name} · ${documentoEnmascarado(cliente.document)}`,
      lineas: filas.map((f) => ({ cantidad: f.cantidad, concepto: f.concepto, importe: dinero(multiply(f.precio, BigInt(f.cantidad))) })),
      subtotal: dinero(doc.subtotal),
      impuestos: [
        ...doc.buckets.map((b) => ({ etiqueta: `IVA ${b.basisPoints / 100}%`, monto: dinero(b.tax) })),
        ...(igtfTotal.amount > 0n ? [{ etiqueta: `IGTF ${igtfBasisPoints / 100}%`, monto: dinero(igtfTotal) }] : []),
      ],
      total: dinero(aCobrar),
      totalBs: totalBs ? dinero(totalBs) : null,
      tasa: tasaTexto,
      pagos: pagos.map((p) => ({
        medio: p.medio.label,
        detalle: p.datos ? resumenDatos(p.datos, terminales) : null,
        monto: dinero(p.amount),
      })),
      vuelto: sobra.amount > 0n ? dinero(sobra) : null,
      destinoVuelto: sobra.amount > 0n ? DESTINO_SOBRA[destinoVuelto] : null,
      cajera: operador?.nombre ?? null,
      // TODO(F5-03/backend): el teléfono del representante vendrá con la cuenta.
      telefono: null,
    };
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


  function cobrarMontoExacto() {
    if (!montoExacto) return;
    registrarPago(medioActivo, montoExacto);
  }

  /**
   * Un billete recibido. Se SUMA al último pago si es del mismo efectivo y sin
   * datos: los billetes de una misma entrega son un solo pago, y así el de $1
   * sirve para completar sin llenar la lista de renglones.
   */
  function agregarBilleteRapido(dolares: number) {
    setError(null);
    const billete = multiply(money(100n, "USD"), BigInt(dolares));
    setPagos((prev) => {
      const ultimo = prev.at(-1);
      if (ultimo && ultimo.medio.code === medioActivo.code && !ultimo.datos) {
        return [...prev.slice(0, -1), { ...ultimo, amount: add(ultimo.amount, billete) }];
      }
      return [...prev, { uid: globalThis.crypto.randomUUID(), medio: medioActivo, amount: billete }];
    });
    setMonto("");
  }

  /**
   * En efectivo no hay «Cobrar exacto»: casi nunca se entrega el monto justo, y
   * el botón invitaba a registrar lo que no se contó. Se cuentan billetes o se
   * teclea lo recibido. En los medios electrónicos sí: el monto es exacto.
   */
  const esEfectivo = medioActivo.canGiveChange;

  // Atajos del cobro (atajos.ts): las mismas acciones que los botones, con las
  // mismas condiciones. Lo que un botón deshabilitado no deja, la tecla tampoco.
  useAtajos((t) => {
    if (t.ctrl) {
      if (t.key !== "Enter" || !puedeCobrar) return false;
      cobrar();
      return true;
    }
    if (/^\d$/.test(t.key)) {
      if (cubierto) return false;
      setMonto((m) => (m + t.key).slice(0, 9));
      return true;
    }
    if (t.key === "Backspace") {
      setMonto((m) => m.slice(0, -1));
      return true;
    }
    if (t.key === "Enter") {
      if (cubierto || digitos === "") return false;
      agregarPago();
      return true;
    }
    if (t.key === "+") {
      if (cubierto || !montoExacto || esEfectivo) return false;
      cobrarMontoExacto();
      return true;
    }
    const letra = t.key.toUpperCase();
    if (letra === "I") {
      setIdentificando(true);
      return true;
    }
    const medio = mediosDisponibles.find((m) => TECLA_MEDIO[m.code] === letra);
    if (!medio || (medio.currency !== FUNCIONAL && !rate)) return false;
    setMedioActivo(medio);
    return true;
  });

  return (
    <>
        {/* ═══════════════════════ la cuenta ═══════════════════════════ */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1">
          {/* Un solo renglón: qué orden es, de quién, cómo paga y desde cuándo. */}
          <div className="flex items-center gap-3 border-b border-line py-2 pr-2 pl-5">
            <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="font-display tnum text-lg leading-none font-bold text-ink">{numeroDeOrden(cuenta)}</span>
              <span className="truncate text-[14px] font-semibold text-ink-2">
                {esVentaDirecta(cuenta) ? "Venta de mostrador" : cuenta.family}
              </span>
              <span className="text-[12px] text-ink-3">
                {esVentaDirecta(cuenta) ? "Mostrador" : cuenta.mode === "PREPAGO" ? "Prepago" : "Cuenta abierta"} ·{" "}
                {formatClock(Date.parse(cuenta.openedAt))}
              </span>
            </h2>
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
            <div className={cn(COLUMNAS, "border-b border-line pb-1 text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase")}>
              <span className="text-right">Cant.</span>
              <span>Concepto</span>
              <span className="text-right">P. unit.</span>
              <span className="text-right">Importe</span>
            </div>
            <ul className="flex flex-col divide-y divide-dashed divide-line/60">
              {filas.map((f) => {
                const importe = formatMoneyVE(toMajor(multiply(f.precio, BigInt(f.cantidad))), f.precio.currency);
                const editable = f.item !== null && onCambiarCantidad !== undefined;
                const abierta = editable && filaAbierta === f.clave;
                const celdas = (
                  <>
                    <span className="tnum text-right font-semibold text-ink">{f.cantidad}</span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-ink-2">{f.concepto}</span>
                      {f.item && <ShoppingBag size={11} className="shrink-0 text-ink-3" aria-label="de mostrador" />}
                    </span>
                    <span className="tnum text-right text-ink-3">{formatMoneyVE(toMajor(f.precio), f.precio.currency)}</span>
                    <span className="tnum text-right font-medium text-ink">{importe}</span>
                  </>
                );
                return (
                  <li key={f.clave} className={cn(abierta && "bg-surface-2/60")}>
                    {editable ? (
                      <button
                        type="button"
                        aria-expanded={abierta}
                        aria-label={`${f.concepto}, ${f.cantidad} ${f.cantidad === 1 ? "unidad" : "unidades"}, ${importe}. Cambiar cantidad`}
                        onClick={() => setFilaAbierta(abierta ? null : f.clave)}
                        className={cn(COLUMNAS, "min-h-8 w-full cursor-pointer py-1 text-left text-[13px] transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-brand")}
                      >
                        {celdas}
                      </button>
                    ) : (
                      <div className={cn(COLUMNAS, "min-h-8 py-1 text-[13px]")}>{celdas}</div>
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
              <p className="mt-3 border-t border-line/40 pt-3 text-[12.5px] text-ink-3">
                Sin pagos todavía. Se pueden combinar medios: efectivo y punto, dólares y bolívares.
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
                        className="flex items-center gap-1 rounded-[var(--radius-control)] bg-base/60 pr-1 text-sm"
                      >
                        {/* Toda la fila se toca para corregir: un monto o una
                            referencia mal tecleados no obligan a borrar y repetir. */}
                        <button
                          type="button"
                          onClick={() => setEditando(p.uid)}
                          aria-label={`Corregir el pago de ${p.medio.label}, ${formatMoneyVE(toMajor(p.amount), p.amount.currency)}`}
                          className="group flex min-h-12 min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] py-2 pl-3 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-brand"
                        >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon size={14} className="text-ink-3 shrink-0" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-ink">{p.medio.label}</span>
                              {p.medio.triggersIgtf && linea && (
                                <span className="tnum text-[11px] whitespace-nowrap text-ink-3">
                                  + IGTF {formatMoneyVE(toMajor(linea.igtf), linea.igtf.currency)}
                                </span>
                              )}
                            </span>
                            {p.datos && (
                              <span className="tnum block truncate text-[11.5px] text-ink-3">{resumenDatos(p.datos, terminales)}</span>
                            )}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <MoneyDisplay
                            value={toMajor(p.amount)}
                            currency={p.amount.currency}
                            size="md"
                          />
                          <Pencil size={13} className="text-ink-3 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                        </span>
                        </button>
                          <button
                            type="button"
                            onClick={() => setPagos((prev) => prev.filter((x) => x.uid !== p.uid))}
                            aria-label={`Quitar el pago de ${p.medio.label}`}
                            className="relative grid size-10 cursor-pointer place-content-center rounded text-ink-3 transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-state-crit-bg hover:text-state-crit"
                          >
                            <X size={15} aria-hidden="true" />
                          </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Los totales quedan CLAVADOS abajo */}
          <dl className="flex flex-col gap-1.5 border-t border-line bg-base/40 px-5 pt-2 pb-4 text-sm">
            {/* A quién se factura: un toque solo cuando el cliente lo pide (DEC-23). */}
            <div className="flex items-center justify-between gap-3 border-b border-line/60 pb-2">
              <dt className="text-ink-2">Factura a</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold text-ink">
                  {cliente.kind === "CONSUMIDOR_FINAL"
                    ? "Consumidor final"
                    : `${cliente.name} · ${documentoEnmascarado(cliente.document)}`}
                </span>
                <Button surface="tablet" variant="neutral" className="shrink-0 text-[13px]" onClick={() => setIdentificando(true)}>
                  {cliente.kind === "CONSUMIDOR_FINAL" ? "Identificar" : "Cambiar"}
                  <PistaTecla tecla="I" />
                </Button>
              </dd>
            </div>
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
                <dt className="text-ink-2">
                  IGTF {igtfBasisPoints / 100}%
                  <span className="ml-1.5 text-ink-3">solo sobre lo pagado en divisas</span>
                </dt>
                <dd>
                  <MoneyDisplay value={toMajor(igtfTotal)} currency="USD" size="sm" tone="muted" />
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
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                El IGTF grava el medio de pago, no la venta: solo lo pagado en divisas o cripto.
              </p>
            )}
          </dl>
        </section>

        {/* ═══════════════════════ cobrar ══════════════════════════════
            Estructura FIJA, pedida por el cliente: visor, medios, una franja de
            alto fijo según el medio, el teclado siempre a la vista y una fila de
            dos columnas con «Cobrar exacto» y «Cerrar cobro». Cambiar de medio o
            teclear no mueve nada de sitio, y no hay que abrir nada para teclear. */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card [&>*]:shrink-0 md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3 lg:row-span-1">
          {/* ── visor: lo que falta (o el vuelto) y lo que se está tecleando ── */}
          <div
            className={cn(
              "rounded-[var(--radius-control)] border px-3 py-2.5",
              "transition-colors duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
              cubierto ? "border-state-ok/40 bg-state-ok-bg/40" : "border-line-strong bg-base",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink uppercase">
                  <span
                    aria-hidden="true"
                    className={cn("size-2 rounded-full", cubierto ? "bg-state-ok" : "bg-brand")}
                  />
                  {!cubierto ? "Falta por cobrar" : sobra.amount > 0n ? "Vuelto a entregar" : "Cubierto"}
                </p>
                <MoneyDisplay
                  value={toMajor(!cubierto ? falta : sobra.amount > 0n ? sobra : aCobrar)}
                  currency="USD"
                  size="xl"
                  tone={cubierto ? "positive" : "default"}
                  className="mt-1 leading-none tracking-tight"
                />
              </div>
              {!cubierto && (
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                    Tecleado ({medioActivo.currency})
                  </p>
                  <p
                    aria-live="polite"
                    className={cn(
                      "tnum mt-1 leading-none font-bold",
                      tecleado.currency === "VES" ? "text-lg" : "text-2xl",
                      digitos === "" ? "text-ink-3" : "text-ink",
                    )}
                  >
                    {formatMoneyVE(toMajor(tecleado), tecleado.currency)}
                  </p>
                </div>
              )}
            </div>
            {/* Los bolívares en su propio renglón: una cifra de 8 dígitos no cabe al lado. */}
            {(cubierto ? sobraEnBs : faltaEnBs) && (
              <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-line/40 pt-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-ink-3 uppercase">
                  En bolívares{tasaTexto ? ` · ${tasaTexto}` : ""}
                </span>
                <span className="tnum text-lg font-bold text-ink-2">{cubierto ? sobraEnBs : faltaEnBs}</span>
              </p>
            )}
          </div>

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
                  title={
                    bloqueado
                      ? "Sin tasa del día no se puede cobrar en esta moneda"
                      : `${m.label}${TECLA_MEDIO[m.code] ? ` (tecla ${TECLA_MEDIO[m.code]})` : ""}`
                  }
                  className={cn(
                    "flex h-14 cursor-pointer flex-col items-start justify-center overflow-hidden rounded-[var(--radius-control)] border px-1.5 text-left",
                    "transition-all duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "disabled:cursor-not-allowed disabled:opacity-35",
                    activo
                      ? "border-brand bg-brand/12 text-ink ring-1 ring-brand/30"
                      : "border-line bg-base text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  {/* Icono junto al nombre; debajo, moneda e IGTF. La letra del
                      atajo va en el `title` y en la chuleta: en el botón le
                      quitaba sitio al nombre («Punto dé…»). */}
                  <span className="flex w-full min-w-0 items-center gap-1">
                    <Icon size={12} className={cn("shrink-0", activo ? "text-brand" : "text-ink-3")} aria-hidden="true" />
                    <span className="truncate text-[12px] leading-tight font-bold">{m.label}</span>
                  </span>
                  <div className="mt-0.5 flex w-full items-center justify-between gap-1 text-[10px] whitespace-nowrap">
                    <span className={cn(m.currency === "VES" ? "font-semibold text-ink-2" : "text-ink-3")}>{m.currency}</span>
                    {/* El IGTF solo existe en divisas: en bolívares no se dice
                        nada, en vez de un «0% IGTF» que hay que leer para nada. */}
                    {m.triggersIgtf && (
                      <span className="shrink-0 rounded border border-line-strong px-1 font-semibold text-ink-2">
                        +{igtfBasisPoints / 100}% IGTF
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── franja del medio: SIEMPRE 56 px, ni uno más ── */}
          <div className="h-14 overflow-hidden">
            {cubierto && sobra.amount > 0n ? (
              // El excedente exige una decisión: no se cierra solo (§5.6).
              <div role="radiogroup" aria-label="Destino del vuelto" className="grid grid-cols-3 gap-1.5">
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
                    role="radio"
                    aria-checked={destinoVuelto === k}
                    onClick={() => setDestinoVuelto(k)}
                    className={cn(
                      "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border text-[12px]",
                      "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                      destinoVuelto === k ? "border-brand bg-brand/15 font-semibold text-brand" : "border-line text-ink-2 hover:text-ink",
                    )}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            ) : cubierto ? (
              <p className="flex min-h-14 items-center justify-center rounded-[var(--radius-control)] border border-state-ok/30 text-[13px] text-state-ok">
                Lo cobrado cuadra con la cuenta: cierra el cobro.
              </p>
            ) : medioActivo.code === "EFECTIVO_USD" ? (
              <div role="group" aria-label="Billetes recibidos" className="grid grid-cols-6 gap-1.5">
                {BILLETES_USD.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => agregarBilleteRapido(b)}
                    aria-label={`Sumar un billete de $ ${b}`}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-line bg-base",
                      "tnum text-[14px] font-bold text-ink transition-colors",
                      "hover:border-brand hover:bg-brand/15 hover:text-brand active:scale-95",
                    )}
                  >
                    ${b}
                  </button>
                ))}
              </div>
            ) : medioActivo.code === "PAGO_MOVIL" ? (
              // Compacto: sin icono (el medio ya está elegido arriba), el banco por
              // su nombre y el teléfono sin puntos. «Copiar» es solo el icono;
              // el código del banco va en lo que se copia.
              <div
                aria-label="Datos de Pago Móvil del local"
                className="flex h-14 items-center gap-1 rounded-[var(--radius-control)] border border-brand/30 pl-2.5 text-[11.5px]"
              >
                <dl className="grid min-w-0 flex-1 grid-flow-col grid-cols-[auto_auto_auto] grid-rows-2 justify-between gap-x-2">
                  <dt className="text-[9.5px] text-ink-3 uppercase">Banco</dt>
                  <dd className="truncate font-bold text-ink">Banesco</dd>
                  <dt className="text-[9.5px] text-ink-3 uppercase">Teléfono</dt>
                  <dd className="tnum truncate font-bold text-ink">0414-2345678</dd>
                  <dt className="text-[9.5px] text-ink-3 uppercase">RIF</dt>
                  <dd className="tnum truncate font-bold text-ink">J-40123456-7</dd>
                </dl>
                <BotonCopiar copiado={copiado} onCopiar={() => copiarTexto("Banesco (0134) - 0414-2345678 - J-40123456-7")} que="los datos de Pago Móvil" />
              </div>
            ) : medioActivo.code === "ZELLE" ? (
              <div className="flex h-14 items-center gap-1 rounded-[var(--radius-control)] border border-line pl-2.5 text-[11.5px]">
                <Zap size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[9.5px] text-ink-3 uppercase">Zelle · Parque Infantil L2 C.A.</span>
                  <span className="block truncate font-bold text-ink">pagos@parquel2.com</span>
                </div>
                <BotonCopiar copiado={copiado} onCopiar={() => copiarTexto("pagos@parquel2.com")} que="el correo de Zelle" />
              </div>
            ) : (
              <p className="flex h-14 items-center rounded-[var(--radius-control)] border border-dashed border-line px-3 text-[12px] leading-snug text-ink-3">
                {INDICACION_MEDIO[medioActivo.code] ?? (esEfectivo ? "Teclea lo recibido y pulsa «Añadir»." : "Teclea lo recibido y pulsa «Añadir», o cobra el monto exacto.")}
              </p>
            )}
          </div>

          {/* ── el teclado, siempre en su sitio ── */}
          <NumericKeypad
            value={monto}
            onChange={setMonto}
            maxLength={9}
            // Filas de 56 px: el objetivo de POS de §8.4.
            surface="tablet"
            disabled={cubierto}
            onSubmit={agregarPago}
            submitLabel="Añadir"
          />

          {faltaTasa && (
            <p role="alert" className="text-[12px] text-state-crit">
              Hay un pago en otra moneda sin tasa congelada. No se puede cobrar (ADR-005).
            </p>
          )}
          {cubierto && destinoVuelto === "CAJA" && sobra.amount > maxRetained.amount && (
            <p role="alert" className="text-[11.5px] text-state-crit">
              Por encima del umbral ({formatMoneyVE(toMajor(maxRetained), "USD")}) no se puede dejar en caja: hay que dar
              vuelto o marcarlo como propina.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit"
            >
              {error}
            </p>
          )}

          {/* ── una fila: cobrar exacto · cerrar cobro. En efectivo, solo cerrar,
              a todo el ancho: la fila no cambia de alto ni de sitio. ── */}
          <div className="mt-auto grid grid-cols-2 gap-2">
            {!esEfectivo && (
            <button
              type="button"
              onClick={cobrarMontoExacto}
              disabled={cubierto || !montoExacto}
              className={cn(
                "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border px-2 leading-tight",
                "border-brand/40 bg-brand/10 text-ink transition-colors duration-[var(--dur-rapida)] hover:border-brand hover:bg-brand/20",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-2 disabled:text-ink-3",
              )}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-bold">
                <Zap size={14} aria-hidden="true" className="text-brand" />
                Cobrar exacto
                <PistaTecla tecla="+" />
              </span>
              <span className="tnum text-[12px] font-semibold text-ink-2">
                {montoExacto && !cubierto ? formatMoneyVE(toMajor(montoExacto), medioActivo.currency) : "—"}
              </span>
            </button>
            )}
            <Button
              surface="pos"
              variant="primary"
              disabled={!puedeCobrar}
              onClick={cobrar}
              className={cn(
                "flex min-h-14 flex-col gap-0.5 px-2 leading-tight",
                esEfectivo && "col-span-2",
                puedeCobrar && "bg-state-ok text-on-brand hover:bg-state-ok/90",
              )}
            >
              <span className="flex items-center gap-1.5 text-[14px] font-bold">
                {puedeCobrar && <CircleCheckBig size={15} aria-hidden="true" />}
                Cerrar cobro
                <PistaTecla tecla="Ctrl ⏎" />
              </span>
              <span className="tnum text-[12px] font-semibold opacity-80">
                {puedeCobrar ? formatMoneyVE(toMajor(aCobrar), "USD") : `Falta ${formatMoneyVE(toMajor(falta), "USD")}`}
              </span>
            </Button>
          </div>
        </aside>

        <ClienteFacturaDialog
          abierto={identificando}
          actual={cliente}
          nombrePropuesto={esVentaDirecta(cuenta) ? "" : cuenta.family}
          onConfirmar={(c) => {
            setCliente(c);
            setIdentificando(false);
          }}
          onCerrar={() => setIdentificando(false)}
        />

        <DatosPagoDialog
          tipo={pendienteDeDatos?.medio.datos ?? null}
          monto={pendienteDeDatos ? `${pendienteDeDatos.medio.label} · ${formatMoneyVE(toMajor(pendienteDeDatos.amount), pendienteDeDatos.amount.currency)}` : ""}
          terminales={terminales}
          recordados={recordados}
          referenciasUsadas={pagos.flatMap((p) => (p.datos ? [claveDeReferencia(p.datos)] : []))}
          onConfirmar={confirmarDatos}
          onCancelar={() => setPendienteDeDatos(null)}
        />

        {/* Corregir un pago: el mismo formulario, prellenado, con su monto. Una
            referencia no choca consigo misma, solo con los demás pagos. */}
        <DatosPagoDialog
          tipo={pagoEditado ? (pagoEditado.medio.datos ?? "SIN_DATOS") : null}
          clave={pagoEditado?.uid ?? ""}
          monto={pagoEditado ? pagoEditado.medio.label : ""}
          edicion={
            pagoEditado
              ? {
                  monto: toMajor(pagoEditado.amount).replace(".", ","),
                  moneda: pagoEditado.amount.currency === "VES" ? "Bs." : pagoEditado.amount.currency,
                  ...(pagoEditado.datos ? { datos: pagoEditado.datos } : {}),
                }
              : null
          }
          terminales={terminales}
          recordados={recordados}
          referenciasUsadas={pagos.flatMap((p) => (p.datos && p.uid !== editando ? [claveDeReferencia(p.datos)] : []))}
          onConfirmar={confirmarEdicion}
          onCancelar={() => setEditando(null)}
        />
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
  pulseras,
  ...cobro
}: Omit<CobroProps, "lines" | "cuenta" | "onCobrado"> & {
  cuentaInicial: string | null;
  volver: string | null;
  /** Código de pulsera → estancia, de la instantánea del servidor. */
  pulseras: Readonly<Record<string, string>>;
}) {
  const { cuentas, guardar, descartar, cargado } = useCuentas();
  const sim = useSimulacion();
  const router = useRouter();
  const porCobrar = useMemo(() => ordenarCola(cuentas.filter((c) => c.status === "POR_COBRAR")), [cuentas]);
  const [elegida, setElegida] = useState<string | null>(cuentaInicial);
  const actual = porCobrar.find((c) => c.id === elegida) ?? porCobrar[0] ?? null;
  const lineas = useMemo(() => (actual ? lineasParaCobrar(actual) : []), [actual]);
  const origen = volver !== null ? (ORIGEN[volver] ?? null) : null;
  /** Venta directa en curso, antes de elegir el primer producto. */
  const [ventaNueva, setVentaNueva] = useState(false);
  const aBolivares = cobro.rate ? (cobro.rate.from === "USD" ? cobro.rate : invertRate(cobro.rate)) : null;

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroCola>("TODAS");
  const [buscando, setBuscando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const visibles = useMemo(() => filtrarCola(porCobrar, busqueda, filtro), [porCobrar, busqueda, filtro]);

  // El último cobro sale del registro de ventas: sobrevive a una recarga y
  // «Ventas» ve lo mismo.
  const { ventas, registrar, anotarImpresion } = useVentas();
  // Un cobro anulado ya no es «el último cobro»: su recibo no vale.
  const ultimaVenta = ventas.find((v) => !v.voided) ?? null;
  const [viendoRecibo, setViendoRecibo] = useState(false);
  const operadorCaja = useOperador();
  const [viendoAtajos, setViendoAtajos] = useState(false);

  /* ── lo que llega a la cola ──────────────────────────────────────────
     Una cuenta que aparece mientras la caja está abierta destella y se avisa.
     Lo que había al abrir no es «nuevo», ni lo que crea la propia caja (una
     venta directa): de eso ya sabe quien la creó. */
  const conocidas = useRef<Set<string> | null>(null);
  const creadasAqui = useRef(new Set<string>());
  const [recientes, setRecientes] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    // Hasta que el proveedor carga lo guardado, la cola aún no es la real.
    if (!cargado) return;
    const ids = porCobrar.map((c) => c.id);
    if (conocidas.current === null) {
      conocidas.current = new Set(ids);
      return;
    }
    const nuevas = porCobrar.filter((c) => !conocidas.current!.has(c.id) && !creadasAqui.current.has(c.id));
    for (const id of ids) conocidas.current.add(id);
    if (nuevas.length === 0) return;
    setRecientes((prev) => new Set([...prev, ...nuevas.map((c) => c.id)]));
    avisar.info(
      nuevas.length === 1
        ? `Llegó a la cola: ${numeroDeOrden(nuevas[0]!)} · ${esVentaDirecta(nuevas[0]!) ? "mostrador" : nuevas[0]!.family}`
        : `Llegaron ${nuevas.length} cuentas a la cola`,
    );
    // Sin limpieza a propósito: si la cola cambia antes, el destello igual se apaga.
    window.setTimeout(() => {
      setRecientes((prev) => new Set([...prev].filter((x) => !nuevas.some((c) => c.id === x))));
    }, 2600);
  }, [porCobrar, cargado]);

  function elegir(id: string) {
    setVentaNueva(false);
    setElegida(id);
  }

  /**
   * Pasar una pulsera abre la cuenta de ese niño. La pulsera se busca en la
   * instantánea del servidor y en lo que está pasando ahora en el local.
   */
  function alEscanear(codigo: string) {
    const sesion = pulseras[codigo] ?? sim.estado.sesiones.find((s) => s.wristbandCode === codigo)?.id ?? null;
    const cuenta = sesion ? cuentas.find((c) => c.sessionIds.includes(sesion)) : undefined;
    if (!cuenta) {
      avisar.error(`La pulsera ${codigo} no tiene cuenta en caja`, {
        detalle: "Búscala por el nombre de la familia o el número de orden.",
      });
      return;
    }
    if (cuenta.status !== "POR_COBRAR") {
      avisar.info(`${cuenta.family}: ${cuenta.status === "COBRADA" ? "la cuenta ya está cobrada" : "la cuenta sigue abierta"}`, {
        detalle: cuenta.status === "COBRADA" ? `Orden ${numeroDeOrden(cuenta)}` : "Pasa a caja cuando salgan los niños.",
      });
      return;
    }
    setBusqueda("");
    setFiltro("TODAS");
    elegir(cuenta.id);
  }

  // Atajos de la cola (atajos.ts). Los del cobro viven en CobroCuenta.
  useAtajos((t) => {
    if (t.ctrl) return false;
    if (t.key === "ArrowUp" || t.key === "ArrowDown") {
      if (visibles.length === 0) return false;
      const i = visibles.findIndex((c) => c.id === actual?.id);
      const siguiente = t.key === "ArrowDown" ? Math.min(visibles.length - 1, i + 1) : Math.max(0, i - 1);
      elegir(visibles[i < 0 ? 0 : siguiente]!.id);
      return true;
    }
    if (t.key === "/") {
      // Si el buscador ya está a la vista (cola larga), se enfoca aquí; si no,
      // lo enfoca la cola al mostrarlo.
      setBuscando(true);
      buscadorRef.current?.focus();
      return true;
    }
    if (t.key === "?") {
      setViendoAtajos(true);
      return true;
    }
    const letra = t.key.toUpperCase();
    if (letra === "N") {
      setVentaNueva(true);
      return true;
    }
    if (letra === "R" && ultimaVenta) {
      setViendoRecibo(true);
      return true;
    }
    return false;
  });

  function alCobrar(cuenta: FamilyAccountDto, r: Cobrado) {
    guardar(marcarCobrada(cuenta));
    setElegida(null);
    registrar({
      id: `v-${globalThis.crypto.randomUUID()}`,
      ...(cuenta.orderNumber ? { orderNumber: cuenta.orderNumber } : {}),
      accountId: cuenta.id,
      closedAt: new Date().toISOString(),
      cashier: operadorCaja ? { id: operadorCaja.id, name: operadorCaja.nombre } : null,
      total: { minor: String(r.totalDinero.amount), currency: r.totalDinero.currency },
      methods: [...r.medios],
      payments: [...r.pagosVenta],
      lineIds: [...r.lineIds],
      recibo: r.recibo,
      prints: [],
    });
    avisar.ok(`Orden ${numeroDeOrden(cuenta)} cobrada: ${formatMoneyVE(r.total, "USD")}`, {
      detalle: [
        r.cliente.kind === "CONSUMIDOR_FINAL" ? "Factura a consumidor final" : `Factura a ${r.cliente.name}`,
        r.vuelto !== "0.00" ? `vuelto entregado: ${formatMoneyVE(r.vuelto, "USD")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      // Si se vino de otra pantalla, lo urgente es volver; si no, el recibo.
      accion: origen
        ? { texto: `Volver a ${origen.nombre}`, alPulsar: () => router.push(origen.ruta) }
        : { texto: "Ver recibo", alPulsar: () => setViendoRecibo(true) },
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
    const id = `c-dir-${globalThis.crypto.randomUUID().slice(0, 6)}`;
    const nueva: FamilyAccountDto = FamilyAccountSchema.parse({
      id,
      family: "Mostrador",
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
    creadasAqui.current.add(nueva.id);
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
        avisar.info(`Orden ${numeroDeOrden(actual)} descartada: no quedaba nada por cobrar`);
      }
      return;
    }
    guardar(FamilyAccountSchema.parse({ ...actual, lines: lineas, status: "POR_COBRAR" }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sin cabecera visible: lo que decía («2 por cobrar · mostrador») ya está en
          la cola. El título sigue para los lectores de pantalla. */}
      <h1 className="sr-only">Caja</h1>
      <Container
        as="main"
        ancho="muro"
        className={cn(
          "grid flex-1 gap-4 py-4",
          // Desde lg la caja se reparte el alto de la ventana y cada columna
          // se desplaza por dentro (§8.8). Por debajo, flujo normal.
          // En tablet vertical, dos columnas: la cola sobre la cuenta y el
          // cobro al lado, a todo el alto. En escritorio, tres.
          "md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]",
          "lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)_clamp(352px,26vw,400px)]",
        )}
      >
        <ColaCuentas
          cuentas={visibles}
          total={porCobrar.length}
          actual={actual?.id ?? null}
          onElegir={elegir}
          onNuevaVentaDirecta={onNuevaVentaDirecta}
          ventaNueva={ventaNueva}
          puntoDeCobro={cobro.puntoDeCobro}
          recientes={recientes}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          filtro={filtro}
          onFiltro={setFiltro}
          buscando={buscando}
          onBuscando={setBuscando}
          buscadorRef={buscadorRef}
          onEscanear={alEscanear}
          ultimoCobro={ultimaVenta ? { orden: ultimaVenta.recibo.orden, total: ultimaVenta.recibo.total } : null}
          onVerRecibo={() => setViendoRecibo(true)}
          onVerAtajos={() => setViendoAtajos(true)}
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
      <ReciboDialog
        recibo={viendoRecibo && ultimaVenta ? ultimaVenta.recibo : null}
        copia={ultimaVenta ? ultimaVenta.prints.length > 0 : false}
        onImprimir={() =>
          ultimaVenta &&
          anotarImpresion(ultimaVenta.id, {
            at: new Date().toISOString(),
            by: operadorCaja ? { id: operadorCaja.id, name: operadorCaja.nombre } : null,
          })
        }
        onCerrar={() => setViendoRecibo(false)}
      />
      <AtajosDialog abierto={viendoAtajos} onCerrar={() => setViendoAtajos(false)} />
    </div>
  );
}

/**
 * La carta de mostrador: una rejilla táctil por categorías. La usan la venta
 * directa y «Añadir productos» de una cuenta abierta, así que vive una vez.
 */
/** Qué hacer con los medios que no traen datos que enseñar al cliente. */
const INDICACION_MEDIO: Readonly<Record<string, string>> = {
  EFECTIVO_VES: "Cuenta los bolívares, teclea lo recibido y pulsa «Añadir».",
  PDV_DEBITO: "Pasa la tarjeta por el monto exacto y confírmalo con «Cobrar exacto».",
  USDT: "Confirma la transferencia en la billetera antes de añadir el pago.",
};

/**
 * «Copiar» para los datos que el cliente teclea en su teléfono. Solo el icono,
 * con su nombre accesible y un `title`; al copiar pasa a un check verde y lo
 * anuncia a los lectores de pantalla.
 */
function BotonCopiar({ copiado, onCopiar, que }: { copiado: boolean; onCopiar: () => void; que: string }) {
  return (
    <button
      type="button"
      onClick={onCopiar}
      aria-label={copiado ? `Copiados ${que}` : `Copiar ${que}`}
      title={copiado ? "Copiado" : "Copiar"}
      className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-2 transition-colors hover:bg-surface-2 hover:text-brand"
    >
      {copiado ? <Check size={16} className="text-state-ok" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span aria-live="polite" className="sr-only">
        {copiado ? "Copiado" : ""}
      </span>
    </button>
  );
}

/** Columnas de la factura: cantidad, concepto, precio unitario e importe. */
const COLUMNAS = "grid grid-cols-[2.25rem_minmax(0,1fr)_5.25rem_5.75rem] items-baseline gap-x-3";

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
