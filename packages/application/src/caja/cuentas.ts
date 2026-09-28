/**
 * Las cuentas en el servidor — B3-3, DEC-21, F4-03, F4-04b, F4-04c, §5.6.
 *
 * Las cuentas de familia, de mesa y de mostrador dejan de vivir en el navegador. Cada cambio añade
 * una versión de la cuenta entera (solo-agregar); la vigente es la más alta. Quién decide qué:
 *  · el dominio (`@l2/domain-cash`): qué cambio de una pantalla se acepta (`accountChangeProblem`),
 *    qué se cobra (`documentLinesOf`), cómo queda la cuenta al cobrar o anular (`markPartPaid`,
 *    `revertPaid`) y si el cobro cuadra al céntimo (`closeSettlement`); el de impuestos pone el IVA
 *    y el IGTF del instante, y el de tasas dice si la tasa citada sigue valiendo (`citedRateValid`);
 *  · la matriz: guardar según de quién es la cuenta, cobrar es `documento.emitir` y anular es
 *    `cobro.anular` (🔐 para supervisión y caja, DEC-24);
 *  · este archivo: el número de orden, la hora de apertura y la de entrada en la cola, la versión
 *    (dos equipos que guardan a la vez: el segundo recibe CONFLICTO) y que el cobro, sus asientos
 *    en el libro y la cuenta marcada pagada vayan en UNA transacción.
 *
 * Lo que la pantalla calculó (las líneas que cobra y el total) viaja para comprobarlo, no para
 * creerlo: si el servidor llega a otro total, no se cobra algo distinto de lo que vio el cliente.
 */
