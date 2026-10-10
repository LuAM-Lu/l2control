"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  Banknote,
  Check,
  CircleCheckBig,
  CircleDollarSign,
  ClipboardList,
  Coins,
  Copy,
  CreditCard,
  HandCoins,
  IdCard,
  Pencil,
  PackageX,
  PiggyBank,
  Printer,
  Search,
  ShoppingBag,
  Smartphone,
  TriangleAlert,
  UserX,
  Users,
  X,
  Zap,
  ChevronDown,
} from "lucide-react";
import {
  type CurrencyCode,
  type FrozenRate,
  type Money,
  add,
  allocate,
  convert,
  fromMajor,
  invertRate,
  money,
  multiply,
  sameRate,
  toMajor,
  zero,
} from "@l2/domain-money";
import {
  computeDocument,
  computeIgtf,
  igtfAt,
  ivaRulesOf,
  missingTaxesAt,
  pagoQueCubreConIgtf,
  taxTimeline,
  type DocumentLine,
  type TaxRule,
} from "@l2/domain-tax";
import {
  closeSettlement,
  computeBalance,
  documentDiscountsOf,
  type CategoryOf,
  type ChangeDisposition,
  type Tender,
} from "@l2/domain-cash";
import {
  Button,
  Container,
  Dialog,
  Marquesina,
  MoneyDisplay,
  NumericKeypad,
  Stepper,
  avisar,
  cn,
  formatMoneyVE,
} from "@l2/ui";
import { useMedios, useMediosActivos } from "./MediosProvider.tsx";
import { nombreBanco } from "./bancos.ts";
import type { MedioPago } from "./medios.ts";
import { BILLETES_USD } from "./billetes.ts";
import { categoriesOf, nameKey } from "@l2/domain-inventory";
import { disponible, productosALaVenta, type ProductoALaVenta } from "../inventario/catalogo.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  FamilyAccountSchema,
  CONSUMIDOR_FINAL,
  type AccountLineDto,
  type CatalogoDto,
  type ClienteFacturaDto,
  type CortesiaDto,
  type DeudaDto,
  type DatosDePagoDto,
  type DescuentosDeCuentaDto,
  type FamilyAccountDto,
  type ImpuestosDto,
  type TurnoDto,
  type Rechazo,
  type VentaCerradaDto,
  type PosTerminalDto,
  type BorradorDeCobroDto,
  type BorradorGuardadoDto,
} from "@l2/contracts";
import { frozenRateOf } from "@l2/domain-rates";
import { descartarBorrador, guardarBorrador, leerBorrador } from "./borrador.acciones";
import {
  DatosPagoDialog,
  claveDeReferencia,
  resumenDatos,
  type Recordados,
} from "./DatosPagoDialog.tsx";
import {
  ClienteFacturaDialog,
  documentoEnmascarado,
} from "./ClienteFacturaDialog.tsx";
import { BuscadorDeClientes } from "../clientes/BuscadorDeClientes.tsx";
import { TECLA_MEDIO, useAtajos } from "./atajos.ts";
import { cambiarVistaDePrecios } from "./precios.acciones";
import { AtajosDialog, PistaTecla } from "./AtajosDialog.tsx";
import { EntradaDesdeCaja } from "./EntradaDesdeCaja.tsx";
import { VentaSinCobrar } from "./VentaSinCobrar.tsx";
import { SalonDeLaCuenta, esDelSalon, nombreDelNino } from "./SalonDeLaCuenta.tsx";
import { usePlano } from "../mesas/PlanoProvider.tsx";
import { usePorLimpiar } from "../mesas/porLimpiar.ts";
import { AvisosDelSalon } from "../mesas/AvisosDelSalon.tsx";
import { asignarCliente } from "../clientes/clientes.acciones";
import { MarcarDeudaDialog } from "../deudas/MarcarDeudaDialog.tsx";
import { cobrarDeuda, leerDeudas } from "../deudas/deudas.acciones";
import {
  ColaCuentas,
  filtrarCola,
  ordenarCola,
  type FiltroCola,
} from "./ColaCuentas.tsx";
import { CortesiaDialog } from "./CortesiaDialog.tsx";
import { DescuentoDialog, type PedidoDeDescuento } from "./DescuentoDialog.tsx";
import { textoAlcance, textoValor } from "./descuentos.ts";
import { descuentosDeCuenta } from "../cuentas/cuentas.acciones";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { ReciboDialog } from "./ReciboDialog.tsx";
import { reciboDeVenta } from "./recibo.ts";
import { useVentas } from "./VentasProvider.tsx";
import { can } from "@l2/domain-identity";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import {
  esLineaDeMostrador,
  esVentaDirecta,
  nombreDeCuenta,
  dividirEn,
  lineasParaCobrar,
  ninosEnSalaDeLaCuenta,
  numeroDeOrden,
  puedeDescartarse,
  unirCuenta,
} from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useSala } from "../park/SalaProvider.tsx";
import { useHora, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useTasaVigente } from "./TasasProvider.tsx";
import { formatTasaVE } from "./tasa-format.ts";
import { useModoPapel } from "../papel/ModoPapel.tsx";

/** USDT → USD a la par (DEC-1: cuestión abierta con el contador). */
const PARIDAD_USDT: FrozenRate = {
  from: "USDT",
  to: "USD",
  numerator: 1n,
  denominator: 1n,
};

/** Lo que la caja sabe al cerrar un cobro: para el aviso. El recibo sale de la venta del servidor. */
type Cobrado = Readonly<{
  total: string;
  vuelto: string;
  cliente: ClienteFacturaDto;
  /** La venta que dejó el cobro en el servidor (B3-4): de ella sale el recibo. */
  venta: VentaCerradaDto;
  /** Se pidió el recibo y no salió (B3-8): por qué. El cobro quedó cerrado igual. */
  reciboNoImpreso?: string;
  /** La cuenta como la dejó el servidor al cobrar. */
  cuenta: FamilyAccountDto;
}>;

