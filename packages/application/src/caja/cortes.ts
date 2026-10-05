/**
 * El cierre del turno y de la jornada en el servidor — B3-5, F4-05 a F4-08, JORNADA §3 a §5, D-JOR.
 *
 * Todo sale del libro del turno: lo cobrado por medio, lo que debería haber en la gaveta y las
 * excepciones (anulaciones, cortesías, reimpresiones, residuos, incobrables y la diferencia del
 * arqueo). Quién decide qué:
 *  · el dominio (`@l2/domain-cash`): la gaveta esperada (`tallyShift`), el cuadre (`reconcile`), la
 *    diferencia en dólares con la tasa del turno y quién firma el Z (`zSigner`), lo que se deja y se
 *    retira, y qué cuenta impide cerrar la jornada (`isPendingAtClose`);
 *  · la matriz: el corte X es `turno.corteX`; contar y sellar, `turno.corteZ` (la cajera firma dentro
 *    del umbral con su PIN; por encima, supervisión con 🔐 y una justificación); cerrar el turno de
 *    otro equipo, solo quien tiene `turno.corteZ` sin autorización (supervisión, administración);
 *  · este archivo: que el arqueo sea a ciegas (la diferencia se dice después de contar), que el Z se
 *    niegue si hubo dinero después del conteo, y que el sello, su foto y el turno cerrado vayan en
 *    una transacción. Después del Z nada toca el turno (la base lo impone).
 */