import {
  AnularCobroCommandSchema,
  CobrarCuentaCommandSchema,
  CortesiaCommandSchema,
  CuentaYLibroSchema,
  IncobrableCommandSchema,
  CuentasDelLocalSchema,
  FamilyAccountSchema,
  GuardarCuentaCommandSchema,
  enmascararDocumento,
  problemasDe,
  type AsentarPagosCommand,
  type CuentaYLibroDto,
  type CuentasDelLocalDto,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
  type VentaCerradaDto,
} from "@l2/contracts";
import {
  RetainedAboveThresholdError,
  SettlementImbalanceError,
  USDT_AT_PAR,
  accountChangeProblem,
  chargeableLines,
  closeSettlement,
  computeBalance,
  courtesyProblem,
  documentLinesOf,
  markUncollectible,
  uncollectibleProblem,
  isDiscardedDraft,
  linesPaidBetween,
  markPartPaid,
  refundableByTender,
  revertPaid,
  withCourtesy,
  type AccountChangeProblem,
  type CourtesyProblem,
  type AccountKind,
  type ChangeDisposition,
  type ProductAtNow,
  type LedgerMethodSpec,
  type Tender,
} from "@l2/domain-cash";
import { add, allocate, money, zero, type CurrencyCode, type Money } from "@l2/domain-money";
import { calendarDay, citedRateValid, frozenRateOf, startOfDay } from "@l2/domain-rates";
import {
  NoApplicableRuleError,
  NoIgtfRuleError,
  computeDocument,
  computeIgtf,
  igtfAt,
  ivaRulesOf,
  taxTimeline,
  type DocumentTotals,
  type TaxCode,
} from "@l2/domain-tax";
import { periodAt, priceTimeline } from "@l2/domain-inventory";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { autorizadoresPara, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import type { Cifrador } from "../identidad/cifrado.ts";
import { programadaDeFila } from "../dinero/impuestos.ts";
import {
  asentarEn,
  catalogoDe,
  conflictoDeClave,
  huellasDe,
  leerLibroEn,
  problemaDeReversion,
  referenciaDe,
  revertirAsientoEn,
  yaAsentado,
} from "../dinero/pagos.ts";
import { historialParaCobrar, ZONA_DEL_LOCAL } from "../dinero/tasas.ts";
import { turnoParaCobrar } from "./turnos.ts";
import { ventaDelCobro, type DevolucionGuardada } from "./ventas.ts";

/** La moneda funcional del local (DEC: USD). Se hará ajuste de la sucursal con B4-4. */
const FUNCIONAL: CurrencyCode = "USD";

/**
 * Lo más que puede quedarse en caja como residuo de un cobro (§5.6): $ 0,05, lo que usaba la caja.
 * Pasa a los ajustes de la sucursal con B4-4.
 */
export const MAX_RESIDUO: Money = money(5n, "USD");

/** El medio en que se asienta lo que sobra de un cobro (vuelto, propina, residuo): el efectivo en dólares. */
const MEDIO_DE_LO_QUE_SOBRA = "EFECTIVO_USD";

export interface CasosCuentas {
  /** Las cuentas de la sucursal: las que no están cobradas y las cobradas hoy, en su última versión. */
  leer(ctx: Contexto, ahora?: number): Promise<Resultado<CuentasDelLocalDto>>;
  /** Abre o cambia una cuenta (`GuardarCuentaCommandSchema`). Devuelve cómo quedó. */
  guardar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
  /** Cobra una cuenta, o una parte si está dividida, contra el libro (`CobrarCuentaCommandSchema`). */
  cobrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CuentaYLibroDto>>;
  /**
   * Anula un cobro (`AnularCobroCommandSchema`): revierte sus asientos y devuelve lo que pagó a la
   * cola. `autorizacion` es la del 🔐 cuando quien lo pide no puede anular por sí mismo.
   */
  anular(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<CuentaYLibroDto>>;
  /**
   * Regala una línea o deja de regalarla (`CortesiaCommandSchema`, F6-14). `autorizacion` es la del
   * 🔐 de quien la concede, o el PIN de quien puede darla por sí mismo.
   */
  cortesia(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
  /**
   * Marca incobrable una cuenta que no se va a cobrar (`IncobrableCommandSchema`, D-JOR), con motivo y
   * la 🔐 de supervisión. Nada se borra: lo que se debía sigue en la cuenta y sale en las excepciones.
   */
  incobrable(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
  /** Quiénes pueden autorizar a quien opera una acción de la caja con 🔐 (vacío si no le hace falta). */
  autorizadores(ctx: Contexto, accion?: AccionDeCaja): Promise<{ id: string; nombre: string; rol: string }[]>;
}

/** Las acciones de la caja que se autorizan con 🔐 y cuya lista de autorizadores pide la pantalla. */
export type AccionDeCaja = "cobro.anular" | "cuenta.cortesia" | "cuenta.incobrable" | "turno.corteZ";

/** Anular y regalar mueven dinero: quien puede por sí mismo confirma igual con su PIN (B3-4). */
const CON_PIN = { confirmarConPin: true } as const;

/** Quién puede ver las cuentas: quien trabaja con alguna (entrada, salida, mesas o caja). */
const VEN_CUENTAS: readonly Action[] = ["parque.checkIn", "parque.checkOut", "parque.vincularMesa", "pedido.tomar", "documento.emitir"];

/** Quién puede guardar una cuenta, según de quién es. */
const GUARDAN: Readonly<Record<AccountKind, readonly Action[]>> = {
  FAMILIA: ["parque.checkIn", "parque.checkOut", "parque.vincularMesa", "documento.emitir"],
  MESA: ["pedido.tomar", "parque.vincularMesa", "documento.emitir"],
  MOSTRADOR: ["documento.emitir"],
};

const MENSAJE_CAMBIO: Record<AccountChangeProblem, string> = {
  NUEVA_CON_PAGOS: "Una cuenta nueva no nace cobrada: lo cobrado lo marca la caja al cobrar.",
  TIPO_CAMBIADO: "Una cuenta no cambia de tipo.",
  MESA_CAMBIADA: "Una cuenta no cambia de mesa.",
  ESTANCIA_QUITADA: "Los niños de una cuenta no se quitan de ella.",
  LINEA_QUITADA: "Lo consumido no se quita: se regala (cortesía) o se anula.",
  LINEA_ALTERADA: "Una línea de la cuenta no se cambia: se quita o se añade otra.",
  PAGO_DESDE_LA_PANTALLA: "Marcar pagado es de la caja al cobrar.",
  MOVIDA_OTRA_VEZ: "Esa línea ya se movió a otra cuenta.",
  CORTESIA_DESDE_LA_PANTALLA: "Una cortesía se da con su autorización, no al guardar la cuenta.",
  DIVISION_ALTERADA: "Con partes cobradas, la división no se cambia.",
  MOSTRADOR_SIN_PRODUCTO: "Una venta de mostrador vende del catálogo.",
  CUENTA_INCOBRABLE: "Una cuenta incobrable no se cambia: la marca supervisión con su autorización.",
  PRODUCTO_QUE_NO_SE_VENDE: "Ese producto ya no se vende.",
  PRECIO_DISTINTO: "El precio de ese producto cambió: vuelve a añadirlo desde la carta.",
  FAMILIA_DESDE_LA_PANTALLA: "La cuenta de una familia la abre la entrada del parque.",
  ESTANCIAS_DESDE_LA_PANTALLA: "Quién entra y quién sale lo registran la entrada y la salida del parque.",
  PARQUE_DESDE_LA_PANTALLA: "El paquete y el tiempo de más los pone el parque con su tarifario.",
};

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});
const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
const cuentaCambiada: Rechazo = {
  ok: false,
  motivo: "CONFLICTO",
  mensaje: "Otro equipo cambió esta cuenta mientras la tenías abierta. Revísala y vuelve a intentarlo.",
};

/** Una cuenta con su última versión, leída dentro de la transacción. */
type Vigente = Readonly<{ cuenta: FamilyAccountDto; version: number }>;

export function casosCuentas(base: Base, cifrador: Cifrador | null): CasosCuentas {
  return {
    async leer(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CuentasDelLocalDto | Rechazo> => {
        if (!(await puedeAlguna(tx, ctx, VEN_CUENTAS))) return rechazoDePermiso("DENEGADO");
        // Las cobradas (y las incobrables) se enseñan el día en que se cerraron; las demás, hasta que se cobran.
        const desde = new Date(startOfDay(calendarDay(new Date(ahora).toISOString(), ZONA_DEL_LOCAL), ZONA_DEL_LOCAL));
        const filas = await tx.$queryRaw<{ version: number; content: unknown }[]>`
          SELECT ultima.version, ultima.content FROM (
            SELECT DISTINCT ON (v.account_id) v.version, v.content, v.status, v.saved_at
            FROM account_version v
            JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
            WHERE a.branch_id = ${ctx.branchId}::uuid
            ORDER BY v.account_id, v.version DESC
          ) ultima
          WHERE ultima.status NOT IN ('COBRADA', 'INCOBRABLE') OR ultima.saved_at >= ${desde}
          ORDER BY ultima.saved_at`;
        // Se revalida al salir: lo que no cumple el contrato no llega a ninguna estación (fail-closed).
        const cuentas = filas.map((f) => deVersion(f.content, f.version)).filter((c) => !isDiscardedDraft(c));
        return CuentasDelLocalSchema.parse({ cuentas });
      });
      if ("ok" in r) return r;
      return { ok: true, valor: r };
    },

    async guardar(ctx, entrada, ahora = Date.now()) {
      const v = GuardarCuentaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La cuenta no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const enviada = v.data.cuenta;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
          if (!(await puedeAlguna(tx, ctx, GUARDAN[enviada.kind], "PERMITIDO"))) return rechazoDePermiso("DENEGADO");

          const fila = await tx.account.findUnique({ where: { id: enviada.id }, select: { branchId: true } });
          if (fila && fila.branchId !== ctx.branchId) {
            return enviada.version === undefined ? { ok: false, motivo: "CONFLICTO", mensaje: "Ese identificador de cuenta ya existe." } : noExiste;
          }
          const actual = fila ? await vigenteDe(tx, enviada.id) : null;
          if (!actual && enviada.version !== undefined) return noExiste;
          if (actual) {
            // Una cuenta sin versión es nueva: si ya existe, es el reintento de su alta o un choque.
            if (enviada.version === undefined) return actual.version === 1 && mismaCuenta(actual.cuenta, enviada) ? actual.cuenta : cuentaCambiada;
            if (enviada.version !== actual.version) return cuentaCambiada;
          }
          const antes = actual?.cuenta ?? null;

          const productAt = hayProductosNuevos(antes, enviada) ? await catalogoEn(tx, ahora) : () => null;
          const cambio = accountChangeProblem(antes, enviada, productAt);
          if (cambio) {
            const i = cambio.lineId ? enviada.lines.findIndex((l) => l.id === cambio.lineId) : -1;
            return invalido(MENSAJE_CAMBIO[cambio.problem], i >= 0 ? ["cuenta", "lines", i] : ["cuenta"], cambio.problem);
          }
          // Guardar lo mismo no añade versión: el sondeo de una pantalla no llena el historial.
          if (antes && mismaCuenta(antes, enviada)) return antes;

          const instante = new Date(ahora).toISOString();
          const orderNumber = antes?.orderNumber ?? (await siguienteNumero(tx, ctx));
          const version = (actual?.version ?? 0) + 1;
          // La cola se ordena por cuánto lleva esperando: la hora de entrar en ella la pone el servidor.
          const { pendingSince: _, ...sinEspera } = enviada;
          const cuenta = FamilyAccountSchema.parse({
            ...sinEspera,
            version,
            orderNumber,
            openedAt: antes?.openedAt ?? instante,
            ...(enviada.status === "POR_COBRAR" ? { pendingSince: antes?.status === "POR_COBRAR" ? (antes.pendingSince ?? instante) : instante } : {}),
          });

          const quien = await nombreDe(tx, ctx);
          if (!antes) {
            await tx.account.create({
              data: {
                id: cuenta.id,
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                kind: cuenta.kind,
                orderNumber,
                openedAt: new Date(ahora),
                openedBy: ctx.quien?.userId ?? null,
                openedByName: quien.nombre,
                deviceId: ctx.quien?.deviceId ?? null,
              },
            });
          }
          await guardarVersion(tx, ctx, cuenta, { cause: "GUARDAR", operationKey: null, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: antes ? "cuenta.guardar" : "cuenta.abrir",
            entityType: "account",
            entityId: cuenta.id,
            ...(antes ? { before: resumenDe(antes) } : {}),
            after: resumenDe(cuenta),
          });
          return cuenta;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.guardar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos equipos guardan a la vez la misma versión (o el mismo número de orden): la base deja
        // uno. Se vuelve a mirar: si era el reintento de esta misma alta, se devuelve; si no, choque.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async cobrar(ctx, entrada, ahora = Date.now()) {
      const v = CobrarCuentaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cobro no se cerró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const huellas = huellasDe(cmd.pagos, cifrador);
      if ("ok" in huellas) return renombrarRuta(huellas, "asientos", "pagos");

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CuentaYLibroDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
          if (rechazo) return rechazo;

          // Un doble clic devuelve lo que ya se cobró con esta clave (I-11).
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.accountId !== cmd.accountId || previa.cause !== "COBRO") return conflictoDeClave;
            return cuentaYLibro(tx, cmd.accountId, cmd.idempotencyKey, cifrador);
          }

          const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
          if (!fila || fila.branchId !== ctx.branchId) return noExiste;
          const actual = (await vigenteDe(tx, cmd.accountId))!;
          if (actual.version !== cmd.version) return cuentaCambiada;
          const cuenta = actual.cuenta;
          if (cuenta.status !== "POR_COBRAR") {
            return { ok: false, motivo: "CONFLICTO", mensaje: cuenta.status === "COBRADA" ? "Esa cuenta ya está cobrada." : "Esa cuenta no está en la cola de la caja." };
          }
          // Lo que la pantalla cobraba es lo que hay por cobrar, ni una línea más ni una menos.
          const porCobrar = chargeableLines(cuenta).map((l) => l.id);
          if (porCobrar.length !== cmd.lineIds.length || porCobrar.some((id) => !cmd.lineIds.includes(id))) return cuentaCambiada;

          // Sin turno abierto en el equipo no se cobra (F4-01).
          const turno = await turnoParaCobrar(tx, ctx);
          if ("ok" in turno) return turno;

          // El IVA y el IGTF del instante (B2-2): sin ellos no se cobra con un impuesto supuesto.
          const periodos = taxTimeline((await tx.taxRate.findMany()).map(programadaDeFila));
          let doc: DocumentTotals;
          try {
            doc = computeDocument({ lines: documentLinesOf(cuenta), rules: ivaRulesOf(periodos), at: ahora, currency: FUNCIONAL });
          } catch (e) {
            if (!(e instanceof NoApplicableRuleError)) throw e;
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "No hay IVA vigente para lo que se cobra: configúralo en Impuestos." };
          }
          // La parte que toca (F6-12): el reparto del total con el mayor resto; sin dividir (o con
          // todas las partes ya cobradas y algo nuevo que cobrar), el total.
          const split = cuenta.split && cuenta.split.paid < cuenta.split.parts ? cuenta.split : null;
          const parte = split ? allocate(doc.total, split.parts)[split.paid]! : doc.total;

          // Cada pago con su medio del catálogo y, en bolívares, la tasa que cita.
          const catalogo = await catalogoDe(tx, ctx.branchId);
          const medios: LedgerMethodSpec[] = [];
          for (const [i, p] of cmd.pagos.entries()) {
            const medio = catalogo.medios.get(p.method);
            if (!medio) return invalido("Ese medio no existe en este local.", ["pagos", i, "method"], "Medio desconocido");
            if (medio.currency !== p.amount.currency) return invalido(`«${medio.label}» cobra en ${medio.currency}.`, ["pagos", i, "amount"], "Moneda del medio");
            medios.push(medio);
          }
          let tasa: ReturnType<typeof frozenRateOf> | null = null;
          let valorDeLaTasa: string | null = null;
          if (cmd.rateId) {
            const { registros, feriados } = await historialParaCobrar(tx);
            const citada = registros.find((r) => r.id === cmd.rateId);
            // ADR-019 §7: la tasa del cobro vale si rige ahora o regía hace un momento.
            if (!citada || !citedRateValid(registros, "USD/VES", cmd.rateId, ahora, ZONA_DEL_LOCAL, feriados)) {
              return {
                ok: false,
                motivo: "CONFLICTO",
                mensaje: "La tasa de este cobro ya no es la vigente: vuelve a calcular los bolívares con la de ahora.",
                problemas: [{ path: ["rateId"], message: "Tasa que ya no rige" }],
              };
            }
            tasa = frozenRateOf(citada);
            valorDeLaTasa = citada.value;
          }
          const tenders: Tender[] = cmd.pagos.map((p, i) => ({
            method: { code: medios[i]!.code, label: medios[i]!.label, currency: medios[i]!.currency, canGiveChange: medios[i]!.givesChange },
            amount: money(BigInt(p.amount.minor), p.amount.currency),
            // Cada moneda con su tasa: el USDT a la par (DEC-1), los bolívares con la citada.
            rate: p.amount.currency === FUNCIONAL ? null : p.amount.currency === "USDT" ? USDT_AT_PAR : tasa,
          }));
          if (tenders.some((t) => t.amount.currency === "VES" && !t.rate)) {
            return invalido("Un cobro en bolívares cita su tasa.", ["rateId"], "Falta la tasa");
          }

          // El IGTF grava el pago, no la venta (§5.4): lo que hay que cobrar crece con cada pago en divisas.
          let igtfBps = 0;
          if (medios.some((m) => m.triggersIgtf)) {
            try {
              igtfBps = igtfAt(periodos, ahora);
            } catch (e) {
              if (!(e instanceof NoIgtfRuleError)) throw e;
              return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "No hay IGTF vigente: no se cobra en divisas hasta configurarlo en Impuestos." };
            }
          }
          const igtf = computeIgtf(
            tenders.map((t, i) => ({ method: { code: medios[i]!.code, label: medios[i]!.label, currency: medios[i]!.currency, triggersIgtf: medios[i]!.triggersIgtf }, amount: t.amount })),
            igtfBps,
            FUNCIONAL,
          );
          // El IGTF en USDT cuenta a la par con el dólar, como en la caja (DEC-1).
          const igtfTotal = igtf.lines.reduce<Money>(
            (acc, l) => (l.igtf.currency === FUNCIONAL || l.igtf.currency === "USDT" ? add(acc, money(l.igtf.amount, FUNCIONAL)) : acc),
            zero(FUNCIONAL),
          );
          const aCobrar = add(parte, igtfTotal);
          if (cmd.total.currency !== FUNCIONAL || BigInt(cmd.total.minor) !== aCobrar.amount) {
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: "El total cambió mientras cobrabas (un precio, un impuesto o la tasa). Revísalo con el cliente.",
              problemas: [{ path: ["total"], message: "Total distinto" }],
            };
          }

          // §5.6: lo entregado = lo cobrado + vuelto + propina + residuo, al céntimo.
          const sobra = computeBalance(aCobrar, tenders, FUNCIONAL).surplus;
          const destino: ChangeDisposition[] =
            sobra.amount === 0n
              ? []
              : [
                  cmd.destinoSobra === "VUELTO"
                    ? { kind: "CHANGE_OUT", amount: sobra, rate: null }
                    : cmd.destinoSobra === "PROPINA"
                      ? { kind: "TIP_FROM_CHANGE", amount: sobra }
                      : { kind: "ROUNDING_RETAINED", amount: sobra },
                ];
          try {
            closeSettlement({ due: aCobrar, tenders, dispositions: destino, functional: FUNCIONAL, maxRetained: MAX_RESIDUO });
          } catch (e) {
            if (e instanceof SettlementImbalanceError) {
              return invalido("El cobro no cuadra: falta dinero por recibir.", ["pagos"], "No cuadra");
            }
            if (e instanceof RetainedAboveThresholdError) {
              return invalido("Lo que sobra es más de lo que puede quedarse en caja: dalo de vuelto o como propina.", ["destinoSobra"], "Residuo por encima del umbral");
            }
            throw e;
          }

          // Los asientos del cobro: cada pago y, si sobra, su destino en el efectivo en dólares.
          const asientos: AsentarPagosCommand["asientos"] = [
            ...cmd.pagos.map((p) => ({
              kind: "COBRO" as const,
              method: p.method,
              amount: p.amount,
              ...(p.amount.currency === "VES" && cmd.rateId ? { rateId: cmd.rateId } : {}),
              ...(p.datos ? { datos: p.datos } : {}),
            })),
            ...(sobra.amount > 0n
              ? [{ kind: TIPO_DE_SOBRA[cmd.destinoSobra], method: MEDIO_DE_LO_QUE_SOBRA, amount: { minor: String(sobra.amount), currency: FUNCIONAL } }]
              : []),
          ];
          let filas: Awaited<ReturnType<typeof asentarEn>> = [];
          if (asientos.length > 0) {
            filas = await asentarEn(
              tx,
              ctx,
              { idempotencyKey: cmd.idempotencyKey, documentId: cmd.accountId, asientos },
              [...huellas, ...asientos.slice(cmd.pagos.length).map(() => null)],
              cifrador,
              ahora,
            );
            if ("ok" in filas) return renombrarRuta(filas, "asientos", "pagos");
          }

          // La cuenta, pagada (o una parte más), en la misma transacción que sus asientos.
          const { pendingSince, ...pagada } = markPartPaid(cuenta);
          const quien = await nombreDe(tx, ctx);
          // Mientras queden partes sigue en la cola, con la hora a la que llegó.
          const nueva = FamilyAccountSchema.parse({
            ...pagada,
            version: actual.version + 1,
            ...(pagada.status === "POR_COBRAR" && pendingSince ? { pendingSince } : {}),
          });
          await guardarVersion(tx, ctx, nueva, { cause: "COBRO", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: "cuenta.cobrar",
            entityType: "account",
            entityId: cuenta.id,
            before: resumenDe(cuenta),
            after: {
              ...resumenDe(nueva),
              operationKey: cmd.idempotencyKey,
              total: { minor: String(aCobrar.amount), currency: FUNCIONAL },
              igtf: { minor: String(igtfTotal.amount), currency: FUNCIONAL },
              sobra: { minor: String(sobra.amount), currency: FUNCIONAL, destino: sobra.amount > 0n ? cmd.destinoSobra : null },
            },
          });

          // La venta: la foto de lo cobrado (C12). El recibo sale de aquí, no de la pantalla.
          const devolvible = refundableByTender(tenders, sobra, FUNCIONAL);
          const conDinero = (m: Money) => ({ minor: String(m.amount), currency: m.currency });
          const venta = {
            orderNumber: cuenta.orderNumber!,
            accountId: cuenta.id,
            cobroKey: cmd.idempotencyKey,
            closedAt: new Date(ahora).toISOString(),
            businessDate: turno.businessDate.toISOString().slice(0, 10),
            cashier: quien.nombre,
            cuenta: { kind: cuenta.kind, family: cuenta.family, tableLabel: cuenta.tableLabel ?? null },
            parte: split ? { n: split.paid + 1, de: split.parts } : null,
            cliente:
              cmd.cliente?.kind === "IDENTIFICADO"
                ? { kind: "IDENTIFICADO", name: cmd.cliente.name, document: enmascararDocumento(cmd.cliente.document) }
                : { kind: "CONSUMIDOR_FINAL" },
            // Lo que se cobra y lo que se regala en este cobro (lo regalado, con su motivo).
            lineas: cuenta.lines
              .filter((l) => !l.paid && !l.movedTo)
              .map((l) => ({ lineId: l.id, concept: l.concept, amount: l.amount, cortesia: l.cortesia?.motivo ?? null })),
            subtotal: conDinero(doc.subtotal),
            impuestos: doc.buckets.map((b) => ({ basisPoints: b.basisPoints, tax: conDinero(b.tax) })),
            igtf: { basisPoints: igtfBps, amount: conDinero(igtfTotal) },
            total: conDinero(aCobrar),
            tasa: cmd.rateId && valorDeLaTasa ? { id: cmd.rateId, value: valorDeLaTasa } : null,
            payments: tenders.map((t, i) => ({
              methodCode: medios[i]!.code,
              label: medios[i]!.label,
              cash: medios[i]!.givesChange,
              dataKind: medios[i]!.dataKind,
              paid: conDinero(t.amount),
              refundable: conDinero(devolvible[i]!),
              referencia: filas[i] ? referenciaDe(filas[i]!, cifrador) : null,
            })),
            sobra: sobra.amount > 0n ? { amount: conDinero(sobra), destino: cmd.destinoSobra } : null,
          };
          await tx.sale.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId: cuenta.id,
              operationKey: cmd.idempotencyKey,
              shiftId: turno.id,
              businessDate: turno.businessDate,
              closedAt: new Date(ahora),
              cashierId: ctx.quien?.userId ?? null,
              cashierName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              orderNumber: venta.orderNumber,
              totalMinor: aCobrar.amount,
              currency: FUNCIONAL,
              content: venta,
            },
          });
          return cuentaYLibro(tx, cmd.accountId, cmd.idempotencyKey, cifrador);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.cobrar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: CuentaYLibroSchema.parse(r) };
      } catch (e) {
        // Dos envíos a la vez: con la misma clave, el segundo devuelve lo cobrado por el primero; con
        // otra, la versión ya no es la suya y recibe CONFLICTO.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: CuentaYLibroSchema.parse(r) };
      }
    },

    async anular(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AnularCobroCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cobro no se anuló: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CuentaYLibroDto | Rechazo> => {
          // Quien no puede anular ni pidiéndolo no llega a mirar nada.
          const p = await permisoEn(tx, ctx, "cobro.anular");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          // Un doble clic devuelve lo ya anulado sin volver a pedir el PIN de quien autoriza.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.accountId !== cmd.accountId || previa.cause !== "ANULACION") return conflictoDeClave;
            return cuentaYLibro(tx, cmd.accountId, cmd.cobroKey, cifrador);
          }

          const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
          if (!fila || fila.branchId !== ctx.branchId) return noExiste;
          const versiones = await tx.accountVersion.findMany({ where: { accountId: cmd.accountId }, orderBy: { version: "asc" } });
          const i = versiones.findIndex((x) => x.cause === "COBRO" && x.operationKey === cmd.cobroKey);
          if (i < 0) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese cobro no es de esta cuenta." };

          const asientos = await yaAsentado(tx, cmd.cobroKey);
          if (asientos.length === 0) return invalido("Ese cobro no movió dinero: no hay nada que anular.", ["cobroKey"], "Sin asientos");
          for (const a of asientos) {
            const problema = await problemaDeReversion(tx, a);
            if (problema === "YA_REVERTIDO") return { ok: false, motivo: "CONFLICTO", mensaje: "Ese cobro ya se anuló." };
            if (problema) return invalido("Ese cobro no se puede anular.", ["cobroKey"], problema);
          }

          // Cómo vuelve el dinero de cada pago (DEC-24): el que tiene algo que devolver, una vez, y lo
          // que no entró en efectivo, por su medio con la referencia de la devolución o en efectivo
          // explicándolo.
          const venta = await ventaDelCobro(tx, cmd.cobroKey, cifrador);
          if (!venta) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "No hay venta de ese cobro." };
          // El corte Z ya la contó: después del Z nada toca ese turno (F4-06; la base también lo impone).
          const suTurno = await tx.sale.findFirst({ where: { operationKey: cmd.cobroKey }, select: { shift: { select: { status: true } } } });
          if (suTurno?.shift.status === "CERRADO_Z") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa venta es de un turno con corte Z: ya no se anula." };
          }
          const devoluciones: DevolucionGuardada[] = [];
          for (const [k, pago] of venta.payments.entries()) {
            const d = cmd.devoluciones.find((x) => x.paymentIndex === k);
            if (BigInt(pago.refundable.minor) === 0n) {
              if (d) return invalido("De ese pago no queda nada que devolver.", ["devoluciones"], "Sin devolución");
              continue;
            }
            if (!d) return invalido(`Falta decir cómo se devuelve ${pago.label}.`, ["devoluciones"], "Falta la devolución");
            if (pago.cash && d.via !== "MISMO_MEDIO") return invalido("El efectivo se devuelve en efectivo.", ["devoluciones"], "Vía del efectivo");
            if (!pago.cash && d.via === "MISMO_MEDIO" && !d.reference) {
              return invalido(pago.dataKind === "PUNTO" ? "Escribe la aprobación de la anulación en el terminal." : "Escribe la referencia de la devolución.", ["devoluciones"], "Falta la referencia");
            }
            if (!pago.cash && d.via === "EFECTIVO" && (cmd.detalle?.length ?? 0) < 5) {
              return invalido("Devolver en efectivo lo que no entró en efectivo exige explicarlo.", ["detalle"], "Falta explicarlo");
            }
            if (d.reference && !cifrador) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Este servidor no puede guardar referencias (falta L2_CLAVE_CIFRADO)." };
            devoluciones.push({
              paymentIndex: k,
              via: d.via,
              amountMinor: pago.refundable.minor,
              currency: pago.refundable.currency,
              referenceCipher: d.reference && !pago.cash ? cifrador!.cifrar(d.reference) : null,
            });
          }
          if (cmd.devoluciones.some((d) => d.paymentIndex >= venta.payments.length)) {
            return invalido("Una devolución apunta a un pago que no existe.", ["devoluciones"], "Pago desconocido");
          }

          // DEC-24: la autorización se comprueba y se registra ANTES de tocar el libro. El dinero
          // vuelve desde la gaveta de este equipo: hace falta su turno abierto.
          const turno = await turnoParaCobrar(tx, ctx);
          if ("ok" in turno) return turno;
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cobro.anular", autorizacion, ahora, CON_PIN);
          if (!permiso.ok) return permiso;
          const autorizador = await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor! }, select: { fullName: true, role: true } });

          for (const [linea, original] of asientos.entries()) {
            await revertirAsientoEn(tx, ctx, {
              original,
              turno,
              operationKey: cmd.idempotencyKey,
              line: linea,
              motivo: cmd.motivo,
              detalle: cmd.detalle ?? null,
              autorizadoPor: permiso.autorizadoPor,
              ahora,
            });
          }

          // Qué vuelve a deberse: lo que pagó ese cobro. Si era una parte, se resta la parte; y si
          // la cuenta estaba completa, vuelve a deberse lo que marcó pagado la última parte.
          const contenido = (k: number) => deVersion(versiones[k]!.content, versiones[k]!.version);
          const delCobro = contenido(i);
          const antesDelCobro = i > 0 ? contenido(i - 1) : null;
          const fueParte = (delCobro.split?.paid ?? 0) > (antesDelCobro?.split?.paid ?? 0);
          const vigente = contenido(versiones.length - 1);
          let lineIds = linesPaidBetween(antesDelCobro, delCobro);
          if (fueParte) {
            const completa = vigente.split !== undefined && vigente.split.paid === vigente.split.parts;
            const k = completa ? versiones.findLastIndex((x, j) => x.cause === "COBRO" && j > 0 && linesPaidBetween(contenido(j - 1), contenido(j)).length > 0) : -1;
            lineIds = k > 0 ? linesPaidBetween(contenido(k - 1), contenido(k)) : [];
          }
          const anulada = revertPaid(vigente, lineIds, fueParte);
          const instante = new Date(ahora).toISOString();
          const quien = await nombreDe(tx, ctx);
          const nueva = FamilyAccountSchema.parse({
            ...anulada,
            version: vigente.version! + 1,
            pendingSince: vigente.status === "POR_COBRAR" ? (vigente.pendingSince ?? instante) : instante,
          });
          await guardarVersion(tx, ctx, nueva, { cause: "ANULACION", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: "cuenta.anular_cobro",
            entityType: "account",
            entityId: nueva.id,
            ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
            reason: cmd.motivo,
            before: resumenDe(vigente),
            after: { ...resumenDe(nueva), cobroKey: cmd.cobroKey, detalle: cmd.detalle ?? null },
          });
          await tx.saleVoid.create({
            data: {
              tenantId: ctx.tenantId,
              saleId: venta.id,
              operationKey: cmd.idempotencyKey,
              voidedAt: new Date(ahora),
              requestedBy: ctx.quien?.userId ?? null,
              requestedByName: quien.nombre,
              authorizedBy: permiso.autorizadoPor!,
              authorizedByName: autorizador.fullName,
              authorizedByRole: autorizador.role,
              reason: cmd.motivo,
              note: cmd.detalle ?? null,
              refunds: devoluciones,
            },
          });
          return cuentaYLibro(tx, cmd.accountId, cmd.cobroKey, cifrador);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.anular_cobro", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: CuentaYLibroSchema.parse(r) };
      } catch (e) {
        // Dos anulaciones a la vez: la base deja una. Si la otra es esta misma (un doble clic), se
        // devuelve; si no, ese cobro ya se anuló.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: CuentaYLibroSchema.parse(r) };
      }
    },

    async cortesia(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = CortesiaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La cortesía no se aplicó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
          const p = await permisoEn(tx, ctx, "cuenta.cortesia");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          // Un doble clic devuelve la cuenta como quedó, sin volver a pedir el PIN.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.accountId !== cmd.accountId || previa.cause !== "CORTESIA") return conflictoDeClave;
            return (await vigenteDe(tx, cmd.accountId))!.cuenta;
          }

          const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
          if (!fila || fila.branchId !== ctx.branchId) return noExiste;
          const actual = (await vigenteDe(tx, cmd.accountId))!;
          if (actual.version !== cmd.version) return cuentaCambiada;
          const problema = courtesyProblem(actual.cuenta, cmd.lineId, cmd.quitar);
          if (problema) return invalido(MENSAJE_CORTESIA[problema], ["lineId"], problema);

          // La autorización se comprueba y se registra ANTES de regalar nada (§7.3).
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cuenta.cortesia", autorizacion, ahora, CON_PIN);
          if (!permiso.ok) return permiso;
          const autorizador = await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor! }, select: { id: true, fullName: true, role: true } });

          const cortesia = cmd.quitar
            ? null
            : {
                motivo: cmd.motivo!,
                ...(cmd.detalle ? { detalle: cmd.detalle } : {}),
                autorizadaPor: { id: autorizador.id, name: autorizador.fullName, role: autorizador.role },
                en: new Date(ahora).toISOString(),
              };
          const nueva = FamilyAccountSchema.parse({ ...withCourtesy(actual.cuenta, cmd.lineId, cortesia), version: actual.version + 1 });
          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, nueva, { cause: "CORTESIA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          const linea = actual.cuenta.lines.find((l) => l.id === cmd.lineId)!;
          await auditar(tx, ctx, {
            action: cmd.quitar ? "cuenta.quitar_cortesia" : "cuenta.cortesia",
            entityType: "account",
            entityId: nueva.id,
            authorizedBy: autorizador.id,
            ...(cmd.motivo ? { reason: cmd.motivo } : {}),
            after: { lineId: cmd.lineId, concepto: linea.concept, importe: linea.amount, detalle: cmd.detalle ?? null, version: nueva.version },
          });
          return nueva;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.cortesia", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async incobrable(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = IncobrableCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La cuenta no se marcó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
          const p = await permisoEn(tx, ctx, "cuenta.incobrable");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.accountId !== cmd.accountId || previa.cause !== "INCOBRABLE") return conflictoDeClave;
            return (await vigenteDe(tx, cmd.accountId))!.cuenta;
          }
          const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
          if (!fila || fila.branchId !== ctx.branchId) return noExiste;
          const actual = (await vigenteDe(tx, cmd.accountId))!;
          if (actual.version !== cmd.version) return cuentaCambiada;
          const problema = uncollectibleProblem(actual.cuenta);
          if (problema === "NO_PENDIENTE") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta no está pendiente: no hay nada que dar por incobrable." };
          }
          if (problema === "NINOS_EN_SALA") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Hay niños de esa familia en sala: registra primero su salida." };
          }
          // La autorización se comprueba y se registra antes de tocar la cuenta (§7.3).
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cuenta.incobrable", autorizacion, ahora, CON_PIN);
          if (!permiso.ok) return permiso;
          const autorizador = await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor! }, select: { fullName: true } });

          const { pendingSince: _, ...sinEspera } = markUncollectible(actual.cuenta);
          const nueva = FamilyAccountSchema.parse({ ...sinEspera, version: actual.version + 1 });
          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, nueva, { cause: "INCOBRABLE", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          const debe = pendienteDe(actual.cuenta, await periodosDeImpuestos(tx), ahora);
          await auditar(tx, ctx, {
            action: "cuenta.incobrable",
            entityType: "account",
            entityId: nueva.id,
            authorizedBy: permiso.autorizadoPor!,
            reason: cmd.motivo,
            after: {
              orderNumber: nueva.orderNumber ?? null,
              family: nueva.family,
              pendiente: { minor: String(debe.amount), currency: debe.currency },
              detalle: cmd.detalle ?? null,
              autorizadoPor: autorizador.fullName,
            },
          });
          return nueva;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.incobrable", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async autorizadores(ctx, accion = "cobro.anular") {
      return base.conTenant(ctx.tenantId, (tx) => autorizadoresPara(tx, ctx, accion));
    },
  };
}

