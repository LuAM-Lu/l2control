/**
 * El libro de pagos en el servidor — B2-3, §5.5, F3-09, F3-10.
 *
 * Asentar añade los asientos de una operación (un cobro: sus pagos, su vuelto, su propina, su
 * residuo), todos o ninguno; revertir añade un asiento con el signo contrario. Nada se reescribe
 * (I-09, la tabla lo impone). Quién decide qué:
 *  · el dominio (`@l2/domain-cash`): qué asiento es válido, cómo es su reversión, cuándo no se
 *    puede revertir y cuál es el saldo;
 *  · la matriz: asentar es `documento.emitir` (DEC-25: la caja cobra); revertir es `cobro.anular`,
 *    con 🔐 para supervisión y caja (DEC-24), registrado ANTES de ejecutar;
 *  · este archivo: la tasa congelada y el IGTF los pone el servidor, la clave de idempotencia hace
 *    que un doble clic devuelva lo mismo (I-11), y todo va en una transacción con su asiento.
 *
 * Todo asiento entra en el turno abierto del equipo (B3-1): sin él no se cobra ni se revierte.
 *
 * El medio de cada asiento es del catálogo del local (B3-2): de él salen su moneda, si da vuelto,
 * si lleva IGTF y qué datos pide. Un cobro con un medio apagado, o al que le faltan los datos del
 * local, no se asienta. Los datos del pago (referencia, TxID, titular) se guardan cifrados, con una
 * huella que reconoce una referencia ya cobrada, y al leer el libro solo salen enmascarados (§7.6).
 *
 * El documento es una cuenta (B3-3, la base lo impone). Que el cobro cuadre contra su total y que
 * la tasa citada siga rigiendo lo comprueba el cobro de la cuenta (`caja/cuentas.ts`), que asienta
 * con `asentarEn` y revierte con `revertirAsientoEn` dentro de su propia transacción.
 */