import {
  ArqueoCommandSchema,
  ArqueoSchema,
  ComprobacionAperturaSchema,
  CorteSchema,
  CorteXCommandSchema,
  CorteZCommandSchema,
  FamilyAccountSchema,
  PendientesDelCierreSchema,
  ResumenDelDiaSchema,
  problemasDe,
  type ArqueoDto,
  type ComprobacionAperturaDto,
  type CorteDto,
  type ExcepcionDto,
  type MoneyDto,
  type MovimientoPorMedioDto,
  type PendientesDelCierreDto,
  type Rechazo,
  type Resultado,
  type ResumenDelDiaDto,
} from "@l2/contracts";
import {
  countDenominations,
  countDifferenceInUsd,
  isPendingAtClose,
  ledgerMovements,
  leftInDrawerProblem,
  offeredMethods,
  reconcile,
  tallyShift,
  withdrawn,
  zSigner,
  type PaymentDataKind,
  type ShiftLedgerEntry,
  type ZSigner,
} from "@l2/domain-cash";
import { add, money, zero, type CurrencyCode } from "@l2/domain-money";
import { calendarDay, frozenRateOf, rateOfDay } from "@l2/domain-rates";
import { missingTaxesAt, taxTimeline } from "@l2/domain-tax";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { confirmarPinPropio, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { programadaDeFila } from "../dinero/impuestos.ts";
import { catalogoDe, conflictoDeClave } from "../dinero/pagos.ts";
import { historialParaCobrar } from "../dinero/tasas.ts";
import { ajustesDe, zonaDe } from "../sucursal/ajustes.ts";
import { estanciasActivas } from "../park/parque.ts";
import { pendienteDe, periodosDeImpuestos } from "./cuentas.ts";
import { TEXTO_MOTIVO_DESCUENTO } from "./reglas-de-descuento.ts";
import { encolarCorteEn } from "../impresion/impresion.ts";
import { turnoDto, turnoSinCorteDe, type ConFondos } from "./turnos.ts";
import { dinero, gavetaDe, libroDelTurno, type Libro } from "./gaveta.ts";

const FUNCIONAL: CurrencyCode = "USD";

/** El umbral del arqueo antes de que fuera un ajuste de la sucursal (B4-4): $ 1,00 (M-13). */
const UMBRAL_ANTES_DE_LOS_AJUSTES = 100n;

export interface CasosCortes {
  /** Cómo va el turno (el del equipo, u otro para quien ve la sucursal), sin la gaveta: el arqueo es a ciegas. */
  vista(ctx: Contexto, turnoId?: string, ahora?: number): Promise<Resultado<CorteDto>>;
  /** El corte X (`CorteXCommandSchema`): el informe del turno con su gaveta. Se repite; no cambia el turno. */
  corteX(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CorteDto>>;
  /** Registra el conteo de la gaveta (`ArqueoCommandSchema`) y, ya contado, dice la diferencia. */
  arquear(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ArqueoDto>>;
  /**
   * Sella el turno con el corte Z (`CorteZCommandSchema`). `autorizacion` es el PIN de quien firma: la
   * cajera dentro del umbral, supervisión (🔐) por encima.
   */
  corteZ(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<CorteDto>>;
  /** El último corte Z de este equipo, para enseñarlo después de cerrar. */
  ultimoZ(ctx: Contexto): Promise<CorteDto | null>;
  /**
   * Lo que impide cerrar la jornada: cuentas por cobrar, niños en sala, huérfanas y turnos de otros
   * equipos abiertos. `turnoId` es el que se va a cerrar (el del equipo si no se dice).
   */
  pendientes(ctx: Contexto, turnoId?: string, ahora?: number): Promise<Resultado<PendientesDelCierreDto>>;
  /** Lo que falta para trabajar al abrir el turno (JORNADA §3, A3). */
  comprobarApertura(ctx: Contexto, ahora?: number): Promise<ComprobacionAperturaDto>;
  /** El resumen del día de negocio de hoy, para Inicio (JORNADA §5, C6). */
  resumenDelDia(ctx: Contexto, ahora?: number): Promise<Resultado<ResumenDelDiaDto>>;
}

const noExiste = (turnoId?: string): Rechazo => ({
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: turnoId ? "Ese turno no existe en esta sucursal." : "Este equipo no tiene turno abierto.",
});
const sellado: Rechazo = { ok: false, motivo: "CONFLICTO", mensaje: "Ese turno ya tiene corte Z: nada lo toca." };
const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas: [{ path, message }] });

const TEXTO_CORTESIA: Record<string, string> = {
  INVITACION: "Invitación de la casa",
  ERROR_DE_COCINA: "Error de cocina o merma",
  CONSUMO_DE_PERSONAL: "Consumo de personal",
  OTRO: "Otro",
};
const TEXTO_ANULACION: Record<string, string> = {
  ERROR_EN_COBRO: "Error en el cobro",
  CLIENTE_DESISTIO: "El cliente desistió",
  NO_ENTREGADO: "No se entregó lo cobrado",
  OTRO: "Otro",
};
const TEXTO_INCOBRABLE: Record<string, string> = { SE_FUE_SIN_PAGAR: "Se fue sin pagar", NO_PUEDE_PAGAR: "No puede pagar", OTRO: "Otro" };
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;

/** El turno al que va la operación: el del equipo si no se dice otro, de esta sucursal. */
async function turnoObjetivo(tx: Transaccion, ctx: Contexto, turnoId?: string): Promise<{ turno: ConFondos; propio: boolean } | Rechazo> {
  const t = turnoId
    ? await tx.cashShift.findUnique({ where: { id: turnoId }, include: { floats: true } })
    : ctx.quien?.deviceId
      ? await turnoSinCorteDe(tx, ctx.quien.deviceId)
      : null;
  if (!t || t.branchId !== ctx.branchId) return noExiste(turnoId);
  return { turno: t, propio: t.deviceId === ctx.quien?.deviceId };
}

/**
 * Quien puede hacer `accion` sobre ese turno: en el suyo, sin denegar; en el de otro equipo, solo
 * quien ve la sucursal y la tiene permitida sin autorización (cerrar un turno ajeno es de
 * supervisión, JORNADA §5; una cajera tampoco saca el X de otra caja).
 */
async function puedeSobre(tx: Transaccion, ctx: Contexto, accion: Action, propio: boolean): Promise<Rechazo | null> {
  const p = await permisoEn(tx, ctx, accion);
  if (p === "DENEGADO") return rechazoDePermiso(p);
  if (!propio && (p !== "PERMITIDO" || (await permisoEn(tx, ctx, "reportes.verSucursal")) === "DENEGADO")) {
    return { ok: false, motivo: "NO_PERMITIDO", mensaje: "El turno de otro equipo lo ve y lo cierra supervisión." };
  }
  return null;
}


function porMedioDe(libro: Libro): MovimientoPorMedioDto[] {
  return tallyShift(ledgerMovements(libro.entradas)).byMethod.map((m) => ({
    methodCode: m.methodCode,
    label: libro.medio.get(m.methodCode)?.label ?? m.methodCode,
    currency: m.currency as MovimientoPorMedioDto["currency"],
    enGaveta: m.inDrawer,
    cobrado: dinero(m.charged),
    neto: dinero(m.total),
  }));
}


/** Las ventas del turno y sus excepciones (F4-08), con quién, cuándo, por qué y quién autorizó. */
async function ventasYExcepciones(tx: Transaccion, t: ConFondos, hasta: Date) {
  const ventas = await tx.sale.findMany({ where: { shiftId: t.id }, include: { prints: true, voids: true }, orderBy: { closedAt: "asc" } });
  const excepciones: ExcepcionDto[] = [];
  let total = zero(FUNCIONAL);
  let anuladas = 0;
  let desdePapel = 0;
  for (const v of ventas) {
    const c = v.content as {
      lineas: { lineId: string; concept: string; amount: MoneyDto; cortesia: string | null }[];
      sobra: { amount: MoneyDto; destino: string } | null;
      total: MoneyDto;
      descuento?: { origen: string; nombre: string; motivo: string | null; detalle: string | null; autorizadoPor: { name: string } | null; importe: MoneyDto } | null;
      desdePapel?: { cargaId: string } | null;
    };
    const anulada = v.voids[0];
    if (c.desdePapel) desdePapel += 1;
    if (anulada) anuladas += 1;
    else total = add(total, money(v.totalMinor, FUNCIONAL));
    const regaladas = c.lineas.filter((l) => l.cortesia);
    if (regaladas.length > 0) {
      // Quién autorizó cada cortesía está en la cuenta como quedó al cobrarse.
      const version = await tx.accountVersion.findFirst({ where: { operationKey: v.operationKey } });
      const lineas = ((version?.content as { lines?: { id: string; cortesia?: { autorizadaPor?: { name?: string }; en?: string } }[] } | null)?.lines ?? []);
      for (const l of regaladas) {
        const cortesia = lineas.find((x) => x.id === l.lineId)?.cortesia;
        excepciones.push({
          at: cortesia?.en ?? v.closedAt.toISOString(),
          tipo: "CORTESIA",
          detalle: `Orden ${orden(v.orderNumber)} · ${l.concept}`.slice(0, 160),
          usuario: v.cashierName,
          motivo: TEXTO_CORTESIA[l.cortesia!] ?? l.cortesia!,
          autorizadoPor: cortesia?.autorizadaPor?.name ?? null,
          importe: l.amount,
        });
      }
    }
    // El descuento del cobro (B3-6), con su motivo y quién lo autorizó (el VIP lo ampara su marca).
    if (c.descuento) {
      const d = c.descuento;
      const porque =
        d.origen === "VIP" ? "Familia VIP" : d.origen === "MEDIO" ? "Pago por su medio" : d.motivo ? (TEXTO_MOTIVO_DESCUENTO[d.motivo] ?? d.motivo) : "Administración";
      excepciones.push({
        at: v.closedAt.toISOString(),
        tipo: "DESCUENTO",
        detalle: `Orden ${orden(v.orderNumber)} · ${d.nombre}`.slice(0, 160),
        usuario: v.cashierName,
        motivo: `${porque}${d.detalle ? ` · ${d.detalle}` : ""}`.slice(0, 280),
        autorizadoPor: d.autorizadoPor?.name ?? null,
        importe: d.importe,
      });
    }
    if (c.sobra?.destino === "RESIDUO") {
      excepciones.push({
        at: v.closedAt.toISOString(),
        tipo: "RESIDUO",
        detalle: `Orden ${orden(v.orderNumber)}`,
        usuario: v.cashierName,
        motivo: "Redondeo que quedó en caja",
        autorizadoPor: null,
        importe: c.sobra.amount,
      });
    }
    for (const p of v.prints.filter((x) => x.copy)) {
      excepciones.push({
        at: p.printedAt.toISOString(),
        tipo: "REIMPRESION",
        detalle: `Copia del recibo ${orden(v.orderNumber)}`,
        usuario: p.printedByName,
        motivo: "Reimpresión",
        autorizadoPor: null,
        importe: null,
      });
    }
    if (anulada) {
      excepciones.push({
        at: anulada.voidedAt.toISOString(),
        tipo: "ANULACION",
        detalle: `Orden ${orden(v.orderNumber)}`,
        usuario: anulada.requestedByName,
        motivo: `${TEXTO_ANULACION[anulada.reason] ?? anulada.reason}${anulada.note ? ` · ${anulada.note}` : ""}`.slice(0, 280),
        autorizadoPor: anulada.authorizedByName,
        importe: c.total,
      });
    }
  }
  // Las cuentas que se dieron por incobrables desde este equipo mientras el turno estaba abierto.
  const incobrables = await tx.accountVersion.findMany({
    where: { cause: "INCOBRABLE", deviceId: t.deviceId, savedAt: { gte: t.openedAt, lte: hasta } },
    // En el orden en que se marcaron (el id es uuid v7: desempata las del mismo instante). Sin orden, el
    // reporte del Z las enseñaba cada vez de una forma.
    orderBy: [{ savedAt: "asc" }, { id: "asc" }],
  });
  for (const i of incobrables) {
    const asiento = await tx.auditEntry.findFirst({ where: { action: "cuenta.incobrable", entityId: i.accountId }, orderBy: { occurredAt: "desc" } });
    const despues = (asiento?.after ?? {}) as { orderNumber?: number; family?: string; pendiente?: MoneyDto; detalle?: string | null; autorizadoPor?: string };
    excepciones.push({
      at: i.savedAt.toISOString(),
      tipo: "INCOBRABLE",
      detalle: `${despues.orderNumber ? `Orden ${orden(despues.orderNumber)} · ` : ""}${despues.family ?? ""}`.slice(0, 160),
      usuario: i.savedByName,
      motivo: `${TEXTO_INCOBRABLE[asiento?.reason ?? ""] ?? asiento?.reason ?? ""}${despues.detalle ? ` · ${despues.detalle}` : ""}`.slice(0, 280),
      autorizadoPor: despues.autorizadoPor ?? null,
      importe: despues.pendiente ?? null,
    });
  }
  // Lo cargado desde papel es una excepción del turno (B3-7): sale en el corte y en el resumen del día con su
  // responsable y, si ya la revisó supervisión, con quién. Una descartada no cargó nada: no cuenta.
  const cargas = await tx.paperLoad.findMany({ where: { shiftId: t.id, status: { not: "DESCARTADA" } }, orderBy: { openedAt: "asc" } });
  for (const l of cargas) {
    const registros = await tx.paperLoadItem.findMany({ where: { loadId: l.id }, select: { kind: true, detail: true } });
    const cobrado = registros.reduce((acc, r) => {
      const d = r.detail as { total?: MoneyDto };
      return r.kind === "COBRO" && d.total ? add(acc, money(BigInt(d.total.minor), FUNCIONAL)) : acc;
    }, zero(FUNCIONAL));
    excepciones.push({
      at: l.openedAt.toISOString(),
      tipo: "PAPEL",
      detalle: `Carga desde papel · ${registros.length} ${registros.length === 1 ? "registro" : "registros"}`,
      usuario: l.openedByName,
      motivo: `${l.note ?? "Sin conexión"} · ${l.status === "REVISADA" ? "Revisada" : "Sin revisar"}`.slice(0, 280),
      autorizadoPor: l.reviewedByName,
      importe: cobrado.amount > 0n ? dinero(cobrado) : null,
    });
  }
  excepciones.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { ventas: { cantidad: ventas.length, anuladas, total: dinero(total), desdePapel }, excepciones };
}

/** La foto del turno en `ahora`: con la gaveta (X y Z) o sin ella (la vista, que es a ciegas). */
async function foto(tx: Transaccion, t: ConFondos, tipo: CorteDto["tipo"], conGaveta: boolean, hechoPor: string, ahora: number) {
  const libro = await libroDelTurno(tx, t.id);
  const { ventas, excepciones } = await ventasYExcepciones(tx, t, t.closedAt ?? new Date(ahora));
  return {
    id: null,
    tipo,
    hechoEn: new Date(ahora).toISOString(),
    hechoPor,
    turno: turnoDto(t),
    porMedio: porMedioDe(libro),
    gaveta: conGaveta ? gavetaDe(t, libro) : null,
    ventas: { ...ventas, igtf: dinero(libro.igtf) },
    excepciones,
    arqueo: null,
    cierre: null,
  } satisfies CorteDto;
}

/** La tasa del turno (D-JOR): la que rige en su día de negocio, de bolívares a dólares. */
async function tasaDelTurno(tx: Transaccion, t: ConFondos, ahora: number) {
  const { registros, feriados } = await historialParaCobrar(tx);
  const r = rateOfDay(registros, "USD/VES", t.businessDate.toISOString().slice(0, 10), new Date(ahora).toISOString(), feriados);
  return r ? { id: r.id, value: r.value, aDolares: frozenRateOf(r) } : null;
}

type ConteoGuardado = { minor: string; currency: string }[];
const aDinero = (x: { minor: string; currency: string }) => money(BigInt(x.minor), x.currency as CurrencyCode);

function arqueoDto(c: {
  id: string;
  shiftId: string;
  countedAt: Date;
  countedByName: string;
  counted: unknown;
  expected: unknown;
  differences: unknown;
  differenceUsdMinor: bigint | null;
  signer: string;
  thresholdUsdMinor: bigint | null;
}): ArqueoDto {
  return ArqueoSchema.parse({
    id: c.id,
    turnoId: c.shiftId,
    contadoEn: c.countedAt.toISOString(),
    contadoPor: c.countedByName,
    contado: c.counted,
    esperado: c.expected,
    diferencias: c.differences,
    diferenciaEnDolares: c.differenceUsdMinor === null ? null : { minor: String(c.differenceUsdMinor), currency: FUNCIONAL },
    // El umbral con que se decidió; los conteos de antes de B4-4 se decidieron con $ 1,00 (M-13).
    umbral: { minor: String(c.thresholdUsdMinor ?? UMBRAL_ANTES_DE_LOS_AJUSTES), currency: FUNCIONAL },
    firma: c.signer,
  });
}

/**
 * Lo que impide cerrar la jornada (JORNADA §5, C2): las cuentas pendientes de la sucursal, los niños
 * en sala, las huérfanas sin cerrar y los turnos abiertos de otros equipos.
 */
async function pendientesEn(tx: Transaccion, ctx: Contexto, excepto: string | null, ahora: number): Promise<PendientesDelCierreDto> {
  const filas = await tx.$queryRaw<{ version: number; content: unknown }[]>`
    SELECT ultima.version, ultima.content FROM (
      SELECT DISTINCT ON (v.account_id) v.version, v.content, v.status
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${ctx.branchId}::uuid
      ORDER BY v.account_id, v.version DESC
    ) ultima
    WHERE ultima.status IN ('ABIERTA', 'POR_COBRAR')`;
  const periodos = await periodosDeImpuestos(tx);
  const ivaIncluido = (await ajustesDe(tx, ctx.branchId)).preciosConIva;
  const cuentas = filas
    .map((f) => FamilyAccountSchema.parse({ ...(f.content as object), version: f.version }))
    .filter(isPendingAtClose)
    .map((c) => ({
      id: c.id,
      orderNumber: c.orderNumber!,
      kind: c.kind,
      family: c.family,
      status: c.status,
      pendiente: dinero(pendienteDe(c, periodos, ahora, () => null, ivaIncluido)),
      version: c.version!,
    }))
    .sort((a, b) => a.orderNumber - b.orderNumber);
  const turnos = await tx.cashShift.findMany({
    where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" }, ...(excepto ? { id: { not: excepto } } : {}) },
    include: { floats: true },
    orderBy: { openedAt: "asc" },
  });
  const { enSala, huerfanas } = await estanciasActivas(tx, ctx.branchId, ahora);
  // Lo cargado desde papel que nadie revisó (B3-7): abierto o terminado, pero sin revisar. Incluye el del turno
  // que se va a cerrar: sin revisar, tampoco se sella.
  const sinRevisar = await tx.paperLoad.findMany({ where: { branchId: ctx.branchId, status: { in: ["ABIERTA", "CERRADA"] } }, orderBy: { openedAt: "asc" } });
  const papel: PendientesDelCierreDto["papel"] = [];
  for (const c of sinRevisar) {
    const turno = await tx.cashShift.findUniqueOrThrow({ where: { id: c.shiftId }, select: { pointLabel: true } });
    papel.push({
      id: c.id,
      punto: turno.pointLabel,
      estado: c.status as "ABIERTA" | "CERRADA",
      abiertaPor: c.openedByName,
      desde: c.windowFrom.toISOString(),
      hasta: c.windowTo.toISOString(),
      registros: await tx.paperLoadItem.count({ where: { loadId: c.id } }),
    });
  }
  return PendientesDelCierreSchema.parse({ cuentas, ninos: enSala, huerfanas, turnos: turnos.map(turnoDto), papel });
}

/** «2 cuentas pendientes y 1 niño en sala»: lo que falta, para el rechazo del cierre. */
function textoDePendientes(p: PendientesDelCierreDto): string | null {
  const cuantos = (n: number, uno: string, varios: string) => (n === 0 ? null : `${n} ${n === 1 ? uno : varios}`);
  const partes = [
    cuantos(p.cuentas.length, "cuenta pendiente", "cuentas pendientes"),
    cuantos(p.ninos.length, "niño en sala", "niños en sala"),
    cuantos(p.huerfanas.length, "estancia huérfana sin cerrar", "estancias huérfanas sin cerrar"),
    cuantos(p.turnos.length, "turno abierto en otro equipo", "turnos abiertos en otros equipos"),
    cuantos(p.papel.length, "carga desde papel sin revisar", "cargas desde papel sin revisar"),
  ].filter((x): x is string => x !== null);
  if (partes.length === 0) return null;
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

export function casosCortes(base: Base): CasosCortes {
  return {
    async vista(ctx, turnoId, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CorteDto | Rechazo> => {
        const o = await turnoObjetivo(tx, ctx, turnoId);
        if ("ok" in o) return o;
        const p = await permisoEn(tx, ctx, o.propio ? "documento.emitir" : "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        return CorteSchema.parse(await foto(tx, o.turno, "VISTA", false, quien.nombre, ahora));
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async corteX(ctx, entrada, ahora = Date.now()) {
      const v = CorteXCommandSchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se hizo el corte X.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CorteDto | Rechazo> => {
        const o = await turnoObjetivo(tx, ctx, v.data.turnoId);
        if ("ok" in o) return o;
        const rechazo = await puedeSobre(tx, ctx, "turno.corteX", o.propio);
        if (rechazo) return rechazo;
        if (o.turno.status === "CERRADO_Z") return sellado;
        const quien = await nombreDe(tx, ctx);
        // Lo que debería haber en la gaveta solo lo ve quien ve la sucursal: la cajera lo sabe después
        // de contar, o el arqueo deja de ser a ciegas (JORNADA §1).
        const conGaveta = (await permisoEn(tx, ctx, "reportes.verSucursal")) !== "DENEGADO";
        const corte = CorteSchema.parse(await foto(tx, o.turno, "X", conGaveta, quien.nombre, ahora));
        const fila = await tx.shiftCut.create({
          data: {
            tenantId: ctx.tenantId,
            shiftId: o.turno.id,
            kind: "X",
            madeAt: new Date(ahora),
            madeBy: ctx.quien?.userId ?? null,
            madeByName: quien.nombre,
            deviceId: ctx.quien?.deviceId ?? null,
            content: corte,
          },
        });
        await auditar(tx, ctx, { action: "turno.corte_x", entityType: "cash_shift", entityId: o.turno.id, after: { corte: fila.id, ventas: corte.ventas.cantidad } });
        return { ...corte, id: fila.id };
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "turno.corte_x", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async arquear(ctx, entrada, ahora = Date.now()) {
      const v = ArqueoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El conteo no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ArqueoDto | Rechazo> => {
        const o = await turnoObjetivo(tx, ctx, cmd.turnoId);
        if ("ok" in o) return o;
        const rechazo = await puedeSobre(tx, ctx, "turno.corteZ", o.propio);
        if (rechazo) return rechazo;
        if (o.turno.status === "CERRADO_Z") return sellado;

        // Lo contado, sumando billetes (F4-07); y solo ahora, lo que dice el libro.
        const contado = cmd.conteos.map((c) =>
          countDenominations(
            c.billetes.map((b) => ({ denomination: money(BigInt(b.denominacion.minor), c.currency), count: b.cantidad })),
            c.currency,
          ),
        );
        const gaveta = gavetaDe(o.turno, await libroDelTurno(tx, o.turno.id));
        const lineas = reconcile(contado.map((m) => ({ currency: m.currency, counted: m, expected: aDinero(gaveta.find((g) => g.currency === m.currency)!.esperado) })));
        const tasa = await tasaDelTurno(tx, o.turno, ahora);
        const diferencia = countDifferenceInUsd(lineas, tasa?.aDolares ?? null);
        // El umbral del arqueo es del local (B4-4) y queda escrito en el conteo con su firma.
        const umbral = money(BigInt((await ajustesDe(tx, ctx.branchId)).umbralArqueo.minor), FUNCIONAL);
        const firma: ZSigner = zSigner(diferencia, umbral);
        const quien = await nombreDe(tx, ctx);
        const fila = await tx.shiftCount.create({
          data: {
            tenantId: ctx.tenantId,
            shiftId: o.turno.id,
            countedAt: new Date(ahora),
            countedBy: ctx.quien?.userId ?? null,
            countedByName: quien.nombre,
            deviceId: ctx.quien?.deviceId ?? null,
            counts: cmd.conteos,
            counted: lineas.map((l) => dinero(l.counted)),
            expected: lineas.map((l) => dinero(l.expected)),
            differences: lineas.map((l) => dinero(l.difference)),
            differenceUsdMinor: diferencia?.amount ?? null,
            rateId: tasa?.id ?? null,
            rateValue: tasa?.value ?? null,
            signer: firma,
            thresholdUsdMinor: umbral.amount,
          },
        });
        await auditar(tx, ctx, {
          action: "turno.arqueo",
          entityType: "cash_shift",
          entityId: o.turno.id,
          after: { arqueo: fila.id, diferencias: lineas.map((l) => dinero(l.difference)), enDolares: diferencia ? dinero(diferencia) : null, firma },
        });
        return arqueoDto(fila);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "turno.arqueo", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async corteZ(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = CorteZCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El turno no se cerró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CorteDto | Rechazo> => {
          // Un doble clic devuelve el corte ya hecho, sin volver a pedir el PIN.
          const previo = await tx.shiftCut.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previo) return previo.shiftId === cmd.turnoId ? { ...CorteSchema.parse(previo.content), id: previo.id } : conflictoDeClave;

          const o = await turnoObjetivo(tx, ctx, cmd.turnoId);
          if ("ok" in o) return o;
          const rechazo = await puedeSobre(tx, ctx, "turno.corteZ", o.propio);
          if (rechazo) return rechazo;
          if (o.turno.status === "CERRADO_Z") return sellado;

          // El Z se hace con el último conteo, y solo si el libro sigue diciendo lo que decía al contar.
          const conteo = await tx.shiftCount.findUnique({ where: { id: cmd.arqueoId } });
          if (!conteo || conteo.shiftId !== o.turno.id) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese conteo no es de este turno." };
          const ultimo = await tx.shiftCount.findFirst({ where: { shiftId: o.turno.id }, orderBy: [{ countedAt: "desc" }, { id: "desc" }] });
          if (ultimo?.id !== conteo.id) return { ok: false, motivo: "CONFLICTO", mensaje: "Hay un conteo más reciente: cierra con ese." };
          const libro = await libroDelTurno(tx, o.turno.id);
          const ahoraEsperado = gavetaDe(o.turno, libro).map((g) => g.esperado);
          if (JSON.stringify(ahoraEsperado) !== JSON.stringify(conteo.expected)) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Entró o salió dinero después de contar: vuelve a contar la gaveta." };
          }

          // Lo que queda en la gaveta: no más de lo contado. Lo demás se retira.
          const contado = (conteo.counted as ConteoGuardado).map(aDinero);
          const queda = cmd.quedaEnGaveta.map(aDinero);
          const problemaQueda = leftInDrawerProblem(contado, queda);
          if (problemaQueda) return invalido("Lo que queda en la gaveta no cuadra con lo contado.", ["quedaEnGaveta"], problemaQueda);

          // Lo cargado desde papel en este turno se revisa antes del Z (B3-7, V-12): es dinero y niños que la
          // cajera pasó del formulario al sistema, y supervisión los compara con el papel. Vale para el relevo
          // y para el cierre de la jornada.
          const sinRevisar = await tx.paperLoad.count({ where: { shiftId: o.turno.id, status: { in: ["ABIERTA", "CERRADA"] } } });
          if (sinRevisar > 0) {
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: `Este turno tiene ${sinRevisar === 1 ? "una carga" : `${sinRevisar} cargas`} desde papel sin revisar: supervisión ${sinRevisar === 1 ? "la revisa" : "las revisa"} antes del corte Z.`,
            };
          }

          // La jornada no se cierra con pendientes (JORNADA §5, C2).
          if (cmd.cierre === "JORNADA") {
            const falta = textoDePendientes(await pendientesEn(tx, ctx, o.turno.id, ahora));
            if (falta) return { ok: false, motivo: "CONFLICTO", mensaje: `La jornada no se cierra con pendientes: ${falta}.` };
          }

          // Quién firma (JORNADA §1): dentro del umbral, quien cierra con su PIN; por encima, supervisión
          // (🔐) y una justificación (F4-07).
          const firma = conteo.signer as ZSigner;
          const justificacion = cmd.justificacion?.trim() ?? "";
          if (firma === "SUPERVISION" && justificacion.length < 5) {
            return invalido("Por encima del umbral hay que justificar la diferencia.", ["justificacion"], "Falta la justificación");
          }
          const permiso =
            firma === "CAJERA"
              ? await confirmarPinPropio(tx, ctx, "turno.corteZ", autorizacion, ahora)
              : await exigirPermisoOAutorizacion(tx, ctx, "turno.corteZ", autorizacion, ahora, { confirmarConPin: true });
          if (!permiso.ok) return permiso;
          const autorizador =
            firma === "SUPERVISION" && permiso.autorizadoPor
              ? await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor }, select: { fullName: true } })
              : null;

          const quien = await nombreDe(tx, ctx);
          const base0 = await foto(tx, o.turno, "Z", true, quien.nombre, ahora);
          const arqueo = arqueoDto(conteo);
          const diferencias = (conteo.differences as ConteoGuardado).map(aDinero).filter((d) => d.amount !== 0n);
          const excepciones = diferencias.length
            ? [
                ...base0.excepciones,
                {
                  at: new Date(ahora).toISOString(),
                  tipo: "DIFERENCIA" as const,
                  detalle: `Arqueo del turno ${o.turno.pointLabel}`.slice(0, 160),
                  usuario: conteo.countedByName,
                  motivo: (firma === "SUPERVISION" ? justificacion : "Dentro del umbral").slice(0, 280),
                  autorizadoPor: autorizador?.fullName ?? null,
                  importe: arqueo.diferenciaEnDolares,
                },
              ]
            : base0.excepciones;

          // El sello, en una transacción: primero la foto del Z (la base no admite nada en un turno ya
          // sellado) y después el turno cerrado, tal como la foto lo enseña.
          const sello = { status: "CERRADO_Z", closedAt: new Date(ahora), closedBy: ctx.quien!.userId!, closedByName: quien.nombre };
          const corte = CorteSchema.parse({
            ...base0,
            turno: turnoDto({ ...o.turno, ...sello }),
            excepciones,
            arqueo,
            cierre: {
              tipo: cmd.cierre,
              firma,
              firmadoPor: quien.nombre,
              autorizadoPor: autorizador?.fullName ?? null,
              justificacion: justificacion || null,
              quedaEnGaveta: queda.map(dinero),
              retirado: withdrawn(contado, queda).map(dinero),
            },
          });
          const fila = await tx.shiftCut.create({
            data: {
              tenantId: ctx.tenantId,
              shiftId: o.turno.id,
              kind: "Z",
              madeAt: new Date(ahora),
              madeBy: ctx.quien?.userId ?? null,
              madeByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              content: corte,
              countId: conteo.id,
              closing: cmd.cierre,
              signer: firma,
              authorizedBy: firma === "SUPERVISION" ? permiso.autorizadoPor : null,
              authorizedByName: autorizador?.fullName ?? null,
              justification: justificacion || null,
              operationKey: cmd.idempotencyKey,
            },
          });
          await tx.cashShift.update({ where: { id: o.turno.id }, data: sello });
          await auditar(tx, ctx, {
            action: "turno.corte_z",
            entityType: "cash_shift",
            entityId: o.turno.id,
            ...(firma === "SUPERVISION" && permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
            ...(justificacion ? { reason: justificacion } : {}),
            after: { corte: fila.id, cierre: cmd.cierre, firma, diferencia: arqueo.diferenciaEnDolares, propio: o.propio },
          });
          // El ticket del corte sale solo (JORNADA C5, R4). Sin impresora, el Z se sella igual y se
          // imprime después: lo que se sella no depende del papel.
          await encolarCorteEn(tx, ctx, { id: fila.id, kind: "Z", content: corte }, ahora);
          return { ...corte, id: fila.id };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "turno.corte_z", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos cierres a la vez: la base deja un Z por turno. Si era el mismo, se devuelve.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async ultimoZ(ctx) {
      const deviceId = ctx.quien?.deviceId;
      if (!deviceId) return null;
      return base.conTenant(ctx.tenantId, async (tx) => {
        const z = await tx.shiftCut.findFirst({ where: { kind: "Z", shift: { deviceId } }, orderBy: { madeAt: "desc" } });
        return z ? { ...CorteSchema.parse(z.content), id: z.id } : null;
      });
    },

    async pendientes(ctx, turnoId, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PendientesDelCierreDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "turno.corteZ");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        // El turno que se va a cerrar no cuenta como pendiente: el suyo, o el ajeno que cierra supervisión.
        const objetivo = turnoId ?? (ctx.quien?.deviceId ? (await turnoSinCorteDe(tx, ctx.quien.deviceId))?.id : undefined);
        return pendientesEn(tx, ctx, objetivo ?? null, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async comprobarApertura(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        const faltan: ComprobacionAperturaDto["faltan"] = [];
        const hoy = calendarDay(new Date(ahora).toISOString(), await zonaDe(tx, ctx.branchId));
        const { registros, feriados } = await historialParaCobrar(tx);
        if (!rateOfDay(registros, "USD/VES", hoy, new Date(ahora).toISOString(), feriados)) {
          faltan.push({ que: "TASA", mensaje: "No hay tasa del BCV vigente para hoy.", bloquea: "Cobrar en bolívares", enlace: "/panel/ajustes/tasas" });
        }
        const falta = missingTaxesAt(taxTimeline((await tx.taxRate.findMany()).map(programadaDeFila)), ahora);
        if (falta.length > 0) {
          faltan.push({ que: "IMPUESTOS", mensaje: `Falta ${falta.join(", ")} vigente.`, bloquea: "Cobrar", enlace: "/panel/ajustes/impuestos" });
        }
        const catalogo = await catalogoDe(tx, ctx.branchId);
        const ofrecidos = offeredMethods(
          [...catalogo.medios.values()].map((m) => ({ ...m, dataKind: m.dataKind as PaymentDataKind | null })),
          catalogo.listo,
        );
        if (ofrecidos.length === 0) {
          faltan.push({ que: "MEDIOS", mensaje: "No hay ningún medio de pago encendido.", bloquea: "Cobrar", enlace: "/panel/ajustes/medios" });
        }
        if (!(await tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId }, select: { id: true } }))) {
          faltan.push({ que: "TARIFARIO", mensaje: "No hay tarifario del parque publicado.", bloquea: "La entrada al parque", enlace: "/panel/ajustes/tarifas" });
        }
        if (!(await tx.printer.findFirst({ where: { branchId: ctx.branchId, active: true, forReceipts: true }, select: { id: true } }))) {
          faltan.push({ que: "IMPRESORA", mensaje: "No hay impresora de recibos encendida.", bloquea: "Imprimir recibos y el ticket del corte", enlace: "/panel/ajustes/impresoras" });
        }
        return ComprobacionAperturaSchema.parse({ faltan });
      });
    },

    async resumenDelDia(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ResumenDelDiaDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const dia = calendarDay(new Date(ahora).toISOString(), await zonaDe(tx, ctx.branchId));
        const turnos = await tx.cashShift.findMany({
          where: { branchId: ctx.branchId, businessDate: new Date(`${dia}T00:00:00.000Z`) },
          include: { floats: true, cuts: { where: { kind: "Z" }, include: { count: true } } },
          orderBy: { openedAt: "asc" },
        });
        const entradas: ShiftLedgerEntry[] = [];
        let medio = new Map<string, { code: string; label: string; givesChange: boolean }>();
        let cantidad = 0;
        let anuladas = 0;
        let desdePapel = 0;
        let total = zero(FUNCIONAL);
        let igtf = zero(FUNCIONAL);
        const excepciones: ExcepcionDto[] = [];
        for (const t of turnos) {
          const libro = await libroDelTurno(tx, t.id);
          entradas.push(...libro.entradas);
          medio = libro.medio;
          igtf = add(igtf, libro.igtf);
          const v = await ventasYExcepciones(tx, t, t.closedAt ?? new Date(ahora));
          cantidad += v.ventas.cantidad;
          anuladas += v.ventas.anuladas;
          desdePapel += v.ventas.desdePapel;
          total = add(total, aDinero(v.ventas.total));
          excepciones.push(...v.excepciones);
          const z = t.cuts[0];
          if (z) excepciones.push(...(CorteSchema.parse(z.content).excepciones.filter((e) => e.tipo === "DIFERENCIA")));
        }
        excepciones.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        return ResumenDelDiaSchema.parse({
          dia,
          porMedio: porMedioDe({ entradas, medio, igtf }),
          ventas: { cantidad, anuladas, total: dinero(total), igtf: dinero(igtf), desdePapel },
          turnos: turnos.map((t) => {
            const z = t.cuts[0];
            return {
              turno: turnoDto(t),
              diferenciaEnDolares: z?.count?.differenceUsdMinor != null ? { minor: String(z.count.differenceUsdMinor), currency: FUNCIONAL } : null,
              firma: (z?.signer as ZSigner | undefined) ?? null,
            };
          }),
          excepciones,
          // Las cargas que esperan revisión bloquean el cierre sea del día que sea: se cuentan todas.
          papelPorRevisar: await tx.paperLoad.count({ where: { branchId: ctx.branchId, status: { in: ["ABIERTA", "CERRADA"] } } }),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