const MENSAJE_CORTESIA: Record<CourtesyProblem, string> = {
  LINEA_DESCONOCIDA: "Esa línea no está en la cuenta.",
  LINEA_PAGADA: "Lo ya cobrado no se regala: se anula el cobro.",
  LINEA_MOVIDA: "Esa línea se movió a otra cuenta: se regala allí.",
  YA_REGALADA: "Esa línea ya está regalada.",
  NO_REGALADA: "Esa línea no está regalada.",
};

/** Qué asiento es lo que sobra, según su destino (§5.6). */
const TIPO_DE_SOBRA = { VUELTO: "VUELTO", PROPINA: "PROPINA", RESIDUO: "RESIDUO" } as const;

/** ¿Tiene quien opera alguna de estas acciones? Con `nivel`, solo cuenta ese nivel exacto. */
async function puedeAlguna(tx: Transaccion, ctx: Contexto, acciones: readonly Action[], nivel?: "PERMITIDO"): Promise<boolean> {
  for (const a of acciones) {
    const p = await permisoEn(tx, ctx, a);
    if (nivel ? p === nivel : p !== "DENEGADO") return true;
  }
  return false;
}

/** La cuenta de una versión guardada, con su número de versión, validada con el contrato. */
function deVersion(content: unknown, version: number): FamilyAccountDto {
  return FamilyAccountSchema.parse({ ...(content as object), version });
}