import {
  AsentarPagosCommandSchema,
  DatosDePagoSchema,
  LibroDocumentoSchema,
  RevertirPagoCommandSchema,
  claveDeReferencia,
  enmascararDatos,
  problemasDe,
  type AsentarPagosCommand,
  type AsientoDto,
  type DatosDePagoDto,
  type LibroDocumentoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import {
  entryProblem,
  ledgerBalance,
  offerProblem,
  reversalOf,
  reversalProblem,
  type CollectionReadiness,
  type LedgerEntry,
  type LedgerKind,
  type LedgerMethodSpec,
  type PaymentDataKind,
} from "@l2/domain-cash";
import { money, zero, type CurrencyCode, type FrozenRate, type Money } from "@l2/domain-money";
import { frozenRateOf } from "@l2/domain-rates";
import { NoIgtfRuleError, computeIgtf, igtfAt, taxTimeline } from "@l2/domain-tax";
import { errorDeBase, type Base, type CashShift, type Payment, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { programadaDeFila } from "./impuestos.ts";
import { turnoParaCobrar } from "../caja/turnos.ts";
import type { Cifrador } from "../identidad/cifrado.ts";

/** La moneda funcional del local (DEC: USD). Se hará ajuste de la sucursal con B4-4. */
const FUNCIONAL: CurrencyCode = "USD";

export interface CasosPagos {
  /**
   * Asienta los asientos de una operación, todos o ninguno. Con la misma clave devuelve lo que
   * ya se asentó, sin asentar nada nuevo (un doble clic produce un solo cobro).
   */
  asentar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<LibroDocumentoDto>>;
  /**
   * Revierte un asiento con otro de signo contrario (F3-10). `autorizacion` es la del 🔐 cuando
   * quien lo pide no puede anular por sí mismo.
   */
  revertir(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<LibroDocumentoDto>>;
  /** El libro de un documento con su saldo, calculado. */
  libro(ctx: Contexto, documentId: string): Promise<Resultado<LibroDocumentoDto>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});

const sinClave: Rechazo = {
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: "Este servidor no puede guardar los datos del pago (falta L2_CLAVE_CIFRADO): cobra con un medio que no los pida.",
};

export function casosPagos(base: Base, cifrador: Cifrador | null): CasosPagos {
  const leerLibro = (tx: Transaccion, documentId: string) => leerLibroEn(tx, documentId, cifrador);

  return {
    async asentar(ctx, entrada, ahora = Date.now()) {
      const v = AsentarPagosCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cobro no se asentó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const huellas = huellasDe(cmd.asientos, cifrador);
      if ("ok" in huellas) return huellas;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<LibroDocumentoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
          if (rechazo) return rechazo;

          const previas = await yaAsentado(tx, cmd.idempotencyKey);
          if (previas.length > 0) return mismaOperacion(previas, cmd, huellas) ? leerLibro(tx, cmd.documentId) : conflictoDeClave;

          const filas = await asentarEn(tx, ctx, cmd, huellas, cifrador, ahora);
          if ("ok" in filas) return filas;
          return leerLibro(tx, cmd.documentId);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pago.asentar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos envíos con la misma clave a la vez (el doble clic de verdad): el segundo tropieza con
        // la unicidad al insertar. Se vuelve a mirar: lo que asentó el primero es la respuesta.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async revertir(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = RevertirPagoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El asiento no se revirtió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese asiento no existe en este local." };

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<LibroDocumentoDto | Rechazo> => {
          // Quien no puede anular ni pidiéndolo no llega a mirar nada.
          const p = await permisoEn(tx, ctx, "cobro.anular");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          // Un doble clic devuelve lo ya revertido sin volver a pedir el PIN de quien autoriza.
          const previas = await yaAsentado(tx, cmd.idempotencyKey);
          if (previas.length > 0) {
            return previas[0]!.reversesId === cmd.paymentId ? leerLibro(tx, previas[0]!.documentId) : conflictoDeClave;
          }
          // DEC-24: la autorización se comprueba y se registra ANTES de tocar el libro.
          // El dinero vuelve desde la gaveta de este equipo: hace falta su turno abierto.
          const turno = await turnoParaCobrar(tx, ctx);
          if ("ok" in turno) return turno;
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cobro.anular", autorizacion, ahora);
          if (!permiso.ok) return permiso;

          const original = await tx.payment.findUnique({ where: { id: cmd.paymentId } });
          if (!original) return noExiste;
          const problema = await problemaDeReversion(tx, original);
          if (problema === "YA_REVERTIDO") return { ok: false, motivo: "CONFLICTO", mensaje: "Ese asiento ya se revirtió." };
          if (problema === "ES_UNA_REVERSION") {
            return invalido("Una reversión no se revierte: si hay que volver a cobrar, es un cobro nuevo.", ["paymentId"], problema);
          }

          await revertirAsientoEn(tx, ctx, {
            original,
            turno,
            operationKey: cmd.idempotencyKey,
            line: 0,
            motivo: cmd.motivo,
            detalle: cmd.detalle ?? null,
            autorizadoPor: permiso.autorizadoPor,
            ahora,
          });
          return leerLibro(tx, original.documentId);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pago.revertir", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos reversiones a la vez: la base deja una sola. Si la otra es esta misma operación (un
        // doble clic), se devuelve; si no, este asiento ya se revirtió.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async libro(ctx, documentId) {
      if (!UUID.test(documentId)) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese documento no existe." };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<LibroDocumentoDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "documento.emitir");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        return leerLibro(tx, documentId);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}

/**
 * Las huellas de los datos de cada asiento (§7.6), o el rechazo: sin clave no se cobra con un medio
 * que pida datos, y la misma referencia no puede ir dos veces en un cobro.
 */
export function huellasDe(
  asientos: readonly Readonly<{ datos?: DatosDePagoDto | undefined }>[],
  cifrador: Cifrador | null,
): (string | null)[] | Rechazo {
  // Los datos del pago se guardan cifrados y se reconocen por su huella (§7.6): sin clave no se
  // cobra con un medio que los pida.
  if (asientos.some((a) => a.datos) && !cifrador) return sinClave;
  const huellas = asientos.map((a) => {
    const clave = a.datos ? claveDeReferencia(a.datos) : null;
    return clave && cifrador ? cifrador.huella(clave) : null;
  });
  const repetida = huellas.findIndex((h, i) => h !== null && huellas.indexOf(h) !== i);
  if (repetida >= 0) {
    return invalido("La misma referencia está dos veces en este cobro.", ["asientos", repetida, "datos"], "Referencia repetida");
  }
  return huellas;
}

/**
 * Asienta los asientos de una operación dentro de `tx`, todos o ninguno: el turno abierto del
 * equipo, la tasa congelada, el medio del catálogo, la referencia no cobrada antes y el IGTF del
 * instante. El permiso y la idempotencia los pone quien llama (el libro o el cobro de una cuenta).
 */
export async function asentarEn(
  tx: Transaccion,
  ctx: Contexto,
  cmd: AsentarPagosCommand,
  huellas: readonly (string | null)[],
  cifrador: Cifrador | null,
  ahora: number,
): Promise<Payment[] | Rechazo> {
  // Sin turno abierto en el equipo no se cobra (F4-01); el asiento dice en qué turno entró.
  const turno = await turnoParaCobrar(tx, ctx);
  if ("ok" in turno) return turno;

  // La tasa congelada: la cita quien cobra; su valor lo copia el servidor de la base.
  const tasas = new Map<string, { value: string; frozen: FrozenRate }>();
  for (const [i, a] of cmd.asientos.entries()) {
    if (!a.rateId || tasas.has(a.rateId)) continue;
    const t = await tx.exchangeRate.findUnique({ where: { id: a.rateId }, include: { confirmation: true } });
    if (!t || t.pair !== "USD/VES") return invalido("Esa tasa no existe en este local.", ["asientos", i, "rateId"], "Tasa desconocida");
    // ADR-005 y F3-05: con una tasa sin confirmar no se cobra.
    if (!t.confirmation) return invalido("Esa tasa no está confirmada: con ella no se cobra.", ["asientos", i, "rateId"], "Tasa sin confirmar");
    tasas.set(a.rateId, { value: t.value, frozen: frozenRateOf({ pair: "USD/VES", value: t.value }) });
  }

  // El medio de cada asiento, del catálogo del local; y lo que la caja puede ofrecer hoy.
  const catalogo = await catalogoDe(tx, ctx.branchId);
  const nuevos: Nuevo[] = [];
  for (const [i, a] of cmd.asientos.entries()) {
    const medio = catalogo.medios.get(a.method);
    if (!medio) return invalido("Ese medio no existe en este local.", ["asientos", i, "method"], "Medio desconocido");
    nuevos.push({
      kind: a.kind as LedgerKind,
      medio,
      amount: money(BigInt(a.amount.minor), a.amount.currency),
      rate: a.rateId ? tasas.get(a.rateId)! : null,
      datos: a.datos ?? null,
    });
  }
  for (const [i, n] of nuevos.entries()) {
    const problema = entryProblem({ kind: n.kind, amount: n.amount, rate: n.rate?.frozen ?? null, dataKind: n.datos?.kind ?? null }, n.medio);
    if (problema) return invalido("El cobro no se asentó: hay un asiento que no vale.", ["asientos", i], problema);
    if (n.kind === "COBRO") {
      const oferta = offerProblem(n.medio, catalogo.listo);
      if (oferta) {
        const mensaje = oferta === "APAGADO" ? `«${n.medio.label}» está apagado: no se cobra con él.` : `A «${n.medio.label}» le faltan los datos del local: no se cobra con él.`;
        return invalido(mensaje, ["asientos", i, "method"], oferta);
      }
    }
    if (n.datos?.kind === "PUNTO" && !catalogo.terminales.has(n.datos.terminalId)) {
      return invalido("Ese terminal no está vigente en esta sucursal.", ["asientos", i, "datos", "terminalId"], "Terminal desconocido");
    }
  }

  // Una referencia ya cobrada no se cobra otra vez: el mismo capture de Pago Móvil enseñado
  // en dos cobros. El candado por huella ordena a dos cajas que lo intenten a la vez.
  for (const [i, h] of huellas.entries()) {
    if (!h) continue;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${h}, 0))::text AS candado`;
    const ya = await tx.payment.findFirst({ where: { referenceDigest: h, reversesId: null, reversedBy: { none: {} } }, select: { businessDate: true } });
    if (ya) {
      return {
        ok: false,
        motivo: "CONFLICTO",
        mensaje: `Esa referencia ya se cobró el ${ya.businessDate.toISOString().slice(0, 10)}. Revisa el pago con el cliente.`,
        problemas: [{ path: ["asientos", i, "datos"], message: "Referencia ya cobrada" }],
      };
    }
  }

  // El IGTF de cada cobro en un medio que lo lleva (§5.5), con la alícuota del instante. Sin
  // ella no se cobra en esos medios: suponer 0 % sería no retener en silencio.
  let igtfBps: number | null = null;
  if (nuevos.some((n) => n.kind === "COBRO" && n.medio.triggersIgtf)) {
    const periodos = taxTimeline((await tx.taxRate.findMany({ where: { tax: "IGTF" } })).map(programadaDeFila));
    try {
      igtfBps = igtfAt(periodos, ahora);
    } catch (e) {
      if (!(e instanceof NoIgtfRuleError)) throw e;
      return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "No hay IGTF vigente: no se cobra en divisas hasta configurarlo en Impuestos." };
    }
  }

  const quien = await nombreDe(tx, ctx);
  const filas: Payment[] = [];
  for (const [i, n] of nuevos.entries()) {
    const igtf = igtfDe(n.kind, n.medio, n.amount, igtfBps);
    filas.push(
      await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          documentId: cmd.documentId,
          shiftId: turno.id,
          // ADR-009: el día de negocio lo pone el turno, no la hora del cobro.
          businessDate: turno.businessDate,
          operationKey: cmd.idempotencyKey,
          line: i,
          kind: n.kind,
          method: n.medio.code,
          currency: n.amount.currency,
          amountMinor: n.amount.amount,
          igtfMinor: igtf.amount,
          rateId: cmd.asientos[i]!.rateId ?? null,
          rateValue: n.rate?.value ?? null,
          // §7.6: cifrados; la huella reconoce la referencia sin guardarla en claro.
          referenceCipher: n.datos ? cifrador!.cifrar(JSON.stringify(n.datos)) : null,
          referenceDigest: huellas[i] ?? null,
          terminalId: n.datos?.kind === "PUNTO" ? n.datos.terminalId : null,
          recordedAt: new Date(ahora),
          recordedBy: ctx.quien?.userId ?? null,
          recordedByName: quien.nombre,
          deviceId: ctx.quien?.deviceId ?? null,
        },
      }),
    );
  }
  await auditar(tx, ctx, {
    action: "pago.asentar",
    entityType: "payment",
    entityId: filas[0]!.id,
    after: { documentId: cmd.documentId, operationKey: cmd.idempotencyKey, asientos: filas.map(resumen) },
  });
  return filas;
}

/** El libro de un documento con su saldo, dentro de una transacción ya abierta. */
export async function leerLibroEn(tx: Transaccion, documentId: string, cifrador: Cifrador | null): Promise<LibroDocumentoDto> {
  return libroDe(documentId, await tx.payment.findMany({ where: { documentId }, orderBy: [{ recordedAt: "asc" }, { line: "asc" }] }), cifrador);
}

/** Lo ya asentado con esta clave, si lo hay. */
export function yaAsentado(tx: Transaccion, operationKey: string) {
  return tx.payment.findMany({ where: { operationKey }, orderBy: { line: "asc" } });
}

/** Por qué no se puede revertir `original` en este libro, o `null`. */
export async function problemaDeReversion(tx: Transaccion, original: Payment) {
  const delDocumento = await tx.payment.findMany({ where: { documentId: original.documentId } });
  return reversalProblem(entrada_(original), delDocumento.map(entrada_));
}

/**
 * Añade la reversión de `original` (F3-10) dentro de `tx`: lo mismo con el signo contrario, en el
 * turno de este equipo, con su motivo y quién la autorizó. Lo que decide si se puede (el permiso,
 * la autorización, `problemaDeReversion`) lo comprueba quien llama.
 */
export async function revertirAsientoEn(
  tx: Transaccion,
  ctx: Contexto,
  r: Readonly<{
    original: Payment;
    turno: CashShift;
    operationKey: string;
    line: number;
    motivo: string;
    detalle: string | null;
    autorizadoPor: string | null;
    ahora: number;
  }>,
): Promise<Payment> {
  const { original, turno } = r;
  const rev = reversalOf(entrada_(original));
  const quien = await nombreDe(tx, ctx);
  const autorizador = r.autorizadoPor
    ? await tx.staffUser.findUnique({ where: { id: r.autorizadoPor }, select: { fullName: true } })
    : null;
  const fila = await tx.payment.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: original.branchId,
      documentId: original.documentId,
      shiftId: turno.id,
      businessDate: turno.businessDate,
      operationKey: r.operationKey,
      line: r.line,
      kind: rev.kind,
      method: rev.method,
      currency: rev.amount.currency,
      amountMinor: rev.amount.amount,
      igtfMinor: rev.igtf.amount,
      rateId: original.rateId,
      rateValue: original.rateValue,
      reversesId: original.id,
      reason: r.motivo,
      reasonDetail: r.detalle,
      recordedAt: new Date(r.ahora),
      recordedBy: ctx.quien?.userId ?? null,
      recordedByName: quien.nombre,
      deviceId: ctx.quien?.deviceId ?? null,
      authorizedBy: r.autorizadoPor,
      authorizedByName: autorizador?.fullName ?? null,
    },
  });
  await auditar(tx, ctx, {
    action: "pago.revertir",
    entityType: "payment",
    entityId: original.id,
    ...(r.autorizadoPor ? { authorizedBy: r.autorizadoPor } : {}),
    reason: r.motivo,
    before: resumen(original),
    after: { reversion: resumen(fila), detalle: r.detalle },
  });
  return fila;
}

export const conflictoDeClave: Rechazo = {
  ok: false,
  motivo: "CONFLICTO",
  mensaje: "Esa clave ya se usó para otra operación. Vuelve a intentarlo desde la pantalla.",
};

/** Un asiento por asentar, con su medio del catálogo. */
type Nuevo = {
  kind: LedgerKind;
  medio: LedgerMethodSpec;
  amount: Money;
  rate: { value: string; frozen: FrozenRate } | null;
  datos: DatosDePagoDto | null;
};

/** El catálogo del local, los terminales vigentes de la sucursal y qué datos del local hay. */
export async function catalogoDe(tx: Transaccion, branchId: string) {
  const [medios, terminales, datos] = await Promise.all([
    tx.paymentMethod.findMany(),
    tx.posTerminal.findMany({ where: { branchId, retiredAt: null }, select: { id: true } }),
    tx.collectionDetails.findMany({ select: { kind: true }, distinct: ["kind"] }),
  ]);
  const listo: CollectionReadiness = {
    pagoMovil: datos.some((d) => d.kind === "PAGO_MOVIL"),
    zelle: datos.some((d) => d.kind === "ZELLE"),
    terminals: terminales.length,
  };
  return {
    medios: new Map<string, LedgerMethodSpec>(
      medios.map((m) => [
        m.code,
        {
          code: m.code,
          label: m.label,
          currency: m.currency as CurrencyCode,
          givesChange: m.givesChange,
          triggersIgtf: m.triggersIgtf,
          dataKind: m.dataKind as PaymentDataKind | null,
          active: m.active,
        },
      ]),
    ),
    terminales: new Set(terminales.map((t) => t.id)),
    listo,
  };
}

/** ¿Lo ya asentado con la clave es exactamente lo que se pide ahora? */
function mismaOperacion(filas: readonly Payment[], cmd: AsentarPagosCommand, huellas: readonly (string | null)[]): boolean {
  return (
    filas.length === cmd.asientos.length &&
    filas.every((f, i) => {
      const a = cmd.asientos[i]!;
      return (
        f.documentId === cmd.documentId &&
        f.reversesId === null &&
        f.kind === a.kind &&
        f.method === a.method &&
        f.currency === a.amount.currency &&
        f.amountMinor === BigInt(a.amount.minor) &&
        f.rateId === (a.rateId ?? null) &&
        (f.referenceCipher !== null) === (a.datos !== undefined) &&
        f.referenceDigest === (huellas[i] ?? null) &&
        f.terminalId === (a.datos?.kind === "PUNTO" ? a.datos.terminalId : null)
      );
    })
  );
}

/** El IGTF de un asiento: solo un cobro en un medio que lo lleva (§5.5), según el catálogo. */
function igtfDe(kind: LedgerKind, medio: LedgerMethodSpec, amount: Money, bps: number | null): Money {
  if (kind !== "COBRO" || !medio.triggersIgtf || bps === null) return zero(amount.currency);
  const r = computeIgtf([{ method: { code: medio.code, label: medio.label, currency: medio.currency, triggersIgtf: true }, amount }], bps, amount.currency);
  return r.lines[0]?.igtf ?? zero(amount.currency);
}

/** La fila, como la entiende el dominio. */
function entrada_(f: Payment): LedgerEntry {
  return {
    id: f.id,
    kind: f.kind as LedgerKind,
    method: f.method,
    amount: money(f.amountMinor, f.currency as CurrencyCode),
    igtf: money(f.igtfMinor, f.currency as CurrencyCode),
    rate: f.rateValue ? frozenRateOf({ pair: "USD/VES", value: f.rateValue }) : null,
    reversesId: f.reversesId,
  };
}

/** Lo que va a la auditoría de un asiento: sin los datos del pago, ni cifrados (§7.6). */
function resumen(f: Payment) {
  return {
    id: f.id,
    kind: f.kind,
    method: f.method,
    amountMinor: String(f.amountMinor),
    currency: f.currency,
    igtfMinor: String(f.igtfMinor),
    rateValue: f.rateValue,
    conDatos: f.referenceCipher !== null,
    terminalId: f.terminalId,
  };
}

/** Los datos del pago enmascarados: lo único de una referencia que sale del servidor (§7.6). */
function referenciaDe(f: Payment, cifrador: Cifrador | null): string | null {
  if (!f.referenceCipher) return null;
  if (!cifrador) return "Datos cifrados";
  return enmascararDatos(DatosDePagoSchema.parse(JSON.parse(cifrador.descifrar(f.referenceCipher))));
}

const dinero = (m: Money) => ({ minor: String(m.amount), currency: m.currency });

/** El libro de un documento en la forma del contrato, con su saldo calculado. */
function libroDe(documentId: string, filas: readonly Payment[], cifrador: Cifrador | null): LibroDocumentoDto {
  const saldo = ledgerBalance(filas.map(entrada_), FUNCIONAL);
  const asientos: AsientoDto[] = filas.map((f) => ({
    id: f.id,
    documentId: f.documentId,
    kind: f.kind as AsientoDto["kind"],
    method: f.method,
    amount: { minor: String(f.amountMinor), currency: f.currency as AsientoDto["amount"]["currency"] },
    igtf: { minor: String(f.igtfMinor), currency: f.currency as AsientoDto["igtf"]["currency"] },
    rate: f.rateId && f.rateValue ? { id: f.rateId, value: f.rateValue } : null,
    referencia: referenciaDe(f, cifrador),
    reversesId: f.reversesId,
    reversedById: filas.find((x) => x.reversesId === f.id)?.id ?? null,
    motivo: (f.reason as AsientoDto["motivo"]) ?? null,
    detalle: f.reasonDetail,
    recordedAt: f.recordedAt.toISOString(),
    businessDate: f.businessDate.toISOString().slice(0, 10),
    recordedBy: f.recordedByName,
    authorizedBy: f.authorizedByName,
  }));
  return LibroDocumentoSchema.parse({
    documentId,
    asientos,
    cobrado: dinero(saldo.collected),
    vuelto: dinero(saldo.changeOut),
    propina: dinero(saldo.tip),
    residuo: dinero(saldo.retained),
    aplicado: dinero(saldo.applied),
    igtf: dinero(saldo.igtf),
  });
}