/** Sin configuración de medios no hay terminales (una sola referencia: no rehace el cobro). */
const SIN_TERMINALES: readonly PosTerminalDto[] = [];

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
  igtfBasisPoints,
  maxRetained,
  rate: rateVivo,
  tasaValor: tasaValorViva,
  tasaId: tasaIdViva,
  instanteFiscal,
  onAgregarProducto,
  onCambiarCantidad,
  onDividir,
  onCortesia,
  categoryOf,
  onDescuento,
  onQuitarDescuento,
  ocultoEnDosColumnas,
}: {
  lines: readonly DocumentLine[];
  /** La cuenta que se cobra: su familia y su modo encabezan el ticket. */
  cuenta: FamilyAccountDto;
  onCobrado: (r: Cobrado) => void;
  rules: readonly TaxRule[];
  igtfBasisPoints: number;
  maxRetained: Money;
  /**
   * La tasa VIGENTE, en vivo (B2-1c). El cobro la congela con su primer pago (ADR-005): ver
   * `tasaDelCobro`. `null` bloquea el cobro en Bs. La tasa se MUESTRA en la barra de estación
   * (§8.5); aquí solo se usa.
   */
  rate: FrozenRate | null;
  /**
   * La misma tasa tal como se capturó («229.05»), para ESCRIBIRLA: en la línea «En bolívares» y
   * en el recibo. No se reconstruye desde `rate`, que es una fracción reducida (229,05 = 4581/20)
   * y leerla como «algo/100» pintaba 45,81.
   */
  tasaValor: string | null;
  /** El identificador de la tasa vigente: el cobro cita el de la suya y el servidor lo comprueba. */
  tasaId: string | null;
  /** El instante con el que se eligen las alícuotas: el del servidor, que avanza con el reloj. */
  instanteFiscal: number;
  onAgregarProducto?: (producto: ProductoALaVenta) => void;
  /** Deja un ítem de mostrador en esa cantidad; 0 lo elimina. */
  onCambiarCantidad?: (item: ItemDeMostrador, cantidad: number) => void;
  /** Divide la cuenta en partes iguales, o la vuelve a unir con 1 (F6-12). */
  onDividir?: (partes: number) => void;
  /** Aplica o quita una cortesía en una línea de la cuenta (F6-14). */
  /**
   * Regala una línea o se la quita (F6-14), en el servidor y con su autorización. Devuelve el rechazo,
   * si lo hay, para que el diálogo lo enseñe.
   */
  onCortesia?: (linea: AccountLineDto, motivo: CortesiaDto["motivo"] | null, detalle: string | undefined, autorizacion: unknown) => Promise<Rechazo | null>;
  /** La categoría de cada producto del catálogo: el descuento «por categorías» la necesita (B3-6). */
  categoryOf: CategoryOf;
  /** Pone un descuento a la cuenta en el servidor, con su autorización (B3-6). Devuelve el rechazo, si lo hay. */
  onDescuento?: (pedido: PedidoDeDescuento, autorizacion: unknown) => Promise<Rechazo | null>;
  /** Le quita el descuento a la cuenta: vuelve a deberse entera. */
  onQuitarDescuento?: () => Promise<Rechazo | null>;
  /** Con la cola plegada (dos columnas), el ticket cede su sitio a la cola. El cobro no se oculta nunca. */
  ocultoEnDosColumnas?: boolean;
}) {
  const FUNCIONAL = "USD" as const;

  const mediosDisponibles = useMediosActivos();
  const { config: mediosConfig } = useMedios();
  const hora = useHora();
  // Sin configuración (nadie en sesión o el servidor no la leyó), nada: la caja no llega a cobrar.
  const terminales = mediosConfig?.terminales ?? SIN_TERMINALES;
  const pagoMovilLocal = mediosConfig?.pagoMovil;
  const zelleLocal = mediosConfig?.zelle;

  const [pagos, setPagos] = useState<
    { uid: string; medio: MedioPago; amount: Money; datos?: DatosDePagoDto }[]
  >([]);
  /** Pago esperando sus datos: no entra al cobro hasta confirmarlos (F4-04). */
  const [pendienteDeDatos, setPendienteDeDatos] = useState<{
    medio: MedioPago;
    amount: Money;
  } | null>(null);
  /**
   * La tasa de ESTE cobro (ADR-005, ADR-019 §7). Mientras no hay ningún pago sigue a la vigente;
   * con el primero se congela, y el cobro en curso la conserva aunque la vigente cambie. Si
   * cambia, se avisa y se ofrece pasar a la nueva: los bolívares se vuelven a convertir con ella,
   * nunca en silencio. Si deja de haber vigente, no se cobra en bolívares (fail-closed); el
   * servidor rechazará además una tasa que ya no rige (B3-3).
   */
  const [tasaDelCobro, setTasaDelCobro] = useState<{ rate: FrozenRate; valor: string; id: string } | null>(null);
  /** La vigente que la cajera decidió no usar en este cobro («Mantener»). Si cambia otra vez, se vuelve a avisar. */
  const [tasaMantenida, setTasaMantenida] = useState<string | null>(null);
  const cobroEnCurso = pagos.length > 0 || pendienteDeDatos !== null;
  useEffect(() => {
    if (!cobroEnCurso) {
      setTasaDelCobro(null);
      setTasaMantenida(null);
    } else setTasaDelCobro((t) => t ?? (rateVivo && tasaValorViva && tasaIdViva ? { rate: rateVivo, valor: tasaValorViva, id: tasaIdViva } : null));
  }, [cobroEnCurso, rateVivo, tasaValorViva, tasaIdViva]);
  const congelada = cobroEnCurso && rateVivo !== null ? tasaDelCobro : null;
  const rate = rateVivo === null ? null : (congelada?.rate ?? rateVivo);
  const tasaValor = rateVivo === null ? null : (congelada?.valor ?? tasaValorViva);
  const tasaId = rateVivo === null ? null : (congelada?.id ?? tasaIdViva);
  /**
   * La vigente ya no es la de este cobro y nadie ha decidido: se avisa en la franja del medio,
   * que mide siempre lo mismo, para que el teclado y «Cobrar» no se muevan.
   */
  const tasaCambio =
    congelada !== null &&
    rateVivo !== null &&
    tasaValorViva !== null &&
    tasaIdViva !== null &&
    !sameRate(rateVivo, congelada.rate) &&
    tasaValorViva !== tasaMantenida;

  /**
   * A nombre de quién sale la factura (T-19, M-34; antes DEC-23, consumidor final salvo que se pidiera): la cuenta que
   * nació con su cliente (B6-9) ya viene a su nombre. La venta del mostrador sin cliente lo pide: se cobra a alguien.
   */
  const [cliente, setCliente] = useState<ClienteFacturaDto>(() =>
    cuenta.cliente ? { kind: "IDENTIFICADO", name: cuenta.cliente.nombre, document: cuenta.cliente.cedula } : CONSUMIDOR_FINAL,
  );
  /** Una venta del mostrador sin su cliente no se cobra: el servidor tampoco la deja (FALTA_EL_CLIENTE). */
  const faltaCliente = cuenta.kind === "MOSTRADOR" && !cuenta.cliente && cliente.kind !== "IDENTIFICADO";
  const [identificando, setIdentificando] = useState(false);
  /** «Se fue sin pagar» (B3-11): el diálogo que deja la cuenta en deuda a nombre de su cliente. */
  const [seFue, setSeFue] = useState(false);
  const { adoptar: adoptarCuenta } = useCuentas();
  /** Último banco, terminal y red: la siguiente vez ya vienen puestos. */
  const [recordados, setRecordados] = useState<Recordados>({});
  // La lista nunca está vacía aquí: `CajaScreen` no pinta el cobro sin medios.
  const [medioActivo, setMedioActivo] = useState<MedioPago>(
    mediosDisponibles[0]!,
  );

  /**
   * La columna de cobro cabe en 1366×768 con dos filas de medios de 56 px (§8.4). Con más de seis
   * (el local los añade sin desplegar, F4-02), la sexta casilla es «Otros medios»: abre la lista
   * con los que no caben, y enseña el elegido cuando es uno de ellos.
   */
  const CASILLAS_DE_MEDIOS = 6;
  const hayOtros = mediosDisponibles.length > CASILLAS_DE_MEDIOS;
  const fijos = hayOtros ? mediosDisponibles.slice(0, CASILLAS_DE_MEDIOS - 1) : mediosDisponibles;
  const otros = hayOtros ? mediosDisponibles.slice(CASILLAS_DE_MEDIOS - 1) : [];
  const otroElegido = otros.find((m) => m.code === medioActivo.code);
  const [eligiendoOtro, setEligiendoOtro] = useState(false);

  /**
   * Si apagan desde el panel el medio que estaba elegido, la caja pasa al
   * primero que quede. Sin esto se seguiría cobrando por un medio que el local
   * ya no ofrece.
   */
  useEffect(() => {
    if (!mediosDisponibles.some((m) => m.code === medioActivo.code)) {
      const primero = mediosDisponibles[0];
      if (primero) setMedioActivo(primero);
    }
  }, [mediosDisponibles, medioActivo.code]);
  // Con un descuento por medio de pago, la caja se pone en ese medio: toda la cuenta va por él (V-9).
  const medioDelDescuento = cuenta.descuento?.origen === "MEDIO" ? cuenta.descuento.medio : null;
  useEffect(() => {
    const m = medioDelDescuento ? mediosDisponibles.find((x) => x.code === medioDelDescuento) : undefined;
    if (m) setMedioActivo(m);
  }, [medioDelDescuento, mediosDisponibles]);
  const [monto, setMonto] = useState("");
  const [destinoVuelto, setDestinoVuelto] = useState<
    "VUELTO" | "PROPINA" | "CAJA"
  >("VUELTO");
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarCatalogo, setMostrarCatalogo] = useState(esVentaDirecta(cuenta));
  /** Fila de mostrador tocada: enseña su cantidad y «Eliminar». */
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  /** La línea seleccionada para dar o quitar cortesía. */
  const [lineaParaCortesia, setLineaParaCortesia] = useState<{
    linea: AccountLineDto;
    quitar: boolean;
  } | null>(null);
  /** El pago que se está corrigiendo. */
  const [editando, setEditando] = useState<string | null>(null);
  const pagoEditado = pagos.find((p) => p.uid === editando) ?? null;
  const actor = useActorEnSesion();
  const permisoCortesia = actor ? can(actor, "cuenta.cortesia") : "DENEGADO";
  const permisoDescuento = actor ? can(actor, "cuenta.descuento") : "DENEGADO";
  const descuento = cuenta.descuento;

  /**
   * Los descuentos que el servidor ofrece a esta cuenta (B3-6), el mayor primero. Se vuelven a pedir
   * cuando la cuenta cambia y cuando administración cambia las reglas o marca una familia VIP.
   */
  const [ofrecidos, setOfrecidos] = useState<DescuentosDeCuentaDto | null>(null);
  const [viendoDescuento, setViendoDescuento] = useState(false);
  const [quitandoDescuento, setQuitandoDescuento] = useState(false);
  /** Lo que el pie de la cuenta tiene abierto debajo de su fila de botones (B3-10): las partes o el descuento puesto. */
  const [enElPie, setEnElPie] = useState<"dividir" | "descuento" | null>(null);
  const [releerOfrecidos, setReleerOfrecidos] = useState(0);
  useAlCambiar(["descuentos"], () => setReleerOfrecidos((n) => n + 1));
  const ofreceDescuentos = onDescuento !== undefined && permisoDescuento !== "DENEGADO" && cuenta.status === "POR_COBRAR";
  useEffect(() => {
    if (!ofreceDescuentos) {
      setOfrecidos(null);
      return;
    }
    let vivo = true;
    descuentosDeCuenta(cuenta.id)
      .then((r) => vivo && setOfrecidos(r.ok ? r.valor : null))
      .catch(() => vivo && setOfrecidos(null));
    return () => {
      vivo = false;
    };
  }, [ofreceDescuentos, cuenta.id, cuenta.version, releerOfrecidos]);

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

  // El descuento baja la base antes del IVA (§5.3), igual que lo calculará el servidor al cobrar.
  // Con los precios con IVA incluido (ajuste de la sucursal), el total es la suma de los precios.
  const { preciosConIva } = useSucursal().ajustes;
  const doc = useMemo(
    () => computeDocument({ lines, discounts: documentDiscountsOf(cuenta, categoryOf), rules, at: instanteFiscal, currency: FUNCIONAL, pricesIncludeTax: preciosConIva }),
    [lines, cuenta, categoryOf, rules, instanteFiscal, preciosConIva],
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
        rate:
          p.amount.currency === FUNCIONAL
            ? null
            : p.amount.currency === "USDT"
              ? PARIDAD_USDT
              : rate,
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

  /**
   * La parte que toca cobrar ahora (F6-12).
   *
   * El reparto sale del TOTAL del documento con la regla del mayor resto, así
   * la suma de las partes es exactamente el total: el céntimo que sobra se le
   * da a una parte, no se pierde ni se cobra dos veces. Sin dividir, la parte
   * es el total entero.
   */
  const partes = cuenta.split?.parts ?? 1;
  const parteActual = (cuenta.split?.paid ?? 0) + 1;
  const porParte =
    partes > 1 ? allocate(doc.total, partes)[parteActual - 1]! : doc.total;

  /** Lo que realmente hay que cobrar: la parte + el IGTF de los pagos hechos. */
  const aCobrar = add(porParte, igtfTotal);

  /**
   * Por qué no se puede dividir o descontar ahora, o `null` si se puede. Ya cobrada una parte, el reparto no cambia a
   * mitad de camino (alguien pagaría de más o de menos); el reparto y el descuento salen del total, así que no van
   * juntos (B3-6); y con pagos puestos, ninguno de los dos.
   */
  const bloqueoDividir =
    (cuenta.split?.paid ?? 0) > 0
      ? "Ya se cobró una parte: el reparto no cambia"
      : pagos.length > 0
        ? "Quita primero los pagos"
        : descuento
          ? "Quita el descuento para dividir"
          : null;
  const bloqueoDescuento = pagos.length > 0 ? "Quita primero los pagos" : partes > 1 ? "Une la cuenta para aplicar un descuento" : null;

  /* --------------------------------------------------------- balance */

  const balance = useMemo(() => {
    try {
      return computeBalance(aCobrar, tenders, FUNCIONAL);
    } catch {
      // Falta la tasa: se refleja como «nada entregado» y el aviso lo explica.
      return null;
    }
  }, [aCobrar, tenders]);

  const faltaTasa = tenders.some(
    (t) => t.amount.currency !== FUNCIONAL && !t.rate,
  );
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
    setPagos((prev) => [
      ...prev,
      { uid: globalThis.crypto.randomUUID(), medio, amount },
    ]);
    setMonto("");
  }

  function confirmarDatos(datos: DatosDePagoDto | null) {
    const p = pendienteDeDatos;
    if (!p || !datos) return;
    setPagos((prev) => [
      ...prev,
      {
        uid: globalThis.crypto.randomUUID(),
        medio: p.medio,
        amount: p.amount,
        datos,
      },
    ]);
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
  function confirmarEdicion(
    datos: DatosDePagoDto | null,
    montoNuevo: string | null,
  ) {
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
    setPagos((prev) =>
      prev.map((x) =>
        x.uid === p.uid ? { ...x, amount, ...(datos ? { datos } : {}) } : x,
      ),
    );
    setEditando(null);
  }

  function agregarPago() {
    setError(null);
    const digitos = monto.replace(/\D/g, "");
    const valor: Money = money(
      BigInt(digitos === "" ? "0" : digitos),
      medioActivo.currency,
    );
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

  const { cobrar: cobrarEnServidor } = useCuentas();
  // Cargando lo anotado en papel (B3-7): el cobro lleva su carga y la hora real del formulario.
  const modoPapel = useModoPapel();
  /**
   * «Imprimir recibo» (B3-8, P-5): cada cobro arranca con lo que diga la sucursal (de fábrica, imprimir) y la caja
   * lo cambia con un toque o con «*». Desde papel arranca apagado: el cliente ya se llevó su recibo.
   */
  const { imprimirRecibo: reciboDeFabrica } = useSucursal().ajustes;
  const [imprimirRecibo, setImprimirRecibo] = useState(reciboDeFabrica && !modoPapel);
  const [enviando, setEnviando] = useState(false);
  /**
   * B6-14: cobrar una mesa con niños en la sala deja su tiempo sin cerrar. La caja avisa «Dales salida antes» una vez por
   * cuenta; «Cobrar igual» sigue. Cargando desde papel no: la sala de ahora no es la de entonces.
   */
  const { sala: salaDelCobro } = useSala();
  const [ninosSinSalida, setNinosSinSalida] = useState<string[] | null>(null);
  const avisadosDeSalida = useRef<string | null>(null);

  /**
   * El cobro en curso, guardado en el servidor (B3-13, M-34): lo que se lleva escrito aguanta cambiar de cuenta o de
   * pestaña, recargar y un corte de luz. Al abrir la cuenta se lee; si es de esta persona se retoma solo, y si es de
   * otra se avisa y se elige retomarlo o descartarlo. Mientras se teclea se guarda un poco después de cada cambio, con
   * su versión: si otra caja lo cambió, se vuelve a leer. Desde papel no se guarda: esa carga tiene su propio flujo.
   */
  const yo = useActorEnSesion()?.id ?? null;
  const [borrador, setBorrador] = useState<{ listo: boolean; version: number | null; ajeno: BorradorGuardadoDto | null }>({
    listo: Boolean(modoPapel),
    version: null,
    ajeno: null,
  });
  const ultimoGuardado = useRef<string>("");
  const retomar = useCallback(
    (b: BorradorGuardadoDto) => {
      const faltan: string[] = [];
      const recuperados = b.borrador.pagos.flatMap((p) => {
        const medio = mediosDisponibles.find((m) => m.code === p.medio);
        if (!medio) {
          faltan.push(p.medio);
          return [];
        }
        return [{ uid: globalThis.crypto.randomUUID(), medio, amount: money(BigInt(p.amount.minor), p.amount.currency as CurrencyCode), ...(p.datos ? { datos: p.datos } : {}) }];
      });
      setTasaDelCobro(b.borrador.tasa ? { rate: frozenRateOf({ pair: "USD/VES", value: b.borrador.tasa.valor }), valor: b.borrador.tasa.valor, id: b.borrador.tasa.id } : null);
      setPagos(recuperados);
      setDestinoVuelto(b.borrador.destinoVuelto);
      setCliente(b.borrador.cliente);
      setImprimirRecibo(b.borrador.imprimirRecibo);
      if (faltan.length > 0) avisar.error("Un pago del cobro en curso ya no se puede usar", { detalle: "Su medio de pago se apagó: vuelve a cobrarlo con otro." });
    },
    [mediosDisponibles],
  );
  const leerElBorrador = useCallback(async () => {
    const r = await leerBorrador(cuenta.id).catch(() => null);
    if (!r?.ok) {
      setBorrador({ listo: true, version: null, ajeno: null });
      return;
    }
    const b = r.valor;
    if (b && b.porId === yo) {
      retomar(b);
      ultimoGuardado.current = JSON.stringify(b.borrador);
      setBorrador({ listo: true, version: b.version, ajeno: null });
    } else setBorrador({ listo: true, version: b?.version ?? null, ajeno: b });
  }, [cuenta.id, yo, retomar]);
  useEffect(() => {
    if (!modoPapel) void leerElBorrador();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuenta.id]);
  useEffect(() => {
    if (modoPapel || !borrador.listo || borrador.ajeno) return;
    const contenido: BorradorDeCobroDto = {
      pagos: pagos.map((p) => ({ medio: p.medio.code, amount: { minor: String(p.amount.amount), currency: p.amount.currency }, ...(p.datos ? { datos: p.datos } : {}) })),
      tasa: tasaDelCobro ? { id: tasaDelCobro.id, valor: tasaDelCobro.valor } : null,
      destinoVuelto,
      cliente,
      imprimirRecibo,
    };
    const huella = JSON.stringify(contenido);
    // Nada nuevo, o nada que guardar todavía.
    if (huella === ultimoGuardado.current || (pagos.length === 0 && borrador.version === null)) return;
    const t = window.setTimeout(() => {
      void guardarBorrador({ accountId: cuenta.id, version: borrador.version, borrador: contenido }).then((r) => {
        if (r.ok) {
          ultimoGuardado.current = huella;
          setBorrador((b) => ({ ...b, version: r.valor?.version ?? null }));
        } else if (r.motivo === "CONFLICTO") {
          avisar.info("Este cobro cambió en otra caja", { detalle: r.mensaje });
          void leerElBorrador();
        }
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [modoPapel, borrador.listo, borrador.ajeno, borrador.version, pagos, tasaDelCobro, destinoVuelto, cliente, imprimirRecibo, cuenta.id, leerElBorrador]);
  async function descartarAjeno() {
    const r = await descartarBorrador({ accountId: cuenta.id }).catch(() => null);
    if (!r?.ok) return avisar.error(r?.mensaje ?? "Sin conexión con el servidor: no se descartó.");
    ultimoGuardado.current = "";
    setBorrador({ listo: true, version: null, ajeno: null });
    avisar.info("Cobro en curso descartado");
  }
  /** La clave del intento en curso: un reintento de lo mismo (se cayó la red) no cobra dos veces. */
  const intento = useRef<{ huella: string; clave: string } | null>(null);

  /**
   * Cierra el cobro EN EL SERVIDOR (B3-3): él recalcula el total con el IVA y el IGTF del instante,
   * comprueba la tasa y lo asienta en el libro. Aquí se comprueba antes lo que ya se sabe (§5.6)
   * para decirlo sin ir y volver; lo que decide es su respuesta.
   */
  async function cobrar() {
    if (enviando) return;
    setError(null);
    if (!modoPapel && avisadosDeSalida.current !== cuenta.id) {
      const enSala = ninosEnSalaDeLaCuenta(cuenta, salaDelCobro?.sessions ?? []);
      if (enSala.length > 0) {
        setNinosSinSalida(enSala.map(nombreDelNino));
        return;
      }
    }
    if (medioDelDescuento && pagos.some((p) => p.medio.code !== medioDelDescuento)) {
      const nombre = mediosDisponibles.find((m) => m.code === medioDelDescuento)?.label ?? medioDelDescuento;
      setError(`El descuento «${descuento!.nombre}» exige cobrar toda la cuenta con ${nombre}: quita los otros pagos o el descuento.`);
      return;
    }
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
    let cambio: Money;
    try {
      cambio = closeSettlement({ due: aCobrar, tenders, dispositions, functional: FUNCIONAL, maxRetained }).changeOut;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el cobro");
      return;
    }

    const cuerpo = {
      accountId: cuenta.id,
      version: cuenta.version ?? 0,
      lineIds: lines.map((l) => l.id),
      total: { minor: String(aCobrar.amount), currency: FUNCIONAL },
      pagos: pagos.map((p) => ({
        method: p.medio.code,
        amount: { minor: String(p.amount.amount), currency: p.amount.currency },
        ...(p.datos ? { datos: p.datos } : {}),
      })),
      ...(pagos.some((p) => p.amount.currency === "VES") && tasaId ? { rateId: tasaId } : {}),
      destinoSobra: destinoVuelto === "CAJA" ? ("RESIDUO" as const) : destinoVuelto,
    };
    const huella = JSON.stringify({ ...cuerpo, cliente });
    if (intento.current?.huella !== huella) intento.current = { huella, clave: globalThis.crypto.randomUUID() };
    const clave = intento.current.clave;
    setEnviando(true);
    // El recibo va fuera de la huella: cambiar de idea sobre el papel no es otro cobro.
    const r = await cobrarEnServidor(
      { idempotencyKey: clave, ...cuerpo, ...(cliente.kind === "IDENTIFICADO" ? { cliente } : {}), imprimirRecibo },
      modoPapel?.desdePapel(),
    );
    setEnviando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    intento.current = null;
    // El siguiente cobro del papel trae su propia hora: la de este no se arrastra.
    modoPapel?.limpiarHora();
    onCobrado({
      total: toMajor(aCobrar),
      vuelto: toMajor(cambio),
      cliente,
      venta: r.valor.venta,
      cuenta: r.valor.cuenta,
      ...(r.valor.reciboNoImpreso ? { reciboNoImpreso: r.valor.reciboNoImpreso } : {}),
    });
    setPagos([]);
  }

  const puedeCobrar =
    balance !== null && falta.amount === 0n && pagos.length > 0 && !faltaCliente;

  /* --------------------------------------------------------- conversiones y atajos */

  const digitos = monto.replace(/\D/g, "");
  const tecleado = money(
    BigInt(digitos === "" ? "0" : digitos),
    medioActivo.currency,
  );
  const cubierto = balance !== null && falta.amount === 0n && pagos.length > 0;

  const aBolivares = rate
    ? rate.from === falta.currency
      ? rate
      : invertRate(rate)
    : null;
  const faltaEnBsMoney =
    aBolivares && aBolivares.from === falta.currency
      ? convert(falta, aBolivares)
      : null;
  const faltaEnBs = faltaEnBsMoney
    ? formatMoneyVE(toMajor(faltaEnBsMoney), "VES")
    : null;

  const aBolivaresParaSobra = rate
    ? rate.from === sobra.currency
      ? rate
      : invertRate(rate)
    : null;
  const sobraEnBsMoney =
    aBolivaresParaSobra &&
    aBolivaresParaSobra.from === sobra.currency &&
    sobra.amount > 0n
      ? convert(sobra, aBolivaresParaSobra)
      : null;
  const sobraEnBs = sobraEnBsMoney
    ? formatMoneyVE(toMajor(sobraEnBsMoney), "VES")
    : null;

  const tasaTexto = rate && tasaValor ? `${formatTasaVE(tasaValor)} Bs/$` : null;

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
      return pagoQueCubreConIgtf(
        money(falta.amount, medioActivo.currency),
        igtfBasisPoints,
      );
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
        return [
          ...prev.slice(0, -1),
          { ...ultimo, amount: add(ultimo.amount, billete) },
        ];
      }
      return [
        ...prev,
        {
          uid: globalThis.crypto.randomUUID(),
          medio: medioActivo,
          amount: billete,
        },
      ];
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
      if (t.key !== "Enter" || !puedeCobrar || enviando) return false;
      void cobrar();
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
    if (t.key === "*") {
      setImprimirRecibo((v) => !v);
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


  /** Un medio en la cuadrícula; `alPulsar` lo cambia por abrir «Otros medios». */
  const pintarMedio = (m: MedioPago, alPulsar?: () => void) => {
            const activo = m.code === medioActivo.code;
            const bloqueado = m.currency !== FUNCIONAL && !rate;
            const Icon = MEDIO_ICONS[m.code] ?? Banknote;
            return (
              <button
                key={m.code}
                type="button"
                role="radio"
                aria-checked={activo}
                aria-haspopup={alPulsar ? "dialog" : undefined}
                disabled={bloqueado}
                onClick={alPulsar ?? (() => setMedioActivo(m))}
                title={
                  bloqueado
                    ? "Sin tasa del día no se puede cobrar en esta moneda"
                    : `${m.label}${TECLA_MEDIO[m.code] ? ` (tecla ${TECLA_MEDIO[m.code]})` : ""}`
                }
                className={cn(
                  "relative flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[var(--radius-control)] border px-1.5 text-center",
                  "transition-all duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  "disabled:cursor-not-allowed disabled:opacity-35",
                  activo
                    ? "border-brand bg-brand/20 text-ink ring-1 ring-brand/30"
                    : "border-line bg-base text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {/* El icono arriba, el nombre debajo y, debajo, la moneda (T-15, P-10): el icono se reconoce antes de
                      leer, y el nombre tiene todo el ancho. La letra del atajo, en su esquina. */}
                <Icon size={18} className={cn("shrink-0", activo ? "text-brand" : "text-ink-3")} aria-hidden="true" />
                <span className="w-full truncate text-[12px] leading-tight font-bold">{m.label}</span>
                <span className="flex items-center gap-1 text-[10px] leading-none whitespace-nowrap">
                  <span className={cn(m.currency === "VES" ? "font-semibold text-ink-2" : "text-ink-3")}>{m.currency}</span>
                  {/* El IGTF solo existe en divisas: en bolívares no se dice nada. */}
                  {m.triggersIgtf && igtfBasisPoints > 0 && (
                    <span className="rounded border border-line-strong px-1 font-semibold text-ink-2">+{igtfBasisPoints / 100}% IGTF</span>
                  )}
                </span>
                {alPulsar && <ChevronDown size={12} className="absolute top-1 left-1 text-ink-3" aria-hidden="true" />}
                {TECLA_MEDIO[m.code] && (
                  <span className="absolute top-1 right-1 leading-none">
                    <PistaTecla tecla={TECLA_MEDIO[m.code]!} />
                  </span>
                )}
              </button>
            );
  };

  return (
    <>
      {/* ═══════════════════════ la cuenta ═══════════════════════════ */}
      <section
        data-recorrido="caja-cuenta"
        className={cn(
          "flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card @container/ticket",
          PLACEMENT_TICKET,
          ocultoEnDosColumnas && OCULTA_SI_PLEGADA,
        )}
      >
        {/* Un solo renglón: qué orden es, de quién, cómo paga y desde cuándo. */}
        <div className="flex items-center gap-3 border-b border-line py-2 pr-2 pl-5">
          <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="font-display tnum text-lg leading-none font-bold text-ink">
              {numeroDeOrden(cuenta)}
            </span>
            {/* Un nombre largo no se corta: va y vuelve (T-15). */}
            <Marquesina className="max-w-full text-[14px] font-semibold text-ink-2">{nombreDeCuenta(cuenta)}</Marquesina>
            <span className="text-[12px] text-ink-3">
              {esVentaDirecta(cuenta)
                ? "Mostrador"
                : cuenta.kind === "EVENTO"
                  ? "Cumpleaños"
                  : cuenta.mode === "PREPAGO"
                  ? "Prepago"
                  : "Cuenta abierta"}{" "}
              · {hora(Date.parse(cuenta.openedAt))}
            </span>
          </h2>
          {onAgregarProducto && (
            <button
              type="button"
              onClick={() => setMostrarCatalogo((prev) => !prev)}
              className={cn(
                "inline-flex min-h-14 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-semibold transition-all",
                mostrarCatalogo
                  ? "border-brand bg-brand/15 text-brand"
                  : "border-line bg-base text-ink-2 hover:border-brand/50 hover:text-ink",
              )}
            >
              <ShoppingBag size={13} />
              <span>{mostrarCatalogo ? "Ocultar ítems" : "Añadir ítems"}</span>
            </button>
          )}
          {/* Quien se sentó (o dejó pendiente la venta) y se fue sin pagar deja una deuda a su nombre (B3-11). Sin pagos
              a medias: lo que ya se pagó se cobra o se anula antes. */}
          {(cuenta.kind === "MESA" || cuenta.kind === "MOSTRADOR") && pagos.length === 0 && !cuenta.lines.some((l) => l.paid) && (
            <button
              type="button"
              onClick={() => setSeFue(true)}
              title="Se fue sin pagar: queda en deuda a su nombre"
              aria-label="Se fue sin pagar"
              aria-haspopup="dialog"
              className="inline-flex min-h-14 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-base px-3 text-[13px] font-semibold text-ink-2 transition-all hover:border-state-crit/50 hover:text-state-crit"
            >
              <UserX size={14} aria-hidden="true" />
              <span className="hidden @lg/ticket:inline">Se fue sin pagar</span>
            </button>
          )}
        </div>
        {/* B6-14: una cuenta del salón dice su mesa, si pidió la cuenta, lo que falta servir y sus niños (B4-14: lo suyo
            en esta cuenta, o ya pagado aparte), con su tiempo si siguen en la sala. */}
        {esDelSalon(cuenta) && <SalonDeLaCuenta cuenta={cuenta} />}

        {/* Catálogo táctil de mostrador (snacks, bebidas, golosinas). Cede su sitio a los ítems (B3-10): como mucho la
            mitad larga de la tarjeta, y menos si hace falta para que se vean al menos dos o tres. */}
        {mostrarCatalogo && onAgregarProducto && (
          <div className="flex max-h-[26rem] min-h-0 flex-col border-b border-line bg-base/50 p-3 md:max-h-[55%]">
            <CartaMostrador
              aBolivares={aBolivares}
              onElegir={onAgregarProducto}
              className="flex-1"
            />
          </div>
        )}

        <div className="min-h-[7.5rem] flex-1 overflow-y-auto px-5 py-4">
          {/* Estilo factura: concepto a la izquierda, importe alineado a la
                derecha, filas compactas y sin numerar. Lo que se añadió en
                mostrador se toca para quitarlo: la fila crece y enseña el
                botón, en vez de llevar una «x» diminuta en cada renglón. */}
          <div
            className={cn(
              COLUMNAS,
              "border-b border-line pb-1 text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase",
            )}
          >
            <span className="text-right">Cant.</span>
            <span>Concepto</span>
            <span className="hidden text-right @md/ticket:block">P. unit.</span>
            <span className="text-right">Importe</span>
          </div>
          <ul className="flex flex-col divide-y divide-dashed divide-line/60">
            {filas.map((f) => {
              const importe = formatMoneyVE(
                toMajor(multiply(f.precio, BigInt(f.cantidad))),
                f.precio.currency,
              );
              const esMostrador =
                f.item !== null && onCambiarCantidad !== undefined;
              const expandible =
                f.anulada === undefined &&
                f.porUso === undefined &&
                (esMostrador ||
                  (onCortesia !== undefined && permisoCortesia !== "DENEGADO"));
              const tachada = f.cortesia !== undefined || f.anulada !== undefined || f.porUso !== undefined;
              const abierta = expandible && filaAbierta === f.clave;

              // La línea base de la cuenta, para pasarla al diálogo de cortesía.
              const lineaOriginal = cuenta.lines.find(
                (l) => l.id === f.lineIds[0],
              );

              const celdas = (
                <>
                  <span className="tnum text-right font-semibold text-ink">
                    {f.cantidad}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="line-clamp-2 break-words text-ink-2">
                        {f.concepto}
                      </span>
                      {f.item && (
                        <ShoppingBag
                          size={11}
                          className="shrink-0 text-ink-3"
                          aria-label="de mostrador"
                        />
                      )}
                    </span>
                    {f.cantidad > 1 && !tachada && (
                      <span className="tnum mt-0.5 text-[11px] text-ink-3 @md/ticket:hidden">
                        {f.cantidad} ×{" "}
                        {formatMoneyVE(toMajor(f.precio), f.precio.currency)}
                      </span>
                    )}
                    {f.cortesia && (
                      <span className="mt-0.5 text-[11.5px] text-ink-3">
                        Cortesía · {f.cortesia.autorizadaPor.name}
                      </span>
                    )}
                    {f.anulada && (
                      <span className="mt-0.5 text-[11.5px] text-ink-3">
                        Anulado en cocina · {f.anulada}
                      </span>
                    )}
                    {f.porUso !== undefined && (
                      <span className="tnum mt-0.5 text-[11.5px] text-ink-3">
                        Cambiado por uso · estuvo {f.porUso} min
                      </span>
                    )}
                  </span>
                  <span className="hidden tnum text-right text-ink-3 @md/ticket:block">
                    {tachada ? (
                      <span className="line-through opacity-60">
                        {formatMoneyVE(toMajor(f.precio), f.precio.currency)}
                      </span>
                    ) : (
                      formatMoneyVE(toMajor(f.precio), f.precio.currency)
                    )}
                  </span>
                  <span className="tnum text-right font-medium text-ink">
                    {tachada ? (
                      <span className="line-through opacity-60">{importe}</span>
                    ) : (
                      importe
                    )}
                  </span>
                </>
              );
              return (
                <li key={f.clave} className={cn(abierta && "bg-surface-2/60")}>
                  {expandible ? (
                    <button
                      type="button"
                      aria-expanded={abierta}
                      aria-label={`${f.concepto}, ${f.cantidad} ${f.cantidad === 1 ? "unidad" : "unidades"}, ${importe}. ${esMostrador ? "Cambiar cantidad o cortesía" : "Opciones de cortesía"}`}
                      onClick={() => setFilaAbierta(abierta ? null : f.clave)}
                      className={cn(
                        COLUMNAS,
                        "min-h-12 w-full cursor-pointer py-1 text-left text-[13px] transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-brand",
                      )}
                    >
                      {celdas}
                    </button>
                  ) : (
                    <div className={cn(COLUMNAS, "min-h-12 py-1 text-[13px]")}>
                      {celdas}
                    </div>
                  )}
                  {abierta && (
                    <div className="flex flex-wrap items-center gap-2 pb-2 px-2">
                      {esMostrador && f.item && !f.cortesia && (
                        <Stepper
                          value={f.cantidad}
                          onChange={(n) => onCambiarCantidad?.(f.item!, n)}
                          label={`Cantidad de ${f.concepto}`}
                          min={0}
                          max={50}
                          surface="pos"
                        />
                      )}
                      <div className="ml-auto flex gap-2">
                        {onCortesia !== undefined &&
                          permisoCortesia !== "DENEGADO" &&
                          lineaOriginal && (
                            <Button
                              surface="pos"
                              variant="neutral"
                              className="text-[13px]"
                              onClick={() =>
                                setLineaParaCortesia({
                                  linea: lineaOriginal,
                                  quitar: f.cortesia !== undefined,
                                })
                              }
                            >
                              {f.cortesia ? "Quitar cortesía" : "Cortesía"}
                            </Button>
                          )}
                        {esMostrador && f.item && !f.cortesia && (
                          <Button
                            surface="pos"
                            variant="danger"
                            className="text-[13px]"
                            onClick={() => {
                              onCambiarCantidad?.(f.item!, 0);
                              setFilaAbierta(null);
                            }}
                          >
                            <X size={15} aria-hidden="true" />
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* El cobro que llevaba otra persona (B3-13): se retoma con su tasa, o se descarta (queda dicho quién). */}
          {borrador.ajeno && (
            <div role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[12.5px] text-ink">
              <span className="min-w-0 flex-1">
                Cobro en curso por <strong>{borrador.ajeno.por}</strong> ·{" "}
                {borrador.ajeno.borrador.pagos
                  .map((p) => `${mediosDisponibles.find((m) => m.code === p.medio)?.label ?? p.medio} ${formatMoneyVE(toMajor(money(BigInt(p.amount.minor), p.amount.currency as CurrencyCode)), p.amount.currency as CurrencyCode)}`)
                  .join(" · ")}
              </span>
              <Button
                type="button"
                variant="neutral"
                surface="pos"
                onClick={() => {
                  retomar(borrador.ajeno!);
                  setBorrador((b) => ({ ...b, ajeno: null }));
                }}
              >
                Retomar
              </Button>
              <Button type="button" variant="ghost" surface="pos" onClick={() => void descartarAjeno()}>
                Descartar
              </Button>
            </div>
          )}
          {/* Los pagos son parte del mismo documento, no una tarjeta aparte. */}
          {pagos.length === 0 ? (
            <p className="mt-3 border-t border-line/40 pt-3 text-[12.5px] text-ink-3">
              Sin pagos todavía. Se pueden combinar medios: efectivo y punto,
              dólares y bolívares.
            </p>
          ) : (
            <div className="mt-5">
              <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                Pagos recibidos
              </h3>
              <ul className="flex flex-col gap-1.5">
                {pagos.map((p) => {
                  const linea = igtf.lines.find(
                    (l) => l.methodCode === p.medio.code,
                  );
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
                          <Icon
                            size={14}
                            className="text-ink-3 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-ink">
                                {p.medio.label}
                              </span>
                              {p.medio.triggersIgtf && linea && linea.igtf.amount > 0n && (
                                <span className="tnum text-[11px] whitespace-nowrap text-ink-3">
                                  + IGTF{" "}
                                  {formatMoneyVE(
                                    toMajor(linea.igtf),
                                    linea.igtf.currency,
                                  )}
                                </span>
                              )}
                            </span>
                            {p.datos && (
                              // La referencia de un pago no sale en la captura de un reporte (T-11, PLAN §7.6).
                              <span data-privado className="tnum block truncate text-[11.5px] text-ink-3">
                                {resumenDatos(p.datos, terminales)}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <MoneyDisplay
                            value={toMajor(p.amount)}
                            currency={p.amount.currency}
                            size="md"
                          />
                          <Pencil
                            size={13}
                            className="text-ink-3 opacity-60 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPagos((prev) =>
                            prev.filter((x) => x.uid !== p.uid),
                          )
                        }
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

        {/* El pie de la cuenta (B3-10, M-32): compacto, para que los ítems sean lo que más se ve. A quién se factura, el
              descuento y dividir son una fila de botones que dicen su estado; los impuestos, un renglón; el total, grande. */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-base/40 px-4 pt-2.5 pb-3">
          <div data-recorrido="caja-pie" role="group" aria-label="Factura, descuento y dividir" className="grid auto-cols-fr grid-flow-col gap-1.5">
            {/* A quién se factura: un toque solo cuando el cliente lo pide (DEC-23). */}
            <BotonDelPie
              icono={IdCard}
              etiqueta="Factura a"
              tecla="I"
              activo={cliente.kind === "IDENTIFICADO"}
              aria-haspopup="dialog"
              title={cliente.kind === "IDENTIFICADO" ? `${cliente.name} · ${documentoEnmascarado(cliente.document)}` : "Identificar al cliente de la factura (tecla I)"}
              onClick={() => setIdentificando(true)}
              className={faltaCliente ? "border-state-warn/70 bg-state-warn-bg/25" : undefined}
            >
              {cliente.kind === "IDENTIFICADO" ? cliente.name : faltaCliente ? "Falta el cliente" : "Consumidor final"}
            </BotonDelPie>
            {(descuento || ofreceDescuentos) && (
              <BotonDelPie
                icono={BadgePercent}
                etiqueta="Descuento"
                activo={descuento !== undefined}
                {...(descuento ? { "aria-expanded": enElPie === "descuento" } : { "aria-haspopup": "dialog" as const })}
                disabled={!descuento && bloqueoDescuento !== null}
                title={descuento ? descuento.nombre : (bloqueoDescuento ?? "Aplicar un descuento a la cuenta")}
                onClick={() => (descuento ? setEnElPie((x) => (x === "descuento" ? null : "descuento")) : setViendoDescuento(true))}
              >
                {descuento
                  ? `− ${textoValor(descuento.valor)}`
                  : ofrecidos && ofrecidos.candidatos.length > 0
                    ? ofrecidos.candidatos.length === 1
                      ? "1 disponible"
                      : `${ofrecidos.candidatos.length} disponibles`
                    : "Ninguno"}
              </BotonDelPie>
            )}
            {onDividir && (
              <BotonDelPie
                icono={Users}
                etiqueta="Dividir"
                activo={partes > 1}
                aria-expanded={enElPie === "dividir"}
                disabled={bloqueoDividir !== null}
                title={bloqueoDividir ?? "Dividir la cuenta en partes iguales"}
                onClick={() => setEnElPie((x) => (x === "dividir" ? null : "dividir"))}
              >
                {partes > 1 ? `Entre ${partes}` : "Sin dividir"}
              </BotonDelPie>
            )}
          </div>

          {/* Dividir: «pagamos entre tres» es lo que más se pide en una mesa. Cada parte se cobra por separado y con su
                propio recibo; la cuenta sigue en la cola hasta que se paga la última. */}
          {enElPie === "dividir" && onDividir && bloqueoDividir === null && (
            <div role="group" aria-label="Dividir la cuenta" className="flex gap-1">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === partes}
                  aria-label={n === 1 ? "Sin dividir" : `Entre ${n}`}
                  onClick={() => {
                    if (n !== partes) onDividir(n);
                    setEnElPie(null);
                  }}
                  className={cn(
                    "tnum min-h-14 cursor-pointer rounded-[var(--radius-control)] border font-semibold transition-colors",
                    n === 1 ? "shrink-0 px-3 text-detalle" : "min-w-0 flex-1 text-cuerpo",
                    n === partes
                      ? "border-brand bg-brand/15 text-ink"
                      : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                  )}
                >
                  {n === 1 ? "Sin dividir" : n}
                </button>
              ))}
            </div>
          )}

          {/* El descuento puesto: de qué es, quién lo autorizó y quitarlo (con pagos, no). */}
          {enElPie === "descuento" && descuento && (
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface py-1 pr-1 pl-3">
              <p className="min-w-0 flex-1 text-detalle text-ink-2">
                <span className="font-semibold text-ink">{descuento.nombre}</span> · {textoValor(descuento.valor)}
                {descuento.alcance.tipo === "CUENTA" ? "" : ` sobre ${textoAlcance(descuento.alcance)}`} ·{" "}
                {descuento.origen === "MEDIO"
                  ? `toda la cuenta con ${mediosDisponibles.find((m) => m.code === descuento.medio)?.label ?? descuento.medio}`
                  : descuento.autorizadoPor
                    ? `autorizó ${descuento.autorizadoPor.name}`
                    : "familia VIP"}
              </p>
              {onQuitarDescuento && (
                <Button
                  surface="pos"
                  variant="neutral"
                  className="shrink-0 text-[13px]"
                  disabled={pagos.length > 0 || quitandoDescuento}
                  title={pagos.length > 0 ? "Quita primero los pagos" : undefined}
                  onClick={async () => {
                    setQuitandoDescuento(true);
                    const r = await onQuitarDescuento();
                    setQuitandoDescuento(false);
                    if (r) setError(r.mensaje);
                    else setEnElPie(null);
                  }}
                >
                  Quitar
                </Button>
              )}
            </div>
          )}

          <dl className="tnum flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-detalle text-ink-3">
            <div className="flex items-baseline gap-1.5">
              <dt>Subtotal</dt>
              <dd className="text-ink-2">{formatMoneyVE(toMajor(doc.subtotal), "USD")}</dd>
            </div>
            {descuento && (
              <div className="flex items-baseline gap-1.5">
                <dt>Descuento</dt>
                <dd className="font-semibold text-ink">− {formatMoneyVE(toMajor(doc.discountTotal), "USD")}</dd>
              </div>
            )}
            {doc.buckets.map((b) => (
              <div
                key={b.code}
                className="flex items-baseline gap-1.5"
                title={`${doc.taxIncluded ? "Base" : "Sobre"} ${formatMoneyVE(toMajor(b.base), "USD")}`}
              >
                <dt>
                  IVA {b.basisPoints / 100} %{doc.taxIncluded ? " incluido" : ""}
                </dt>
                <dd className="text-ink-2">{formatMoneyVE(toMajor(b.tax), "USD")}</dd>
              </div>
            ))}
            {igtfTotal.amount > 0n && (
              <div className="flex items-baseline gap-1.5" title="El IGTF grava el medio de pago, no la venta: solo lo pagado en divisas o cripto.">
                <dt>IGTF {igtfBasisPoints / 100} %</dt>
                <dd className="text-ink-2">{formatMoneyVE(toMajor(igtfTotal), "USD")}</dd>
              </div>
            )}
          </dl>
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-display text-base font-bold text-ink">
              {partes > 1 ? (
                <>
                  <span>
                    Parte <span className="tnum">{parteActual}</span> de {partes}
                  </span>
                  <span className="tnum font-sans text-detalle font-normal text-ink-3">
                    total {formatMoneyVE(toMajor(doc.total), "USD")}
                  </span>
                </>
              ) : (
                "Total a cobrar"
              )}
            </p>
            <MoneyDisplay value={toMajor(aCobrar)} currency="USD" size="lg" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════ cobrar ══════════════════════════════
            Estructura FIJA, pedida por el cliente: visor, medios, una franja de
            alto fijo según el medio, el teclado siempre a la vista y una fila de
            dos columnas con «Cobrar exacto» y «Cobrar». Cambiar de medio o
            teclear no mueve nada de sitio, y no hay que abrir nada para teclear. */}
      <aside
        data-recorrido="caja-cobro"
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card [&>*]:shrink-0",
          PLACEMENT_COBRO,
          "md:bajo:grid md:bajo:grid-cols-[minmax(0,1fr)_12rem] md:bajo:grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] md:bajo:gap-x-3 md:bajo:overflow-hidden",
        )}
      >
        {/* ── visor: lo que falta (o el vuelto) y lo que se está tecleando ── */}
        <div
          className={cn(
            "md:bajo:col-start-1 md:bajo:row-start-1 rounded-[var(--radius-control)] border px-3 py-2.5",
            "transition-colors duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
            cubierto
              ? "border-state-ok/40 bg-state-ok-bg/40"
              : "border-line-strong bg-base",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-ink uppercase">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 rounded-full",
                    cubierto ? "bg-state-ok" : "bg-brand",
                  )}
                />
                {!cubierto
                  ? "Falta por cobrar"
                  : sobra.amount > 0n
                    ? "Vuelto a entregar"
                    : "Cubierto"}
              </p>
              <MoneyDisplay
                value={toMajor(
                  !cubierto ? falta : sobra.amount > 0n ? sobra : aCobrar,
                )}
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
              <span className="tnum text-lg font-bold text-ink-2">
                {cubierto ? sobraEnBs : faltaEnBs}
              </span>
            </p>
          )}
        </div>

        {/* ── medio de pago con iconos y jerarquía financiera ── */}
        <div
          className="md:bajo:col-start-1 md:bajo:row-start-2 grid grid-cols-3 gap-1.5"
          role="radiogroup"
          aria-label="Medio de pago"
        >
          {fijos.map((m) => pintarMedio(m))}
          {otros.length > 0 &&
            (otroElegido ? (
              pintarMedio(otroElegido, () => setEligiendoOtro(true))
            ) : (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setEligiendoOtro(true)}
                className={cn(
                  "flex h-14 cursor-pointer flex-col items-start justify-center overflow-hidden rounded-[var(--radius-control)] border border-dashed border-line-strong bg-base px-1.5 text-left text-ink-2",
                  "transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                )}
              >
                <span className="flex w-full min-w-0 items-center gap-1">
                  <ChevronDown size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="truncate text-[12px] leading-tight font-bold">Otros medios</span>
                </span>
                <span className="mt-0.5 truncate text-[10px] text-ink-3">
                  {otros.map((m) => m.label).join(" · ")}
                </span>
              </button>
            ))}
        </div>

        {/* ── franja del medio: SIEMPRE 56 px, ni uno más ── */}
        <div className="md:bajo:col-start-1 md:bajo:row-start-3 h-14 overflow-hidden">
          {tasaCambio && congelada && tasaValorViva && rateVivo ? (
            // La tasa cambió con el cobro en curso (ADR-019 §7): el cobro sigue con la suya hasta
            // que se decida. Va primero porque cambia los bolívares de todo lo demás.
            <div role="group" aria-label="La tasa cambió" className="grid h-14 grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
              <p
                role="status"
                className="flex min-w-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-2 text-state-warn"
              >
                <TriangleAlert size={14} className="shrink-0" aria-hidden="true" />
                {/* La del cobro ya se lee arriba («En bolívares · 860,00 Bs/$»): aquí, solo la nueva. */}
                <span className="tnum flex min-w-0 flex-col text-[11.5px] leading-tight">
                  <span className="truncate font-bold">Tasa nueva</span>
                  <span className="truncate">Bs. {formatTasaVE(tasaValorViva)}</span>
                </span>
              </p>
              <button
                type="button"
                onClick={() => setTasaMantenida(tasaValorViva)}
                className={cn(
                  "min-h-14 cursor-pointer rounded-[var(--radius-control)] border border-line bg-base px-2.5 text-[12px] font-semibold text-ink-2",
                  "hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                )}
              >
                Mantener
              </button>
              <button
                type="button"
                onClick={() => setTasaDelCobro({ rate: rateVivo, valor: tasaValorViva, id: tasaIdViva })}
                className={cn(
                  "min-h-14 cursor-pointer rounded-[var(--radius-control)] border border-brand bg-brand/15 px-2.5 text-[12px] font-bold text-brand",
                  "hover:bg-brand/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                )}
              >
                Usar la nueva
              </button>
            </div>
          ) : cubierto && sobra.amount > 0n ? (
            // El excedente exige una decisión: no se cierra solo (§5.6).
            <div
              role="radiogroup"
              aria-label="Destino del vuelto"
              className="grid grid-cols-3 gap-1.5"
            >
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
                    destinoVuelto === k
                      ? "border-brand bg-brand/15 font-semibold text-brand"
                      : "border-line text-ink-2 hover:text-ink",
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
            <div
              role="group"
              aria-label="Billetes recibidos"
              className="grid grid-cols-6 gap-1.5"
            >
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
          ) : medioActivo.datos === "PAGO_MOVIL" && pagoMovilLocal ? (
            // Compacto: sin icono (el medio ya está elegido arriba), el banco por
            // su nombre y el teléfono sin puntos. «Copiar» es solo el icono;
            // el código del banco va en lo que se copia.
            <div
              aria-label="Datos de Pago Móvil del local"
              className="flex h-14 items-center gap-1 rounded-[var(--radius-control)] border border-brand/30 pl-2.5 text-[11.5px]"
            >
              <dl className="grid min-w-0 flex-1 grid-flow-col grid-cols-[auto_auto_auto] grid-rows-2 justify-between gap-x-2">
                <dt className="text-[9.5px] text-ink-3 uppercase">Banco</dt>
                <dd className="truncate font-bold text-ink">
                  {nombreBanco(pagoMovilLocal.bankCode)}
                </dd>
                <dt className="text-[9.5px] text-ink-3 uppercase">Teléfono</dt>
                <dd className="tnum truncate font-bold text-ink">
                  {pagoMovilLocal.phone}
                </dd>
                <dt className="text-[9.5px] text-ink-3 uppercase">RIF</dt>
                <dd className="tnum truncate font-bold text-ink">
                  {pagoMovilLocal.document}
                </dd>
              </dl>
              <BotonCopiar
                copiado={copiado}
                onCopiar={() =>
                  copiarTexto(
                    `${nombreBanco(pagoMovilLocal.bankCode)} (${pagoMovilLocal.bankCode}) - ${pagoMovilLocal.phone} - ${pagoMovilLocal.document}`,
                  )
                }
                que="los datos de Pago Móvil"
              />
            </div>
          ) : medioActivo.datos === "ZELLE" && zelleLocal ? (
            <div className="flex h-14 items-center gap-1 rounded-[var(--radius-control)] border border-line pl-2.5 text-[11.5px]">
              <Zap
                size={14}
                className="shrink-0 text-ink-3"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[9.5px] text-ink-3 uppercase">
                  Zelle · {zelleLocal.holder}
                </span>
                <span className="block truncate font-bold text-ink">
                  {zelleLocal.email}
                </span>
              </div>
              <BotonCopiar
                copiado={copiado}
                onCopiar={() => copiarTexto(zelleLocal.email)}
                que="el correo de Zelle"
              />
            </div>
          ) : (
            <p className="flex h-14 items-center rounded-[var(--radius-control)] border border-dashed border-line px-3 text-[12px] leading-snug text-ink-3">
              {INDICACION_MEDIO[medioActivo.code] ??
                (medioActivo.datos === "PUNTO" ? INDICACION_MEDIO["PDV_DEBITO"] : undefined) ??
                (esEfectivo
                  ? "Teclea lo recibido y pulsa «Añadir»."
                  : "Teclea lo recibido y pulsa «Añadir», o cobra el monto exacto.")}
            </p>
          )}
        </div>

        {/* ── el teclado, siempre en su sitio ── */}
        <NumericKeypad
          className="md:bajo:col-start-2 md:bajo:row-span-5 md:bajo:row-start-1 md:bajo:auto-rows-fr"
          value={monto}
          onChange={setMonto}
          maxLength={9}
          // Filas de 56 px: el objetivo de POS de §8.4.
          surface="tablet"
          disabled={cubierto}
          onSubmit={agregarPago}
          submitLabel="Añadir"
        />

        <div className="md:bajo:col-start-1 md:bajo:row-start-4 flex flex-col gap-2 empty:hidden">
          {faltaTasa && (
            <p role="alert" className="text-[12px] text-state-crit">
              Hay un pago en otra moneda sin tasa congelada. No se puede cobrar
              (ADR-005).
            </p>
          )}
          {cubierto &&
            destinoVuelto === "CAJA" &&
            sobra.amount > maxRetained.amount && (
              <p role="alert" className="text-[11.5px] text-state-crit">
                Por encima del umbral (
                {formatMoneyVE(toMajor(maxRetained), "USD")}) no se puede dejar
                en caja: hay que dar vuelto o marcarlo como propina.
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
        </div>

        {/* ── una fila: el recibo · cobrar exacto · cobrar. En efectivo, solo
              cobrar, a lo que queda: la fila no cambia de alto ni de sitio. ── */}
        <div className="md:bajo:col-start-1 md:bajo:row-start-5 mt-auto grid grid-cols-[4.5rem_1fr_1fr] gap-2">
          {/* «Imprimir recibo» (B3-8): un interruptor a la vista, con su tecla. Icono, texto y color: no solo color. */}
          <button
            type="button"
            role="switch"
            aria-checked={imprimirRecibo}
            aria-label="Imprimir recibo"
            title="Imprimir el recibo al cerrar (tecla *)"
            onClick={() => setImprimirRecibo((v) => !v)}
            className={cn(
              "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border px-1 leading-tight",
              "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              imprimirRecibo ? "border-brand bg-brand/15 text-ink" : "border-line bg-base text-ink-3 hover:border-line-strong",
            )}
          >
            <span className="flex items-center gap-1">
              <Printer size={16} aria-hidden="true" className={imprimirRecibo ? "text-brand" : "text-ink-3"} />
              <PistaTecla tecla="*" />
            </span>
            <span className="text-[11.5px] font-semibold whitespace-nowrap">{imprimirRecibo ? "Recibo" : "Sin recibo"}</span>
          </button>
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
                {montoExacto && !cubierto
                  ? formatMoneyVE(toMajor(montoExacto), medioActivo.currency)
                  : "—"}
              </span>
            </button>
          )}
          <Button
            surface="pos"
            variant="primary"
            disabled={!puedeCobrar || enviando}
            onClick={() => void cobrar()}
            className={cn(
              "flex min-h-14 flex-col gap-0.5 px-2 leading-tight",
              esEfectivo && "col-span-2",
              puedeCobrar && "bg-state-ok text-on-brand hover:bg-state-ok/90",
            )}
          >
            {/* «Cobrar $ 13.00» (M-32): lo que se cobra, el de la parte si está dividida. Debajo, lo que falta o la tecla. */}
            {/* Un monto largo («$ 1,234.56») en la columna angosta pasa a su propio renglón: no se sale del botón. */}
            <span className="flex flex-wrap items-center justify-center gap-x-1.5 text-[14px] font-bold">
              {puedeCobrar && <CircleCheckBig size={15} aria-hidden="true" />}
              {enviando ? (
                "Cobrando…"
              ) : (
                <>
                  Cobrar <span className="tnum whitespace-nowrap">{formatMoneyVE(toMajor(aCobrar), "USD")}</span>
                </>
              )}
            </span>
            <span className="tnum text-[12px] font-semibold opacity-80">
              {puedeCobrar ? (
                <PistaTecla tecla="Ctrl ⏎" />
              ) : faltaCliente && cubierto ? (
                "Falta el cliente: Factura a (I)"
              ) : (
                `Falta ${formatMoneyVE(toMajor(falta), "USD")}`
              )}
            </span>
          </Button>
        </div>
      </aside>

      {/* B6-14: niños de la mesa en la sala al cobrarla. */}
      <Dialog
        abierto={ninosSinSalida !== null}
        onCerrar={() => setNinosSinSalida(null)}
        titulo="Dales salida antes"
        descripcion={ninosSinSalida ? `Siguen en la sala: ${ninosSinSalida.join(", ")}. Su tiempo va en esta cuenta y todavía corre.` : ""}
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button surface="pos" variant="primary" onClick={() => setNinosSinSalida(null)}>
              Volver
            </Button>
            <Button
              surface="pos"
              variant="neutral"
              onClick={() => {
                avisadosDeSalida.current = cuenta.id;
                setNinosSinSalida(null);
                void cobrar();
              }}
            >
              Cobrar igual
            </Button>
          </div>
        }
      >
        <p className="text-detalle text-ink-2">
          Pasa su pulsera por la caja o dales salida en la sala: su tiempo se suma a esta cuenta y se cobra todo junto.
        </p>
      </Dialog>
      <MarcarDeudaDialog
        cuenta={seFue ? cuenta : null}
        onCerrar={() => setSeFue(false)}
        onHecha={(r) => {
          setSeFue(false);
          // Incobrable: sale de la cola; la caja pasa a la siguiente.
          adoptarCuenta(r.cuenta);
        }}
      />
      <ClienteFacturaDialog
        abierto={identificando}
        actual={cliente}
        // El cliente de la cuenta (B6-9) se ofrece con un toque: su nombre y su cédula ya puestos.
        nombrePropuesto={cuenta.cliente?.nombre ?? (esVentaDirecta(cuenta) ? "" : cuenta.family)}
        documentoPropuesto={cuenta.cliente?.cedula ?? ""}
        exigido={cuenta.kind === "MOSTRADOR" && !cuenta.cliente}
        onConfirmar={(c) => {
          setCliente(c);
          setIdentificando(false);
        }}
        onCerrar={() => setIdentificando(false)}
      />

      <Dialog
        abierto={eligiendoOtro}
        onCerrar={() => setEligiendoOtro(false)}
        titulo="Otros medios de pago"
        descripcion="Los que no caben en la cuadrícula. El elegido ocupa la sexta casilla."
      >
        <div role="radiogroup" aria-label="Otros medios de pago" className="grid grid-cols-2 gap-1.5">
          {otros.map((m) => {
            const bloqueado = m.currency !== FUNCIONAL && !rate;
            return (
              <button
                key={m.code}
                type="button"
                role="radio"
                aria-checked={m.code === medioActivo.code}
                disabled={bloqueado}
                onClick={() => {
                  setMedioActivo(m);
                  setEligiendoOtro(false);
                }}
                className={cn(
                  "flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 text-left",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-35",
                  m.code === medioActivo.code ? "border-brand bg-brand/20 text-ink" : "border-line bg-base text-ink-2 hover:text-ink",
                )}
              >
                <span className="text-[14px] font-bold">{m.label}</span>
                <span className="text-[11px] text-ink-3">
                  {m.currency}
                  {m.triggersIgtf && igtfBasisPoints > 0 ? ` · +${igtfBasisPoints / 100}% IGTF` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </Dialog>
      <DatosPagoDialog
        tipo={pendienteDeDatos?.medio.datos ?? null}
        monto={
          pendienteDeDatos
            ? `${pendienteDeDatos.medio.label} · ${formatMoneyVE(toMajor(pendienteDeDatos.amount), pendienteDeDatos.amount.currency)}`
            : ""
        }
        terminales={terminales}
        recordados={recordados}
        referenciasUsadas={pagos.flatMap((p) =>
          p.datos ? [claveDeReferencia(p.datos)] : [],
        )}
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
                moneda:
                  pagoEditado.amount.currency === "VES"
                    ? "Bs."
                    : pagoEditado.amount.currency,
                ...(pagoEditado.datos ? { datos: pagoEditado.datos } : {}),
              }
            : null
        }
        terminales={terminales}
        recordados={recordados}
        referenciasUsadas={pagos.flatMap((p) =>
          p.datos && p.uid !== editando ? [claveDeReferencia(p.datos)] : [],
        )}
        onConfirmar={confirmarEdicion}
        onCancelar={() => setEditando(null)}
      />
      {onDescuento && (
        <DescuentoDialog
          abierto={viendoDescuento}
          ofrecidos={ofrecidos}
          onAplicar={async (pedido, autorizacion) => {
            const rechazo = await onDescuento(pedido, autorizacion);
            if (!rechazo) setViendoDescuento(false);
            return rechazo;
          }}
          onCerrar={() => setViendoDescuento(false)}
        />
      )}
      {lineaParaCortesia && onCortesia && (
        <CortesiaDialog
          linea={lineaParaCortesia.linea}
          quitar={lineaParaCortesia.quitar}
          onAplicar={async (motivo, detalle, autorizacion) => {
            const rechazo = await onCortesia(lineaParaCortesia.linea, motivo, detalle, autorizacion);
            if (!rechazo) {
              setLineaParaCortesia(null);
              setFilaAbierta(null);
            }
            return rechazo;
          }}
          onCerrar={() => setLineaParaCortesia(null)}
        />
      )}
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
  // B4-12: la entrada y la salida viven en «Parque»; los `volver` de antes llevan allí.
  "/monitor": { ruta: "/monitor", nombre: "Parque" },
  "/entrada": { ruta: "/monitor", nombre: "Parque" },
  "/salida": { ruta: "/monitor", nombre: "Parque" },
};

/* ── colocación en la rejilla de la caja ──────────────────────────────────
   Tres columnas (cola | ticket | cobro) desde lg si la pantalla no es baja, y
   desde xl si lo es. Dos columnas (cola PLEGADA tras un conmutador | cobro) de
   md a lg, y de lg a xl en pantalla baja (F-02, F-07). Todo lo `*:bajo:` sale
   en el CSS después de todo lo `lg:`/`xl:`: por eso cada propiedad se repite
   con `lg:bajo:` y `xl:bajo:`. */
const OCULTA_SI_PLEGADA = "md:hidden lg:flex lg:bajo:hidden xl:bajo:flex";
const PLACEMENT_COLA =
  "md:col-start-1 md:row-start-2 lg:row-start-1 lg:bajo:row-start-2 xl:bajo:row-start-1";
const PLACEMENT_TICKET =
  "md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1 lg:bajo:col-start-1 lg:bajo:row-start-2 xl:bajo:col-start-2 xl:bajo:row-start-1";
const PLACEMENT_COBRO =
  "md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3 lg:row-span-1 lg:bajo:col-start-2 lg:bajo:row-span-2 xl:bajo:col-start-3 xl:bajo:row-span-1";
const PLACEMENT_SIN_CUENTAS =
  "md:col-start-2 md:col-span-1 md:row-span-2 md:row-start-1 lg:col-span-2 lg:row-span-1 lg:bajo:col-span-1 lg:bajo:row-span-2 xl:bajo:col-span-2 xl:bajo:row-span-1";

type CobroProps = Parameters<typeof CobroCuenta>[0];

export function CajaScreen({
  cuentaInicial,
  volver,
  impuestos,
  catalogo,
  serverNow,
  turno,
  vistaDePrecios = "AMBOS",
  deudasPendientes = [],
  ...cobro
}: Omit<
  CobroProps,
  "lines" | "cuenta" | "onCobrado" | "maxRetained" | "rate" | "tasaValor" | "tasaId" | "rules" | "igtfBasisPoints" | "instanteFiscal" | "categoryOf"
> & {
  /** El calendario de los impuestos, leído en el servidor (B2-2). */
  impuestos: ImpuestosDto;
  /** El catálogo de productos con sus precios con vigencia, leído en el servidor (B9-1). */
  catalogo: CatalogoDto;
  /** La hora del servidor al pintar: de ella avanza el instante con que se eligen las alícuotas. */
  serverNow: number;
  /**
   * El turno del equipo, del servidor (B3-1). Sin él no se cobra. Su punto de cobro es el propio
   * equipo (DEC-13): sale del aparato, no de una elección del cajero en cada cobro.
   */
  turno: TurnoDto | null;
  cuentaInicial: string | null;
  volver: string | null;
  /** Cómo enseña los precios la carta en este equipo, de su cookie (T-15). */
  vistaDePrecios?: VistaDePrecios;
  /** Las deudas de clientes que siguen pendientes (B3-11): salen al buscar a su cliente en la cola. */
  deudasPendientes?: readonly DeudaDto[];
}) {
  const { ajustes } = useSucursal();
  // La vista de precios cambia al momento y se guarda en el equipo; si no se guardó, la próxima vez vuelve la de antes.
  const [vistaPrecio, setVistaPrecio] = useState<VistaDePrecios>(vistaDePrecios);
  const vistaPrecios = useMemo(
    () => ({
      vista: vistaPrecio,
      cambiar: (v: VistaDePrecios) => {
        setVistaPrecio(v);
        void cambiarVistaDePrecios(v).catch(() => undefined);
      },
    }),
    [vistaPrecio],
  );
  const maxRetained: Money = {
    amount: BigInt(ajustes.maxRetenido.minor),
    currency: ajustes.maxRetenido.currency,
  };
  const { congelada: rate, tasa: tasaVigente } = useTasaVigente("USD/VES");
  const fiscal = useImpuestosVigentes(impuestos, serverNow);
  // Lo que se vende ahora, con el precio de ahora (B9-1): el mismo instante que las alícuotas.
  const aLaVenta = useMemo(() => productosALaVenta(catalogo, fiscal.instante), [catalogo, fiscal.instante]);
  // Si no queda ningún medio que ofrecer —todos apagados, o al que quedaba le
  // faltan sus datos—, la caja lo dice. Antes entraba en el cobro y se caía al
  // buscar el primer medio de una lista vacía.
  const mediosDisponibles = useMediosActivos();
  const { cuentas, guardar: guardarEnProvider, descartar, cargado, adoptar: adoptarCuenta } = useCuentas();
  // Cargando lo anotado en papel (B3-7): una venta de mostrador nace con la hora real del formulario; lo demás
  // (dividir una cuenta de familia, p. ej.) es de ahora.
  const modoPapel = useModoPapel();
  const guardar = useCallback(
    (cuenta: FamilyAccountDto) => guardarEnProvider(cuenta, modoPapel && cuenta.kind === "MOSTRADOR" ? modoPapel.desdePapel() : undefined),
    [guardarEnProvider, modoPapel],
  );
  const { sala } = useSala();
  const router = useRouter();
  // B6-14: las mesas por limpiar, del servidor. La caja las deja limpias si el mesero se olvidó.
  const { plano } = usePlano();
  const { mesas: mesasSucias, porId: porLimpiarPorId, marcarLimpia } = usePorLimpiar();
  const porLimpiar = useMemo(
    () => mesasSucias.map((m) => ({ tableId: m.tableId, label: plano?.tables.find((t) => t.id === m.tableId)?.label ?? "?" })),
    [mesasSucias, plano],
  );
  const porCobrar = useMemo(
    () => ordenarCola(cuentas.filter((c) => c.status === "POR_COBRAR")),
    [cuentas],
  );
  const [elegida, setElegida] = useState<string | null>(cuentaInicial);
  const actual =
    porCobrar.find((c) => c.id === elegida) ?? porCobrar[0] ?? null;
  const lineas = useMemo(
    () => (actual ? lineasParaCobrar(actual) : []),
    [actual],
  );
  const origen = volver !== null ? (ORIGEN[volver] ?? null) : null;
  /** Venta directa en curso, antes de elegir el primer producto. */
  const [ventaNueva, setVentaNueva] = useState(false);
  const aBolivares = rate
    ? rate.from === "USD"
      ? rate
      : invertRate(rate)
    : null;

  /** Con la cola plegada (dos columnas): qué ocupa la columna izquierda. */
  const [vista, setVista] = useState<"cuenta" | "cola">(
    cuentaInicial ? "cuenta" : "cola",
  );
  const vistaEfectiva = !actual && !ventaNueva ? "cola" : vista;

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroCola>("TODAS");
  const [buscando, setBuscando] = useState(false);
  const buscadorRef = useRef<HTMLInputElement>(null);
  // Lo que dejaron sin pagar quienes se fueron (B3-11): sale al buscar a su cliente. Se relee con las cuentas.
  const [deudas, setDeudas] = useState<readonly DeudaDto[]>(deudasPendientes);
  useAlCambiar(["cuentas"], () => {
    void leerDeudas()
      .then((r) => r.ok && setDeudas(r.valor.deudas.filter((d) => d.estado === "PENDIENTE" && !d.enCobro)))
      .catch(() => undefined);
  });
  // El buscador de la carta que esté a la vista (B3-10): la «/» va a él antes que a la cola.
  const campoDeLaCarta = useRef<HTMLInputElement | null>(null);
  const enfocarLaCarta = useRef(false);
  const buscadorDeLaCarta = useMemo<RefDelBuscador>(() => ({ campo: campoDeLaCarta, enfocarAlMontar: enfocarLaCarta }), []);
  const visibles = useMemo(
    () => filtrarCola(porCobrar, busqueda, filtro),
    [porCobrar, busqueda, filtro],
  );

  // El último cobro sale del registro de ventas: sobrevive a una recarga y
  // «Ventas» ve lo mismo.
  const { ventas, adoptar, imprimir } = useVentas();
  const { cortesia: cortesiaEnServidor, descuento: descuentoEnServidor } = useCuentas();
  // La categoría de cada producto, para el descuento «por categorías» (B3-6).
  const categoryOf = useMemo<CategoryOf>(() => {
    const porId = new Map(catalogo.productos.map((p) => [p.id, p.categoria]));
    return (id) => porId.get(id) ?? null;
  }, [catalogo]);
  // Un cobro anulado ya no es «el último cobro»: su recibo no vale.
  const ultimaVenta = ventas.find((v) => !v.voided) ?? null;
  const ultimoRecibo = useMemo(() => (ultimaVenta ? reciboDeVenta(ultimaVenta, ajustes) : null), [ultimaVenta, ajustes]);
  const [viendoRecibo, setViendoRecibo] = useState(false);
  const [viendoAtajos, setViendoAtajos] = useState(false);

  /* ── la entrada desde la caja (B3-9, M-31) ──────────────────────────
     Registrar y cobrar la entrada de niños sin salir de la caja. Pide registrar entradas (`parque.checkIn`); al
     cargar lo anotado en papel, no: eso sigue en Entrada. `pedido` lleva la pulsera que lo abrió, una vez. */
  const actorDeCaja = useActorEnSesion();
  const puedeRegistrarEntrada = actorDeCaja !== null && can(actorDeCaja, "parque.checkIn") !== "DENEGADO" && !modoPapel;
  const [entradaAbierta, setEntradaAbierta] = useState(false);
  const [pedidoDeEntrada, setPedidoDeEntrada] = useState<{ codigo: string | null; n: number } | null>(null);
  function abrirEntrada(codigo: string | null) {
    setPedidoDeEntrada((p) => ({ codigo, n: (p?.n ?? 0) + 1 }));
    setEntradaAbierta(true);
  }

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
    const nuevas = porCobrar.filter(
      (c) => !conocidas.current!.has(c.id) && !creadasAqui.current.has(c.id),
    );
    for (const id of ids) conocidas.current.add(id);
    if (nuevas.length === 0) return;
    setRecientes((prev) => new Set([...prev, ...nuevas.map((c) => c.id)]));
    avisar.info(
      nuevas.length === 1
        ? `Llegó a la cola: ${numeroDeOrden(nuevas[0]!)} · ${nombreDeCuenta(nuevas[0]!)}`
        : `Llegaron ${nuevas.length} cuentas a la cola`,
    );
    // Sin limpieza a propósito: si la cola cambia antes, el destello igual se apaga.
    window.setTimeout(() => {
      setRecientes(
        (prev) =>
          new Set([...prev].filter((x) => !nuevas.some((c) => c.id === x))),
      );
    }, 2600);
  }, [porCobrar, cargado]);

  /** El buscador de clientes (T-19, tecla C). */
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  function elegir(id: string) {
    setVentaNueva(false);
    setElegida(id);
    setVista("cuenta");
  }

  /* ── la venta del mostrador que se deja sin cobrar (B6-9, M-33) ──────
     Salir de una venta directa sin cobrarla ni ponerle cliente pregunta antes: cobrarla ahora, dejarla pendiente a
     nombre de alguien (nombre, cédula y teléfono) o descartarla. Si el cliente se va sin pagar, hay a quién cobrarle. */
  const [saliendo, setSaliendo] = useState<(() => void) | null>(null);
  const ventaSinDatos =
    actual !== null && !ventaNueva && esVentaDirecta(actual) && !actual.cliente && actual.status === "POR_COBRAR" && actual.lines.some((l) => !l.paid);
  function antesDeSalir(seguir: () => void) {
    if (ventaSinDatos) setSaliendo(() => seguir);
    else seguir();
  }
  /** Elegir otra cuenta de la cola: si la que se deja es una venta sin cobrar ni datos, primero la pregunta. */
  function elegirOtra(id: string) {
    if (id === actual?.id) elegir(id);
    else antesDeSalir(() => elegir(id));
  }
  function seguirSaliendo() {
    const seguir = saliendo;
    setSaliendo(null);
    seguir?.();
  }

  /**
   * Pasar una pulsera abre la cuenta de ese niño. La pulsera se busca en la
   * sala del servidor (B4-2), que dice de qué cuenta es cada estancia.
   */
  function alEscanear(codigo: string) {
    // Un producto pasado por el lector (B9-6) se vende como si se tocara en la carta: a la cuenta que
    // está a la vista, o en una venta directa nueva.
    const producto = aLaVenta.find((p) => p.codigoBarras === codigo.toUpperCase() || p.sku === codigo.toUpperCase());
    if (producto) {
      if (!turno) {
        avisar.error("La caja no vende sin turno abierto", { detalle: "Abre el turno de este equipo." });
        return;
      }
      if (!seVendeAhora(producto)) {
        avisarNoSeVende(producto);
        return;
      }
      if (actual && actual.kind !== "EVENTO" && !ventaNueva && vistaEfectiva === "cuenta") onAgregarProductoACuenta(producto);
      else crearVentaDirecta(producto);
      return;
    }
    const estancia = sala?.sessions.find((s) => s.wristbandCode === codigo) ?? null;
    // Un niño vinculado a una mesa (B6-3, B4-14): su tiempo está en la cuenta de la mesa, no en la de su familia (M-37).
    const suMesa = estancia
      ? cuentas.find((c) => c.kind === "MESA" && (c.status === "ABIERTA" || c.status === "POR_COBRAR") && c.sessionIds.includes(estancia.id))
      : undefined;
    const cuenta = estancia
      ? (suMesa ?? cuentas.find((c) => c.id === estancia.accountId))
      : undefined;
    // Una pulsera que no está en la sala (ya leída) es un niño que llega (B3-9): se registra aquí mismo.
    if (sala && !estancia && puedeRegistrarEntrada) {
      antesDeSalir(() => abrirEntrada(codigo));
      return;
    }
    if (!cuenta) {
      avisar.error(`La pulsera ${codigo} no tiene cuenta en caja`, {
        detalle: "Búscala por el nombre de la familia o el número de orden.",
      });
      return;
    }
    if (cuenta.status !== "POR_COBRAR") {
      avisar.info(
        `${nombreDeCuenta(cuenta)}: ${cuenta.status === "COBRADA" ? "la cuenta ya está cobrada" : "la cuenta sigue abierta"}`,
        {
          detalle:
            cuenta.status === "COBRADA"
              ? `Orden ${numeroDeOrden(cuenta)}`
              : suMesa
                ? "Ese niño está vinculado a esta mesa: se cobra con ella cuando pida la cuenta."
                : "Pasa a caja cuando salgan los niños.",
        },
      );
      return;
    }
    setBusqueda("");
    setFiltro("TODAS");
    elegirOtra(cuenta.id);
  }

  // Atajos de la cola (atajos.ts). Los del cobro viven en CobroCuenta.
  useAtajos((t) => {
    if (t.ctrl) return false;
    if (t.key === "ArrowUp" || t.key === "ArrowDown") {
      if (visibles.length === 0) return false;
      const i = visibles.findIndex((c) => c.id === actual?.id);
      const siguiente =
        t.key === "ArrowDown"
          ? Math.min(visibles.length - 1, i + 1)
          : Math.max(0, i - 1);
      elegirOtra(visibles[i < 0 ? 0 : siguiente]!.id);
      return true;
    }
    if (t.key === "/") {
      // «/» busca en lo que está a la vista (B3-10): la carta, si está abierta y se ve.
      const carta = campoDeLaCarta.current;
      if (carta && carta.getClientRects().length > 0) {
        carta.focus();
        carta.select();
        return true;
      }
      // Si el buscador de la cola ya está a la vista (cola larga), se enfoca aquí; si no,
      // lo enfoca la cola al mostrarlo.
      setBuscando(true);
      buscadorRef.current?.focus();
      setVista("cola");
      return true;
    }
    if (t.key === "?") {
      setViendoAtajos(true);
      return true;
    }
    const letra = t.key.toUpperCase();
    if (letra === "N") {
      antesDeSalir(onNuevaVentaDirecta);
      return true;
    }
    if (letra === "R" && ultimaVenta) {
      setViendoRecibo(true);
      return true;
    }
    if (letra === "A" && puedeRegistrarEntrada) {
      antesDeSalir(() => abrirEntrada(null));
      return true;
    }
    if (letra === "C") {
      setBuscandoCliente(true);
      return true;
    }
    return false;
  });

  function alCobrar(cuenta: FamilyAccountDto, r: Cobrado) {
    // Con la cuenta dividida esto cierra UNA parte: vuelve a la cola con lo
    // que falta y solo se cierra entera con la última (F6-12). Cómo quedó lo
    // dice el servidor, que la marcó en la misma transacción del cobro.
    const despues = r.cuenta;
    const faltan = despues.status === "COBRADA" || !despues.split ? 0 : despues.split.parts - despues.split.paid;
    // Cobrada del todo la última cuenta de la mesa, la mesa queda por limpiar: lo calcula el servidor (B6-14), y el
    // salón lo ve al momento por el canal.
    // Si quedan partes, la cuenta sigue elegida: la siguiente persona paga ya.
    setElegida(faltan > 0 ? cuenta.id : null);
    if (faltan === 0) setVista("cola");
    adoptar(r.venta);
    avisar.ok(
      faltan > 0
        ? `${numeroDeOrden(cuenta)}: parte ${despues.split!.paid} de ${despues.split!.parts} cobrada`
        : `Orden ${numeroDeOrden(cuenta)} cobrada: ${formatMoneyVE(r.total, "USD")}`,
      {
        detalle: [
          r.cliente.kind === "CONSUMIDOR_FINAL"
            ? "Factura a consumidor final"
            : `Factura a ${r.cliente.name}`,
          r.vuelto !== "0.00"
            ? `vuelto entregado: ${formatMoneyVE(r.vuelto, "USD")}`
            : null,
          faltan > 0
            ? `faltan ${faltan} ${faltan === 1 ? "parte" : "partes"} por cobrar`
            : null,
          r.venta.prints.length > 0 ? "recibo a la impresora" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        // Si se vino de otra pantalla, lo urgente es volver; si no, el recibo.
        accion: origen
          ? {
              texto: `Volver a ${origen.nombre}`,
              alPulsar: () => router.push(origen.ruta),
            }
          : { texto: "Ver recibo", alPulsar: () => setViendoRecibo(true) },
      },
    );
    // Se pidió el recibo y no salió (B3-8): el cobro está hecho; el recibo se imprime desde aquí o desde Ventas.
    if (r.reciboNoImpreso) {
      avisar.aviso("El recibo no se imprimió", {
        detalle: `${r.reciboNoImpreso} El cobro sí quedó cerrado.`,
        accion: { texto: "Ver recibo", alPulsar: () => setViendoRecibo(true) },
      });
    }
  }

  /** Cobrar una deuda (B3-11): su cuenta del mostrador entra en la cola y se elige para cobrarla ya. */
  async function cobrarLaDeuda(d: DeudaDto) {
    const r = await cobrarDeuda({ idempotencyKey: globalThis.crypto.randomUUID(), deudaId: d.id }).catch(() => null);
    if (!r) {
      avisar.error("Sin conexión con el servidor: la deuda no pasó a la caja. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    creadasAqui.current.add(r.valor.id);
    adoptarCuenta(r.valor);
    setDeudas((xs) => xs.filter((x) => x.id !== d.id));
    setBusqueda("");
    setFiltro("TODAS");
    antesDeSalir(() => elegir(r.valor.id));
  }

  function onNuevaVentaDirecta() {
    setVentaNueva(true);
    setVista("cuenta");
  }

  /**
   * La venta directa NACE con el primer producto elegido. Antes se abría con un
   * «Agua mineral» ya cargado: si la cajera no lo quitaba, se cobraba algo que
   * nadie pidió (fail-closed: no se cobra nada que no se haya elegido).
   *
   * Es una cuenta de tipo MOSTRADOR (B3-3): sin niños ni mesa, y el servidor le
   * exige vender del catálogo con el precio de ese instante.
   */
  function crearVentaDirecta(producto: ProductoALaVenta) {
    const nueva: FamilyAccountDto = FamilyAccountSchema.parse({
      id: globalThis.crypto.randomUUID(),
      kind: "MOSTRADOR",
      family: "Mostrador",
      mode: "PREPAGO",
      status: "POR_COBRAR",
      openedAt: new Date().toISOString(),
      sessionIds: [],
      closedSessionIds: [],
      lines: [lineaDeProducto(globalThis.crypto.randomUUID(), producto)],
    });
    creadasAqui.current.add(nueva.id);
    void guardar(nueva);
    setElegida(nueva.id);
    setVentaNueva(false);
  }

  function onAgregarProductoACuenta(producto: ProductoALaVenta) {
    if (!actual) return;
    const nuevaLinea = lineaDeProducto(globalThis.crypto.randomUUID(), producto);
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
      esLineaDeMostrador(l) &&
      l.concept === item.concepto &&
      l.amount.minor === item.priceMinor;
    const suyas = actual.lines.filter(esDelItem);
    const objetivo = Math.max(0, Math.min(50, Math.trunc(cantidad)));
    if (objetivo === suyas.length) return;

    let lineas: AccountLineDto[];
    if (objetivo < suyas.length) {
      const fuera = new Set(suyas.slice(objetivo).map((l) => l.id));
      lineas = actual.lines.filter((l) => !fuera.has(l.id));
    } else {
      const producto = aLaVenta.find(
        (p) =>
          (item.productId ? p.id === item.productId : p.nombre === item.concepto) &&
          String(p.precio.amount) === item.priceMinor,
      );
      // Fail-closed: si ya no se vende, o su precio cambió, no se venden más a ESE precio.
      if (!producto) {
        avisar.info(
          `«${item.concepto}» cambió de precio o ya no se vende: añádelo desde la carta`,
        );
        return;
      }
      // Lo que no hay no se vende (ADR-023): el servidor lo rechazaría igual; aquí se dice antes.
      const piden = objetivo - suyas.length;
      if (producto.sinInventarioInicial) {
        avisar.error(`«${producto.nombre}» todavía no tiene inventario inicial`, {
          detalle: "Se vende cuando se cuente: Inventario → Entradas → Inventario inicial.",
        });
        return;
      }
      if (producto.existencia !== null && producto.existencia < piden) {
        avisar.error(
          producto.existencia === 0
            ? `«${producto.nombre}» se agotó`
            : `Solo ${producto.existencia === 1 ? "queda 1" : `quedan ${producto.existencia}`} de «${producto.nombre}»`,
          { detalle: "Lo que no hay no se vende: hay que cargar la entrada de mercancía." },
        );
        return;
      }
      const nuevas: AccountLineDto[] = Array.from(
        { length: objetivo - suyas.length },
        () =>
          lineaDeProducto(globalThis.crypto.randomUUID(), producto),
      );
      const ultima = actual.lines.findLastIndex(esDelItem);
      lineas =
        ultima < 0
          ? [...actual.lines, ...nuevas]
          : [
              ...actual.lines.slice(0, ultima + 1),
              ...nuevas,
              ...actual.lines.slice(ultima + 1),
            ];
    }

    if (!lineas.some((l) => !l.paid)) {
      if (puedeDescartarse(actual)) {
        descartar(actual.id);
        setElegida(null);
        avisar.info(
          `Orden ${numeroDeOrden(actual)} descartada: no quedaba nada por cobrar`,
        );
      }
      return;
    }
    guardar(
      FamilyAccountSchema.parse({
        ...actual,
        lines: lineas,
        status: "POR_COBRAR",
      }),
    );
  }

  return (
    <ALaVenta.Provider value={aLaVenta}>
    <VistaPrecios.Provider value={vistaPrecios}>
    <BuscadorDeLaCarta.Provider value={buscadorDeLaCarta}>
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sin cabecera visible: lo que decía («2 por cobrar · mostrador») ya está en
          la cola. El título sigue para los lectores de pantalla. */}
      <h1 className="sr-only">Caja</h1>
      {/* B6-14: el aviso suave de la cuenta del salón que pidió y sigue sin cobrar. */}
      <AvisosDelSalon para="CAJA" porLimpiar={porLimpiarPorId} />
      <Container
        as="main"
        ancho="muro"
        className={cn(
          "grid flex-1 gap-4 py-4 bajo:py-3",
          // Desde lg la caja se reparte el alto de la ventana y cada columna
          // se desplaza por dentro (§8.8). Por debajo, flujo normal.
          // En tablet vertical, dos columnas: la cola sobre la cuenta y el
          // cobro al lado, a todo el alto. En escritorio, tres.
          "md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] md:grid-rows-[auto_minmax(0,1fr)]",
          "md:bajo:grid-cols-[minmax(0,1fr)_minmax(30rem,35.5rem)]",
          "lg:grid-cols-[15rem_minmax(0,1fr)_clamp(352px,26vw,400px)] lg:grid-rows-[minmax(0,1fr)]",
          "lg:bajo:grid-cols-[minmax(0,1fr)_35.5rem] lg:bajo:grid-rows-[auto_minmax(0,1fr)]",
          "xl:bajo:grid-cols-[15rem_minmax(0,1fr)_35.5rem] xl:bajo:grid-rows-[minmax(0,1fr)]",
        )}
      >
        {/* Con la cola plegada (dos columnas), qué se ve a la izquierda: la cola
            o la cuenta. El mismo aspecto que «Plano | Atender» de mesas, a 56 px. */}
        <div
          role="radiogroup"
          aria-label="Qué ver"
          className="col-start-1 row-start-1 hidden w-full gap-1 rounded-[var(--radius-control)] bg-surface/70 p-1 md:flex lg:hidden lg:bajo:flex xl:bajo:hidden"
        >
          <button
            type="button"
            role="radio"
            aria-checked={vistaEfectiva === "cola"}
            onClick={() => setVista("cola")}
            className={cn(
              "flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[0.4rem] px-4 text-[14px] transition-colors",
              vistaEfectiva === "cola"
                ? "bg-brand font-semibold text-on-brand"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span>Por cobrar</span>
            {/* Si llega una cuenta mientras se ve otra, el contador lo dice en color de marca. */}
            <span
              className={cn(
                "tnum rounded-full px-2 py-0.5 text-[11px] font-semibold",
                vistaEfectiva === "cola"
                  ? "bg-on-brand/15 text-on-brand"
                  : recientes.size > 0
                    ? "bg-brand text-on-brand"
                    : "bg-base text-ink-3",
              )}
            >
              {porCobrar.length}
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={vistaEfectiva === "cuenta"}
            disabled={!actual && !ventaNueva}
            onClick={() => setVista("cuenta")}
            className={cn(
              "flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[0.4rem] px-4 text-[14px] transition-colors",
              vistaEfectiva === "cuenta"
                ? "bg-brand font-semibold text-on-brand"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {ventaNueva
              ? "Venta directa"
              : actual
                ? `Cuenta ${numeroDeOrden(actual)}`
                : "Cuenta"}
          </button>
        </div>
        <ColaCuentas
          className={cn(
            PLACEMENT_COLA,
            vistaEfectiva === "cuenta" && OCULTA_SI_PLEGADA,
          )}
          cuentas={visibles}
          total={porCobrar.length}
          actual={actual?.id ?? null}
          onElegir={elegirOtra}
          onNuevaVentaDirecta={() => antesDeSalir(onNuevaVentaDirecta)}
          onEntrada={puedeRegistrarEntrada ? () => antesDeSalir(() => abrirEntrada(null)) : null}
          onBuscarCliente={() => setBuscandoCliente(true)}
          ventaNueva={ventaNueva}
          puntoDeCobro={turno?.punto ?? null}
          recientes={recientes}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          filtro={filtro}
          onFiltro={setFiltro}
          buscando={buscando}
          onBuscando={setBuscando}
          buscadorRef={buscadorRef}
          onEscanear={alEscanear}
          ultimoCobro={
            ultimoRecibo
              ? {
                  orden: ultimoRecibo.orden,
                  total: ultimoRecibo.total,
                }
              : null
          }
          onVerRecibo={() => setViendoRecibo(true)}
          onVerAtajos={() => setViendoAtajos(true)}
          deudas={deudas}
          onCobrarDeuda={(d) => void cobrarLaDeuda(d)}
          porLimpiar={porLimpiar}
          onMesaLimpia={(m) =>
            void marcarLimpia(m.tableId).then((r) => (r.ok ? avisar.ok(`Mesa ${m.label} limpia y libre`) : avisar.error(r.mensaje)))
          }
        />
        {ventaNueva ? (
          <NuevaVentaDirecta
            aBolivares={aBolivares}
            onElegir={crearVentaDirecta}
            onCancelar={() => {
              setVentaNueva(false);
              setVista("cola");
            }}
            ocultoEnDosColumnas={vistaEfectiva === "cola"}
          />
        ) : actual && !turno ? (
          <SinTurno />
        ) : actual && fiscal.faltan.length > 0 ? (
          <SinImpuestos faltan={fiscal.faltan} />
        ) : actual && mediosDisponibles.length === 0 ? (
          <SinMediosDePago />
        ) : actual ? (
          <CobroCuenta
            key={actual.id}
            {...cobro}
            rules={fiscal.rules}
            igtfBasisPoints={fiscal.igtfBasisPoints}
            instanteFiscal={fiscal.instante}
            rate={rate}
            tasaValor={tasaVigente?.value ?? null}
            tasaId={tasaVigente?.id ?? null}
            maxRetained={maxRetained}
            cuenta={actual}
            lines={lineas}
            onCobrado={(r) => alCobrar(actual, r)}
            categoryOf={categoryOf}
            // La cuenta de un cumpleaños solo se cobra (B10-1): ni ítems, ni partes, ni cortesía, ni descuento.
            {...(actual.kind === "EVENTO"
              ? {}
              : ({
                  onAgregarProducto: onAgregarProductoACuenta,
                  onCambiarCantidad: onCambiarCantidadEnCuenta,
                  onDividir: (n) => guardar(n === 1 ? unirCuenta(actual) : dividirEn(actual, n)),
                  onCortesia: async (linea, motivo, detalle, autorizacion) => {
                    const r = await cortesiaEnServidor(
                      {
                        idempotencyKey: globalThis.crypto.randomUUID(),
                        accountId: actual.id,
                        version: actual.version ?? 0,
                        lineId: linea.id,
                        quitar: motivo === null,
                        ...(motivo ? { motivo } : {}),
                        ...(detalle ? { detalle } : {}),
                      },
                      autorizacion,
                    );
                    return r.ok ? null : r;
                  },
                  onDescuento: async (pedido, autorizacion) => {
                    const r = await descuentoEnServidor(
                      { idempotencyKey: globalThis.crypto.randomUUID(), accountId: actual.id, version: actual.version ?? 0, quitar: false, ...pedido },
                      autorizacion,
                    );
                    if (r.ok) avisar.ok(`Descuento aplicado: ${r.valor.descuento?.nombre ?? ""}`);
                    return r.ok ? null : r;
                  },
                  onQuitarDescuento: async () => {
                    const r = await descuentoEnServidor({ idempotencyKey: globalThis.crypto.randomUUID(), accountId: actual.id, version: actual.version ?? 0, quitar: true });
                    return r.ok ? null : r;
                  },
                } satisfies Partial<React.ComponentProps<typeof CobroCuenta>>))}
            ocultoEnDosColumnas={vistaEfectiva === "cola"}
          />
        ) : (
          <SinCuentas />
        )}
      </Container>
      <ReciboDialog
        recibo={viendoRecibo ? ultimoRecibo : null}
        copia={ultimaVenta ? ultimaVenta.prints.length > 0 : false}
        ventaId={ultimaVenta?.id}
        onImprimir={async () => {
          if (!ultimaVenta) return null;
          const r = await imprimir(ultimaVenta.id);
          return r.ok ? null : r.mensaje;
        }}
        onCerrar={() => setViendoRecibo(false)}
      />
      <AtajosDialog
        abierto={viendoAtajos}
        onCerrar={() => setViendoAtajos(false)}
      />
      <VentaSinCobrar
        cuenta={saliendo && actual ? actual : null}
        onCobrar={() => setSaliendo(null)}
        onDejarPendiente={async (cliente) => {
          if (!actual) return null;
          const r = await asignarCliente({ idempotencyKey: globalThis.crypto.randomUUID(), accountId: actual.id, cliente }).catch(() => null);
          if (!r) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la venta no se dejó pendiente. Vuelve a intentarlo." };
          if (!r.ok) return r;
          adoptarCuenta(r.valor);
          avisar.ok(`${numeroDeOrden(r.valor)} queda pendiente a nombre de ${r.valor.family}`, { detalle: "Sigue en la cola: se cobra cuando vuelva." });
          seguirSaliendo();
          return null;
        }}
        onDescartar={() => {
          if (actual) descartar(actual.id);
          seguirSaliendo();
        }}
      />
      <BuscadorDeClientes
        abierto={buscandoCliente}
        onCerrar={() => setBuscandoCliente(false)}
        // La caja abre lo que está por cobrar; lo demás (una mesa comiendo) se ve, pero no se cobra todavía.
        puedeAbrir={(c) => c.status === "POR_COBRAR"}
        alAbrirCuenta={(c) => {
          setBuscandoCliente(false);
          elegirOtra(c.id);
        }}
      />
      {puedeRegistrarEntrada && (
        <EntradaDesdeCaja
          abierto={entradaAbierta}
          pedido={pedidoDeEntrada}
          catalogo={catalogo}
          conTurno={turno !== null}
          onCerrar={() => setEntradaAbierta(false)}
          onRegistrada={(cuenta) => {
            // La cuenta la creó esta caja: no «llega» a la cola, se elige para cobrarla ya.
            creadasAqui.current.add(cuenta.id);
            setEntradaAbierta(false);
            setBusqueda("");
            setFiltro("TODAS");
            elegir(cuenta.id);
          }}
        />
      )}
    </div>
    </BuscadorDeLaCarta.Provider>
    </VistaPrecios.Provider>
    </ALaVenta.Provider>
  );
}

/**
 * La carta de mostrador: una rejilla táctil por categorías. La usan la venta
 * directa y «Añadir productos» de una cuenta abierta, así que vive una vez.
 */
/** Qué hacer con los medios que no traen datos que enseñar al cliente. */
const INDICACION_MEDIO: Readonly<Record<string, string>> = {
  EFECTIVO_VES: "Cuenta los bolívares, teclea lo recibido y pulsa «Añadir».",
  PDV_DEBITO:
    "Pasa la tarjeta por el monto exacto y confírmalo con «Cobrar exacto».",
  USDT: "Confirma la transferencia en la billetera antes de añadir el pago.",
};

/**
 * «Copiar» para los datos que el cliente teclea en su teléfono. Solo el icono,
 * con su nombre accesible y un `title`; al copiar pasa a un check verde y lo
 * anuncia a los lectores de pantalla.
 */
function BotonCopiar({
  copiado,
  onCopiar,
  que,
}: {
  copiado: boolean;
  onCopiar: () => void;
  que: string;
}) {
  return (
    <button
      type="button"
      onClick={onCopiar}
      aria-label={copiado ? `Copiados ${que}` : `Copiar ${que}`}
      title={copiado ? "Copiado" : "Copiar"}
      className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-2 transition-colors hover:bg-surface-2 hover:text-brand"
    >
      {copiado ? (
        <Check size={16} className="text-state-ok" aria-hidden="true" />
      ) : (
        <Copy size={16} aria-hidden="true" />
      )}
      <span aria-live="polite" className="sr-only">
        {copiado ? "Copiado" : ""}
      </span>
    </button>
  );
}

/**
 * Un botón del pie de la cuenta (B3-10, M-32): qué es, en chico, y debajo su estado («Consumidor final», «− 10 %»,
 * «Entre 3»). Con algo puesto lleva el color de marca, y el texto lo dice igual: no solo el color.
 */
function BotonDelPie({
  icono: Icono,
  etiqueta,
  tecla,
  activo,
  children,
  className,
  ...resto
}: {
  icono: typeof Users;
  etiqueta: string;
  /** Su atajo de teclado, si tiene. */
  tecla?: string;
  activo: boolean;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      {...resto}
      className={cn(
        "flex min-h-14 min-w-0 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[var(--radius-control)] border px-2.5 py-1 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-45",
        activo ? "border-brand/60 bg-brand/10" : "border-line bg-surface enabled:hover:border-line-strong",
        className,
      )}
    >
      <span className="flex w-full items-center gap-1 text-etiqueta font-semibold whitespace-nowrap text-ink-3 uppercase">
        <Icono className={cn("size-(--icono-etiqueta) shrink-0", activo && "text-brand")} aria-hidden="true" />
        {etiqueta}
        {/* En una cuenta angosta (la tablet) no hay teclado: la pista cede su sitio a la etiqueta. */}
        {tecla && (
          <span className="ml-auto normal-case @max-md/ticket:hidden">
            <PistaTecla tecla={tecla} />
          </span>
        )}
      </span>
      {/* Lo que no cabe en un renglón pasa al siguiente: ni se corta ni se mueve (T-15). */}
      <span className="w-full text-detalle leading-tight font-semibold break-words text-ink">{children}</span>
    </button>
  );
}

/** Columnas de la factura: cantidad, concepto, precio unitario e importe. */
const COLUMNAS =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_5.75rem] @md/ticket:grid-cols-[2.25rem_minmax(0,1fr)_5.25rem_5.75rem] items-baseline gap-x-3";

/** ¿Se vende ahora? Lo que nunca se contó (B9-7) y lo agotado (ADR-023), no: se ven al final, con su motivo. */
const seVendeAhora = (p: ProductoALaVenta): boolean => !p.sinInventarioInicial && disponible(p);

/** Por qué no se vende un producto que se intenta vender: lo dicen igual el lector, la carta y la fila de una cuenta. */
function avisarNoSeVende(p: ProductoALaVenta) {
  if (p.sinInventarioInicial) {
    avisar.error(`«${p.nombre}» todavía no tiene inventario inicial`, { detalle: "Se vende cuando se cuente: Inventario → Entradas → Inventario inicial." });
  } else {
    avisar.error(`«${p.nombre}» se agotó`, { detalle: "Lo que no hay no se vende: hay que cargar la entrada de mercancía." });
  }
}

/**
 * ¿Es lo que se busca? (B3-10). Por el nombre y la categoría, cada palabra en cualquier sitio y sin tildes ni
 * mayúsculas («agua min», «bebidas»); por el SKU o el código de barras, desde su comienzo («beb-00», «7591…»): un
 * «155» no trae el producto cuyo SKU es «PRU-0155».
 */
function coincide(p: ProductoALaVenta, consulta: string): boolean {
  const empieza = (codigo: string | null) => codigo !== null && nameKey(codigo).startsWith(consulta);
  if (empieza(p.sku) || empieza(p.codigoBarras)) return true;
  const donde = nameKey(`${p.nombre} ${p.categoria}`);
  return consulta.split(" ").every((palabra) => donde.includes(palabra));
}

/**
 * El buscador de la carta que está a la vista (B3-10). La «/» de la caja lo enfoca si se ve; si no, busca en la cola.
 * `enfocarAlMontar`: el primer producto de una venta directa, elegido desde el buscador, abre su cuenta con otra carta,
 * y esa carta vuelve a poner el cursor en su buscador para seguir tecleando.
 */
type RefDelBuscador = Readonly<{ campo: { current: HTMLInputElement | null }; enfocarAlMontar: { current: boolean } }>;
const BuscadorDeLaCarta = createContext<RefDelBuscador | null>(null);

/**
 * La carta de mostrador: una rejilla táctil por categorías. La usan la venta directa y «Añadir ítems» de una cuenta
 * abierta, así que vive una vez. Arriba, el buscador (B3-10, M-32): al teclear filtra en toda la carta y, al vaciarlo,
 * vuelve la categoría que estaba. Lo que no se vende ahora va al final, atenuado y con su motivo. La rejilla desplaza
 * dentro de su sitio: quien la usa le da el alto con `className`.
 */
function CartaMostrador({
  aBolivares,
  onElegir,
  className,
}: {
  aBolivares: FrozenRate | null;
  onElegir: (p: ProductoALaVenta) => void;
  /** El alto que le toca: la rejilla desplaza por dentro si no cabe. */
  className?: string;
}) {
  const aLaVenta = useContext(ALaVenta);
  const { vista, cambiar } = useContext(VistaPrecios);
  const buscador = useContext(BuscadorDeLaCarta);
  // Las pestañas salen de lo que se vende: una categoría existe si hay algo en ella (B9-1).
  const categorias = useMemo(
    () => ["Todos", ...categoriesOf(aLaVenta.map((p) => ({ category: p.categoria })))],
    [aLaVenta],
  );
  const [elegida, setCategoria] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const consulta = nameKey(busqueda);
  const buscando = consulta !== "";
  // Buscando, la carta entera: la categoría elegida espera y vuelve al borrar la búsqueda.
  const categoria = buscando ? "Todos" : categorias.includes(elegida) ? elegida : "Todos";
  const productos = buscando
    ? aLaVenta.filter((p) => coincide(p, consulta))
    : categoria === "Todos"
      ? aLaVenta
      : aLaVenta.filter((p) => nameKey(p.categoria) === nameKey(categoria));
  const seVenden = productos.filter(seVendeAhora);
  const noSeVenden = productos.filter((p) => !seVendeAhora(p));

  // El campo se anota en la caja para la «/»; si esta carta nace de una venta que empezó en el buscador, lo enfoca.
  const campo = useRef<HTMLInputElement | null>(null);
  const registrar = useCallback(
    (el: HTMLInputElement | null) => {
      if (buscador) {
        if (el) buscador.campo.current = el;
        else if (buscador.campo.current === campo.current) buscador.campo.current = null;
        if (el && buscador.enfocarAlMontar.current) {
          buscador.enfocarAlMontar.current = false;
          el.focus();
        }
      }
      campo.current = el;
    },
    [buscador],
  );

  /** Intro en el buscador: el primero que se vende. Si la venta nace aquí, su carta sigue con el cursor en el buscador. */
  function elegirElPrimero() {
    const primero = seVenden[0];
    if (!primero) {
      if (noSeVenden[0]) avisarNoSeVende(noSeVenden[0]);
      return;
    }
    if (buscador) {
      buscador.enfocarAlMontar.current = true;
      window.setTimeout(() => {
        buscador.enfocarAlMontar.current = false;
      }, 0);
    }
    onElegir(primero);
    setBusqueda("");
  }

  if (aLaVenta.length === 0) {
    return (
      <p
        role="status"
        className="rounded-[var(--radius-control)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-2"
      >
        No hay productos a la venta. Se cargan en Panel → Inventario → Productos.
      </p>
    );
  }

  const tarjeta = (p: ProductoALaVenta) => {
    const usd = p.precio;
    const bs = aBolivares ? convert(usd, aBolivares) : null;
    // Sin existencia no se vende (ADR-023): se ve, pero no se toca. Lo que nunca se contó (B9-7) dice eso,
    // no «agotado»: no se acabó, falta contarlo.
    const seVende = seVendeAhora(p);
    const sinContar = p.sinInventarioInicial;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => onElegir(p)}
        disabled={!seVende}
        aria-label={sinContar ? `${p.nombre}, sin inventario inicial` : !seVende ? `${p.nombre}, agotado` : undefined}
        title={sinContar ? "Sin inventario inicial: se vende cuando se cuente" : undefined}
        className={cn(
          "flex min-h-14 flex-col items-start justify-between rounded-[var(--radius-control)] border border-line bg-surface p-2 text-left transition-all",
          seVende
            ? "cursor-pointer hover:border-brand hover:bg-brand/10 active:scale-[0.98]"
            : "cursor-not-allowed border-dashed opacity-55",
        )}
      >
        <span className="flex w-full items-start justify-between gap-1.5">
          <span className="text-[12.5px] leading-tight font-bold text-ink">
            {p.nombre}
          </span>
          {p.existencia !== null && (
            <span
              className={cn(
                "tnum flex shrink-0 items-center gap-0.5 text-[10px] font-semibold whitespace-nowrap",
                seVende ? "text-ink-3" : "text-ink-2",
              )}
            >
              {sinContar ? <ClipboardList size={11} aria-hidden="true" /> : !seVende && <PackageX size={11} aria-hidden="true" />}
              {sinContar ? "Sin contar" : !seVende ? "Agotado" : `Quedan ${p.existencia}`}
            </span>
          )}
        </span>
        <span className="mt-1 flex w-full flex-wrap items-baseline justify-between gap-x-2">
          {/* En bolívares solos, sin tasa no hay precio que enseñar: se ve el de dólares (fail-closed: nada inventado). */}
          {vista === "VES" && bs ? (
            <span className="tnum text-xs font-bold text-brand">{formatMoneyVE(toMajor(bs), "VES")}</span>
          ) : (
            <span className="tnum text-xs font-bold text-brand">{formatMoneyVE(toMajor(usd), "USD")}</span>
          )}
          {vista === "AMBOS" && bs && (
            <span className="tnum text-[10px] font-medium text-ink-3">
              {formatMoneyVE(toMajor(bs), "VES")}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className={cn("@container/carta flex min-h-0 flex-col gap-2", className)}>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-(--icono-tablet) -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input
            ref={registrar}
            type="search"
            aria-label="Buscar en la carta"
            placeholder="Buscar producto o código"
            autoComplete="off"
            spellCheck={false}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (busqueda !== "") {
                  e.preventDefault();
                  setBusqueda("");
                } else e.currentTarget.blur();
                return;
              }
              // El Intro del lector de códigos ya lo canceló él (vende el producto leído): aquí, solo el de una persona.
              if (e.key !== "Enter" || e.defaultPrevented || !buscando) return;
              e.preventDefault();
              elegirElPrimero();
            }}
            className={cn(
              "min-h-14 w-full rounded-[var(--radius-control)] border border-line bg-surface pr-12 pl-9 text-cuerpo text-ink placeholder:text-ink-3",
              "focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand/40",
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
          {busqueda !== "" ? (
            <button
              type="button"
              aria-label="Borrar la búsqueda"
              onClick={() => {
                setBusqueda("");
                campo.current?.focus();
              }}
              className="absolute top-1/2 right-1 grid size-12 -translate-y-1/2 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-(--icono-tablet)" aria-hidden="true" />
            </button>
          ) : (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
              <PistaTecla tecla="/" />
            </span>
          )}
        </div>
        {/* La vista de precios (T-15, P-12): junto al buscador, recordada por este equipo. */}
        <div role="radiogroup" aria-label="Precios de la carta" className="flex shrink-0 gap-1 rounded-[var(--radius-control)] bg-surface-2 p-1">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={vista === v.id}
              aria-label={v.nombre}
              title={v.nombre}
              onClick={() => cambiar(v.id)}
              className={cn(
                "tnum min-h-12 cursor-pointer rounded-[calc(var(--radius-control)-2px)] px-2.5 text-xs font-bold whitespace-nowrap transition-colors",
                vista === v.id ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
              )}
            >
              {v.texto}
            </button>
          ))}
        </div>
      </div>
      <div
        role="group"
        aria-label="Categorías de mostrador"
        className="flex shrink-0 flex-wrap gap-1.5"
      >
        {categorias.map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={categoria === cat}
            onClick={() => {
              setBusqueda("");
              setCategoria(cat);
            }}
            className={cn(
              // 44 px y no los 56 del POS (M-32, decisión del usuario): con muchas categorías, cada renglón cuenta.
              "min-h-11 cursor-pointer rounded-[var(--radius-control)] px-3 text-xs font-semibold transition-colors",
              categoria === cat
                ? "bg-brand text-on-brand"
                : "border border-line/60 bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {cat}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={buscando ? `Productos que coinciden con «${busqueda.trim()}»` : `Productos de ${categoria}`}
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-1.5 overflow-y-auto overscroll-contain pr-1 @lg/carta:grid-cols-3"
      >
        {seVenden.map(tarjeta)}
        {noSeVenden.length > 0 && (
          <h3 className="col-span-full mt-1 flex items-center gap-1.5 border-t border-line/60 pt-2 text-etiqueta font-semibold text-ink-3 uppercase first:mt-0 first:border-t-0 first:pt-0">
            <PackageX className="size-(--icono-etiqueta)" aria-hidden="true" />
            No se venden ahora · <span className="tnum">{noSeVenden.length}</span>
          </h3>
        )}
        {noSeVenden.map(tarjeta)}
        {productos.length === 0 && (
          <p role="status" className="col-span-full flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-dashed border-line px-4 py-5 text-center text-detalle text-ink-2">
            Nada en la carta coincide con «{busqueda.trim()}».
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                campo.current?.focus();
              }}
              className="min-h-12 cursor-pointer font-semibold text-brand underline-offset-2 hover:underline"
            >
              Borrar la búsqueda
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/** Venta directa antes del primer producto: la carta y nada cobrado. */
function NuevaVentaDirecta({
  aBolivares,
  onElegir,
  onCancelar,
  ocultoEnDosColumnas,
}: {
  aBolivares: FrozenRate | null;
  onElegir: (p: ProductoALaVenta) => void;
  onCancelar: () => void;
  ocultoEnDosColumnas?: boolean;
}) {
  return (
    <>
      <section
        aria-label="Nueva venta directa"
        className={cn(
          "flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-brand/40 bg-surface shadow-card @container/ticket",
          PLACEMENT_TICKET,
          ocultoEnDosColumnas && OCULTA_SI_PLEGADA,
        )}
      >
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-bold text-ink">
            Venta directa
          </h2>
          <p className="text-[12.5px] text-ink-3">
            Toca el primer producto: la venta nace con él. Nada se cobra antes.
          </p>
        </div>
        {/* En el teléfono la carta tiene su alto y desplaza por dentro; desde md ocupa lo que le deja la tarjeta. */}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <CartaMostrador
            aBolivares={aBolivares}
            onElegir={onElegir}
            className="max-h-[70svh] flex-1 md:max-h-none"
          />
        </div>
      </section>
      <aside
        className={cn(
          "flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 py-10 text-center",
          PLACEMENT_COBRO,
        )}
      >
        <ShoppingBag size={28} className="text-ink-3" aria-hidden="true" />
        <p className="font-display text-lg font-bold text-ink">
          El cobro aparece al elegir
        </p>
        <p className="max-w-xs text-[13px] text-ink-2">
          Con el primer producto se abre la cuenta de mostrador y su cobro.
        </p>
        <Button surface="pos" variant="neutral" onClick={onCancelar}>
          Cancelar la venta
        </Button>
      </aside>
    </>
  );
}

/** La clave de un ítem de mostrador: lo que se vende, a qué precio y de qué producto. */
type ItemDeMostrador = Readonly<{ concepto: string; priceMinor: string; productId?: string }>;

/** Lo que la caja vende ahora (B9-1), para la carta y para sumar unidades a una fila. */
const ALaVenta = createContext<readonly ProductoALaVenta[]>([]);

/** Cómo enseña los precios la carta en este equipo (T-15, P-12), y cómo cambiarlo. */
type VistaDePrecios = "USD" | "VES" | "AMBOS";
const VistaPrecios = createContext<{ vista: VistaDePrecios; cambiar: (v: VistaDePrecios) => void }>({ vista: "AMBOS", cambiar: () => undefined });
const VISTAS: readonly { id: VistaDePrecios; texto: string; nombre: string }[] = [
  { id: "USD", texto: "$", nombre: "Precios en dólares" },
  { id: "VES", texto: "Bs", nombre: "Precios en bolívares" },
  { id: "AMBOS", texto: "$ · Bs", nombre: "Precios en dólares y en bolívares" },
];

/**
 * Una línea de mostrador para la cuenta. COPIA el concepto, el precio y el trato del IVA del
 * producto: si mañana cambia el precio del catálogo, lo vendido hoy no cambia (B9-1).
 */
function lineaDeProducto(id: string, producto: ProductoALaVenta): AccountLineDto {
  return {
    id,
    concept: producto.nombre,
    kind: "RESTAURANTE",
    amount: { minor: String(producto.precio.amount), currency: "USD" },
    paid: false,
    productId: producto.id,
    taxCode: producto.taxCode,
  };
}

type Fila = Readonly<{
  clave: string;
  concepto: string;
  precio: Money;
  cantidad: number;
  /** El ítem editable, o `null` si la fila es algo ya consumido. */
  item: ItemDeMostrador | null;
  lineIds: string[];
  cortesia?: CortesiaDto;
  /** Anulada en producción (F6-14): quién lo autorizó. No se cobra ni se regala. */
  anulada?: string;
  /**
   * Cambiada por uso al salir antes de tiempo (B4-6): los minutos que estuvo. No se cobra ni se regala;
   * la cobra la línea del paquete que cubre, que va debajo.
   */
  porUso?: number;
}>;

/** Agrupa las líneas por ítem de mostrador, en el orden en que apareció cada uno. */
function agruparFilas(
  lines: readonly DocumentLine[],
  cuenta: FamilyAccountDto,
): Fila[] {
  const filas = new Map<string, Fila>();
  for (const l of lines) {
    const linea = cuenta.lines.find((x) => x.id === l.id);
    const deMostrador = linea !== undefined && esLineaDeMostrador(linea);
    const clave = deMostrador
      ? `mostrador|${l.description}|${l.unitPrice.amount}`
      : l.id;
    const previa = filas.get(clave);
    filas.set(clave, {
      clave,
      concepto: l.description,
      precio: l.unitPrice,
      cantidad: (previa?.cantidad ?? 0) + Number(l.quantity),
      item: deMostrador
        ? {
            concepto: l.description,
            priceMinor: String(l.unitPrice.amount),
            ...(linea.productId ? { productId: linea.productId } : {}),
          }
        : null,
      lineIds: [...(previa?.lineIds ?? []), l.id],
    });
  }

  // Líneas regaladas, anuladas o cambiadas por uso: se muestran en el ticket con su importe tachado,
  // no se agrupan. Lo que se cobra lo dice `lines` (`chargeableLines`); esto solo lo enseña.
  for (const l of cuenta.lines) {
    if ((l.cortesia || l.anulacion || l.porUso) && !l.paid && !l.movedTo) {
      filas.set(l.id, {
        clave: l.id,
        concepto: l.concept,
        precio: money(
          BigInt(l.amount.minor),
          l.amount.currency as CurrencyCode,
        ),
        cantidad: 1,
        item: null, // Una cortesía ya no se edita en cantidad
        lineIds: [l.id],
        ...(l.cortesia ? { cortesia: l.cortesia } : {}),
        ...(l.anulacion ? { anulada: l.anulacion.autorizadaPor.name } : {}),
        ...(l.porUso ? { porUso: l.porUso.minutos } : {}),
      });
    }
  }

  // Mantener el orden original en el que aparecen en la cuenta
  return [...filas.values()].sort((a, b) => {
    const idxA = cuenta.lines.findIndex((x) => x.id === a.lineIds[0]);
    const idxB = cuenta.lines.findIndex((x) => x.id === b.lineIds[0]);
    return idxA - idxB;
  });
}

/**
 * Las alícuotas con las que se cobra ahora (B2-2), del calendario que manda el servidor.
 *
 * El instante sale de la hora del servidor y avanza con el reloj del equipo, redondeado al minuto
 * hacia arriba: un cambio programado para hoy rige desde que se programa, y uno programado para
 * mañana entra a la medianoche sin recargar. Si falta alguno, `faltan` lo dice y no se cobra.
 */
function useImpuestosVigentes(impuestos: ImpuestosDto, serverNow: number) {
  const periodos = useMemo(
    () =>
      taxTimeline(
        impuestos.vigencias.map((v) => ({
          id: v.id,
          kind: v.impuesto,
          code: v.code,
          basisPoints: v.basisPoints,
          effectiveFrom: Date.parse(v.desde),
          scheduledAt: Date.parse(v.programadaEl),
        })),
      ),
    [impuestos],
  );
  // El desfase con el servidor, el que midió la sala al recibir su última lectura (B4-13); sin sala, el de la página.
  const [desfaseDeLaPagina] = useState(() => serverNow - Date.now());
  const desfase = useSala().hora?.desfase ?? desfaseDeLaPagina;
  const ahora = useAhoraLocal();
  const instante = ahora === 0 ? serverNow : Math.ceil((ahora + desfase) / 60_000) * 60_000;
  return useMemo(() => {
    const faltan = missingTaxesAt(periodos, instante);
    return {
      faltan,
      rules: ivaRulesOf(periodos),
      igtfBasisPoints: faltan.length > 0 ? 0 : igtfAt(periodos, instante),
      instante,
    };
  }, [periodos, instante]);
}

/**
 * Sin turno abierto no se cobra — F4-01, B3-1, fail-closed. El servidor también lo exige al
 * asentar el cobro; aquí se dice antes de que la cajera teclee nada, y dónde se arregla.
 */
function SinTurno() {
  return (
    <section
      role="alert"
      className={cn(
        "flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-state-crit/50 bg-surface/50 px-6 py-10 text-center",
        PLACEMENT_SIN_CUENTAS,
      )}
    >
      <TriangleAlert size={32} className="text-state-crit" aria-hidden="true" />
      <p className="font-display text-xl font-bold text-ink">La caja no cobra: no hay turno abierto</p>
      <p className="max-w-sm text-[14px] leading-relaxed text-ink-2">
        Abre el turno de este equipo con el fondo de la gaveta. Todo lo que se cobre queda en ese turno y en su día.
      </p>
      <Link
        href="/turno"
        className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
      >
        Abrir el turno
      </Link>
    </section>
  );
}

/**
 * Sin impuestos vigentes no se cobra — B2-2, fail-closed. Suponer un 0 % sería vender sin IVA o
 * sin retener el IGTF en silencio. Es configuración: la pantalla dice dónde se arregla.
 */
function SinImpuestos({ faltan }: { faltan: readonly string[] }) {
  return (
    <section
      role="alert"
      className={cn(
        "flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-state-crit/50 bg-surface/50 px-6 py-10 text-center",
        PLACEMENT_SIN_CUENTAS,
      )}
    >
      <TriangleAlert size={32} className="text-state-crit" aria-hidden="true" />
      <p className="font-display text-xl font-bold text-ink">La caja no cobra: faltan impuestos</p>
      <p className="max-w-sm text-[14px] leading-relaxed text-ink-2">
        No hay alícuota vigente de {faltan.join(", ")}. Sin ella no se calcula el ticket: nunca se
        supone un 0 %.
      </p>
      <Link
        href="/panel/ajustes/impuestos"
        className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
      >
        Configurar los impuestos
      </Link>
    </section>
  );
}

/**
 * Sin medios de pago no se cobra — F4-02, fail-closed.
 *
 * Pasa cuando se apagan todos desde el panel o cuando al único que queda le
 * faltan sus datos. Es una situación de configuración, así que la pantalla
 * dice dónde se arregla en vez de dejar a la cajera mirando una columna vacía.
 */
function SinMediosDePago() {
  return (
    <section
      className={cn(
        "flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-state-warn/50 bg-surface/50 px-6 py-10 text-center",
        PLACEMENT_SIN_CUENTAS,
      )}
    >
      <TriangleAlert size={32} className="text-state-warn" aria-hidden="true" />
      <p className="font-display text-xl font-bold text-ink">
        No hay medios de pago
      </p>
      <p className="max-w-sm text-[14px] leading-relaxed text-ink-2">
        Están todos apagados, o al que queda le faltan sus datos. Sin un medio
        que ofrecer no se puede cobrar nada.
      </p>
      <Link
        href="/panel/ajustes/medios"
        className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
      >
        Configurar los medios de pago
      </Link>
    </section>
  );
}

function SinCuentas() {
  // Cargando lo anotado en papel (B3-7): las cuentas por cobrar nacen de las entradas que se cargan, no de la
  // entrada de ahora. Se vuelve a la carga, no a una pantalla que registraría a la hora de hoy.
  const modoPapel = useModoPapel();
  if (modoPapel) {
    return (
      <section
        className={cn(
          "flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 py-10 text-center",
          PLACEMENT_SIN_CUENTAS,
        )}
      >
        <CircleCheckBig size={32} className="text-state-ok" aria-hidden="true" />
        <p className="font-display text-xl font-bold text-ink">Nada por cobrar</p>
        <p className="max-w-sm text-[14px] leading-relaxed text-ink-2">
          Las cuentas por cobrar del papel salen de las entradas que cargas. Si falta una, cárgala primero; si es una venta de mostrador, usa «Venta directa».
        </p>
        <Link
          href="/papel"
          className="mt-2 flex min-h-14 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
        >
          Volver a la carga
        </Link>
      </section>
    );
  }
  return (
    <section
      className={cn(
        "flex min-h-[16rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong/60 bg-surface/50 px-6 py-10 text-center",
        PLACEMENT_SIN_CUENTAS,
      )}
    >
      <CircleCheckBig size={32} className="text-state-ok" aria-hidden="true" />
      <p className="font-display text-xl font-bold text-ink">Nada por cobrar</p>
      <p className="max-w-sm text-[14px] leading-relaxed text-ink-2">
        Las cuentas llegan aquí desde la entrada, cuando la familia paga al
        entrar, y desde la salida, cuando queda algo pendiente.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link
          href="/monitor"
          className="flex min-h-14 items-center rounded-[var(--radius-control)] border border-line px-4 text-[13.5px] text-ink-2 no-underline transition-colors hover:border-brand/45 hover:text-ink"
        >
          Ir al parque
        </Link>
      </div>
    </section>
  );
}