/** La última versión de una cuenta que existe, dentro de la transacción. */
export async function vigenteDe(tx: Transaccion, accountId: string): Promise<Vigente | null> {
  const v = await tx.accountVersion.findFirst({ where: { accountId }, orderBy: { version: "desc" } });
  return v ? { cuenta: deVersion(v.content, v.version), version: v.version } : null;
}

/** La cuenta vigente, su libro y la venta del cobro: la respuesta de un cobro o de una anulación. */
async function cuentaYLibro(tx: Transaccion, accountId: string, cobroKey: string, cifrador: Cifrador | null): Promise<CuentaYLibroDto> {
  const vigente = (await vigenteDe(tx, accountId))!;
  const venta: VentaCerradaDto = (await ventaDelCobro(tx, cobroKey, cifrador))!;
  return { cuenta: vigente.cuenta, libro: await leerLibroEn(tx, accountId, cifrador), venta };
}

/** Añade una versión de la cuenta. La base rechaza dos con el mismo número (CONFLICTO al reintentar). */
export async function guardarVersion(
  tx: Transaccion,
  ctx: Contexto,
  cuenta: FamilyAccountDto,
  v: Readonly<{
    cause: "GUARDAR" | "COBRO" | "ANULACION" | "CORTESIA" | "INCOBRABLE" | "ENTRADA" | "SALIDA" | "RECARGA" | "CIERRE_ADMINISTRATIVO";
    operationKey: string | null;
    ahora: number;
    quien: string;
  }>,
): Promise<void> {
  // El número de versión vive en su columna: el contenido es la cuenta sin él.
  const { version, ...contenido } = cuenta;
  await tx.accountVersion.create({
    data: {
      tenantId: ctx.tenantId,
      accountId: cuenta.id,
      version: version!,
      status: cuenta.status,
      content: contenido,
      cause: v.cause,
      operationKey: v.operationKey,
      savedAt: new Date(v.ahora),
      savedBy: ctx.quien?.userId ?? null,
      savedByName: v.quien,
      deviceId: ctx.quien?.deviceId ?? null,
    },
  });
}

