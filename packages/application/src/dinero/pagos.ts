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
 * Lo que aún no hace, y hace B3-3: comprobar que el cobro cuadra contra el total del documento y
 * que la tasa citada es la vigente (hasta entonces basta con que esté confirmada).
 */
import {
  AsentarPagosCommandSchema,
  LibroDocumentoSchema,
  RevertirPagoCommandSchema,
  problemasDe,
  type AsentarPagosCommand,
  type AsientoDto,
  type LibroDocumentoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import {
  LEDGER_METHODS,
  entryProblem,
  ledgerBalance,
  reversalOf,
  reversalProblem,
  type LedgerEntry,
  type LedgerKind,
  type LedgerMethod,
} from "@l2/domain-cash";
import { money, zero, type CurrencyCode, type FrozenRate, type Money } from "@l2/domain-money";
import { frozenRateOf } from "@l2/domain-rates";
import { NoIgtfRuleError, computeIgtf, igtfAt, taxTimeline } from "@l2/domain-tax";
import { errorDeBase, type Base, type Payment, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { programadaDeFila } from "./impuestos.ts";

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

export function casosPagos(base: Base): CasosPagos {
  /** El libro de un documento, dentro de una transacción ya abierta. */
  const leerLibro = async (tx: Transaccion, documentId: string): Promise<LibroDocumentoDto> =>
    libroDe(documentId, await tx.payment.findMany({ where: { documentId }, orderBy: [{ recordedAt: "asc" }, { line: "asc" }] }));

  /** Lo ya asentado con esta clave, si lo hay. */
  const yaAsentado = (tx: Transaccion, operationKey: string) =>
    tx.payment.findMany({ where: { operationKey }, orderBy: { line: "asc" } });

  return {
    async asentar(ctx, entrada, ahora = Date.now()) {
      const v = AsentarPagosCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cobro no se asentó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<LibroDocumentoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
          if (rechazo) return rechazo;

          const previas = await yaAsentado(tx, cmd.idempotencyKey);
          if (previas.length > 0) return mismaOperacion(previas, cmd) ? leerLibro(tx, cmd.documentId) : conflictoDeClave;

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

          const nuevos = cmd.asientos.map((a) => ({
            kind: a.kind as LedgerKind,
            method: a.method as LedgerMethod,
            amount: money(BigInt(a.amount.minor), a.amount.currency),
            rate: a.rateId ? tasas.get(a.rateId)! : null,
          }));
          for (const [i, n] of nuevos.entries()) {
            const problema = entryProblem({ ...n, rate: n.rate?.frozen ?? null });
            if (problema) return invalido("El cobro no se asentó: hay un asiento que no vale.", ["asientos", i], problema);
          }

          // El IGTF de cada cobro en divisas (§5.5), con la alícuota del instante. Sin ella no se
          // cobra en divisas: suponer 0 % sería no retener en silencio.
          let igtfBps: number | null = null;
          if (nuevos.some((n) => n.kind === "COBRO" && LEDGER_METHODS[n.method].triggersIgtfByDefault)) {
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
            const igtf = igtfDe(n.kind, n.method, n.amount, igtfBps);
            filas.push(
              await tx.payment.create({
                data: {
                  tenantId: ctx.tenantId,
                  branchId: ctx.branchId,
                  documentId: cmd.documentId,
                  operationKey: cmd.idempotencyKey,
                  line: i,
                  kind: n.kind,
                  method: n.method,
                  currency: n.amount.currency,
                  amountMinor: n.amount.amount,
                  igtfMinor: igtf.amount,
                  rateId: cmd.asientos[i]!.rateId ?? null,
                  rateValue: n.rate?.value ?? null,
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
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cobro.anular", autorizacion, ahora);
          if (!permiso.ok) return permiso;

          const original = await tx.payment.findUnique({ where: { id: cmd.paymentId } });
          if (!original) return noExiste;
          const delDocumento = await tx.payment.findMany({ where: { documentId: original.documentId } });
          const problema = reversalProblem(entrada_(original), delDocumento.map(entrada_));
          if (problema === "YA_REVERTIDO") return { ok: false, motivo: "CONFLICTO", mensaje: "Ese asiento ya se revirtió." };
          if (problema === "ES_UNA_REVERSION") {
            return invalido("Una reversión no se revierte: si hay que volver a cobrar, es un cobro nuevo.", ["paymentId"], problema);
          }

          const rev = reversalOf(entrada_(original));
          const quien = await nombreDe(tx, ctx);
          const autorizador = permiso.autorizadoPor
            ? await tx.staffUser.findUnique({ where: { id: permiso.autorizadoPor }, select: { fullName: true } })
            : null;
          const fila = await tx.payment.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: original.branchId,
              documentId: original.documentId,
              operationKey: cmd.idempotencyKey,
              line: 0,
              kind: rev.kind,
              method: rev.method,
              currency: rev.amount.currency,
              amountMinor: rev.amount.amount,
              igtfMinor: rev.igtf.amount,
              rateId: original.rateId,
              rateValue: original.rateValue,
              reversesId: original.id,
              reason: cmd.motivo,
              reasonDetail: cmd.detalle ?? null,
              recordedAt: new Date(ahora),
              recordedBy: ctx.quien?.userId ?? null,
              recordedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              authorizedBy: permiso.autorizadoPor,
              authorizedByName: autorizador?.fullName ?? null,
            },
          });
          await auditar(tx, ctx, {
            action: "pago.revertir",
            entityType: "payment",
            entityId: original.id,
            ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
            reason: cmd.motivo,
            before: resumen(original),
            after: { reversion: resumen(fila), detalle: cmd.detalle ?? null },
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

const conflictoDeClave: Rechazo = {
  ok: false,
  motivo: "CONFLICTO",
  mensaje: "Esa clave ya se usó para otra operación. Vuelve a intentarlo desde la pantalla.",
};

/** ¿Lo ya asentado con la clave es exactamente lo que se pide ahora? */
function mismaOperacion(filas: readonly Payment[], cmd: AsentarPagosCommand): boolean {
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
        f.rateId === (a.rateId ?? null)
      );
    })
  );
}

/** El IGTF de un asiento: solo un cobro en un medio que lo dispara (§5.5). */
function igtfDe(kind: LedgerKind, method: LedgerMethod, amount: Money, bps: number | null): Money {
  const m = LEDGER_METHODS[method];
  if (kind !== "COBRO" || !m.triggersIgtfByDefault || bps === null) return zero(amount.currency);
  const r = computeIgtf([{ method: { code: method, label: method, currency: m.currency, triggersIgtf: true }, amount }], bps, amount.currency);
  return r.lines[0]?.igtf ?? zero(amount.currency);
}

/** La fila, como la entiende el dominio. */
function entrada_(f: Payment): LedgerEntry {
  return {
    id: f.id,
    kind: f.kind as LedgerKind,
    method: f.method as LedgerMethod,
    amount: money(f.amountMinor, f.currency as CurrencyCode),
    igtf: money(f.igtfMinor, f.currency as CurrencyCode),
    rate: f.rateValue ? frozenRateOf({ pair: "USD/VES", value: f.rateValue }) : null,
    reversesId: f.reversesId,
  };
}

/** Lo que va a la auditoría de un asiento: sin datos sensibles (no hay referencias aquí). */
function resumen(f: Payment) {
  return { id: f.id, kind: f.kind, method: f.method, amountMinor: String(f.amountMinor), currency: f.currency, igtfMinor: String(f.igtfMinor), rateValue: f.rateValue };
}

const dinero = (m: Money) => ({ minor: String(m.amount), currency: m.currency });

/** El libro de un documento en la forma del contrato, con su saldo calculado. */
function libroDe(documentId: string, filas: readonly Payment[]): LibroDocumentoDto {
  const saldo = ledgerBalance(filas.map(entrada_), FUNCIONAL);
  const asientos: AsientoDto[] = filas.map((f) => ({
    id: f.id,
    documentId: f.documentId,
    kind: f.kind as AsientoDto["kind"],
    method: f.method as AsientoDto["method"],
    amount: { minor: String(f.amountMinor), currency: f.currency as AsientoDto["amount"]["currency"] },
    igtf: { minor: String(f.igtfMinor), currency: f.currency as AsientoDto["igtf"]["currency"] },
    rate: f.rateId && f.rateValue ? { id: f.rateId, value: f.rateValue } : null,
    reversesId: f.reversesId,
    reversedById: filas.find((x) => x.reversesId === f.id)?.id ?? null,
    motivo: (f.reason as AsientoDto["motivo"]) ?? null,
    detalle: f.reasonDetail,
    recordedAt: f.recordedAt.toISOString(),
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