/** El siguiente número de orden de la sucursal (D13: continuo). El candado ordena dos altas a la vez. */
export async function siguienteNumero(tx: Transaccion, ctx: Contexto): Promise<number> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`orden:${ctx.branchId}`}, 0))::text AS candado`;
  const r = await tx.account.aggregate({ where: { branchId: ctx.branchId }, _max: { orderNumber: true } });
  return (r._max.orderNumber ?? 0) + 1;
}

/** Lo que es de la pantalla: sin la versión ni lo que pone el servidor. */
function deLaPantalla(c: FamilyAccountDto) {
  const { version: _v, orderNumber: _o, openedAt: _a, pendingSince: _p, ...resto } = c;
  return resto;
}

/** ¿Dicen lo mismo dos cuentas, en lo que decide la pantalla? Las dos pasaron por el contrato. */
function mismaCuenta(a: FamilyAccountDto, b: FamilyAccountDto): boolean {
  return JSON.stringify(deLaPantalla(FamilyAccountSchema.parse(a))) === JSON.stringify(deLaPantalla(FamilyAccountSchema.parse(b)));
}

/** ¿Trae la cuenta líneas nuevas de un producto? Solo entonces hace falta leer el catálogo. */
function hayProductosNuevos(antes: FamilyAccountDto | null, despues: FamilyAccountDto): boolean {
  const previas = new Set((antes?.lines ?? []).map((l) => l.id));
  return despues.lines.some((l) => !previas.has(l.id) && l.productId !== undefined);
}

/** Lo que el catálogo vende en `ahora`: su nombre, su precio y su trato del IVA (B9-1). */
async function catalogoEn(tx: Transaccion, ahora: number): Promise<(productId: string) => ProductAtNow | null> {
  const [productos, precios] = await Promise.all([
    tx.product.findMany({ select: { id: true, name: true, active: true, taxCode: true } }),
    tx.productPrice.findMany(),
  ]);
  const tramos = priceTimeline(
    precios.map((f) => ({ id: f.id, productId: f.productId, amountMinor: f.amountMinor, effectiveFrom: f.effectiveFrom.getTime(), scheduledAt: f.scheduledAt.getTime() })),
  );
  const porId = new Map(productos.map((p) => [p.id, p]));
  return (productId) => {
    const p = porId.get(productId);
    const tramo = p?.active ? periodAt(tramos, productId, ahora) : undefined;
    return p && tramo ? { name: p.name, amountMinor: tramo.amountMinor, taxCode: p.taxCode as TaxCode } : null;
  };
}

/**
 * Lo que se debe de una cuenta en `ahora`, en dólares: lo cobrable con el IVA de ese instante y, si
 * está dividida, las partes que faltan. Sin el IGTF, que depende de cómo se pague. Sin IVA vigente
 * (no se podría cobrar), lo cobrable sin impuesto: la cifra es para enseñar, no para cobrar.
 */
export function pendienteDe(c: FamilyAccountDto, periodos: TaxPeriods, ahora: number): Money {
  const lineas = documentLinesOf(c);
  if (lineas.length === 0) return zero(FUNCIONAL);
  try {
    const total = computeDocument({ lines: lineas, rules: ivaRulesOf(periodos), at: ahora, currency: FUNCIONAL }).total;
    if (!c.split || c.split.paid >= c.split.parts) return total;
    return allocate(total, c.split.parts).slice(c.split.paid).reduce<Money>((acc, p) => add(acc, p), zero(FUNCIONAL));
  } catch (e) {
    if (!(e instanceof NoApplicableRuleError)) throw e;
    return chargeableLines(c).reduce<Money>((acc, l) => add(acc, money(BigInt(l.amount.minor), FUNCIONAL)), zero(FUNCIONAL));
  }
}

/** Los periodos de impuestos de la base, como los lee el dominio. */
export type TaxPeriods = ReturnType<typeof taxTimeline>;
export const periodosDeImpuestos = async (tx: Transaccion): Promise<TaxPeriods> => taxTimeline((await tx.taxRate.findMany()).map(programadaDeFila));

/** Lo que va a la auditoría de una cuenta: su forma, no su contenido entero. */
function resumenDe(c: FamilyAccountDto) {
  return {
    kind: c.kind,
    version: c.version ?? null,
    orderNumber: c.orderNumber ?? null,
    status: c.status,
    lineas: c.lines.length,
    pagadas: c.lines.filter((l) => l.paid).length,
    split: c.split ?? null,
  };
}

/** Un rechazo del libro dicho en los términos del cobro: sus asientos son los pagos de la caja. */
function renombrarRuta(r: Rechazo, de: string, a: string): Rechazo {
  return r.problemas ? { ...r, problemas: r.problemas.map((p) => ({ ...p, path: p.path.map((x) => (x === de ? a : x)) })) } : r;
}
