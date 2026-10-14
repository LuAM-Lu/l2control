/**
 * Lo que administración hace con lo que debe el personal — B3-26 (M-39, X-6).
 *
 * «Descontado en la quincena»: el personal paga fuera del sistema, en su quincena; se marca por persona y periodo (lo de
 * después de la marca anterior) y deja de estar pendiente. No toca la gaveta. «Anular vale», de cualquier día: no movió
 * dinero; las líneas del vale quedan anuladas en su cuenta y cada cosa vuelve al estante o sale como merma. Las dos con
 * el PIN de administración (como anular un cobro, B3-18), y quedan en la auditoría.
 *
 * Vive aparte de `personal.ts` porque usa la cuenta (`cuentas.ts`), que a su vez imprime el vale con `personal.ts`.
 */
import {
  AnularValeCommandSchema,
  DescontarQuincenaCommandSchema,
  FamilyAccountSchema,
  problemasDe,
  type DescuentoDeQuincenaDto,
  type Rechazo,
  type Resultado,
  type ValeDto,
} from "@l2/contracts";
import { withAnulacion } from "@l2/domain-cash";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { nombreDe } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import type { Cifrador } from "../identidad/cifrado.ts";
import { asentarExistencias, comprobarExistencias } from "../inventario/existencias.ts";
import { aMerma, claveSecundaria, guardarVersion, vigenteDe } from "./cuentas.ts";
import { movimientoDto } from "./efectivo.ts";
import { ventaDe } from "./ventas.ts";
import { CON_LA_VENTA, USD, anulacionesDe, descuentoDto, dia, orden, valeDe } from "./personal.ts";

export interface CasosAdministraPersonal {
  /** «Descontado en la quincena» (B3-26): administración, con su PIN; no toca la gaveta. */
  descontar(ctx: Contexto, entrada: unknown, autorizacion: unknown, ahora?: number): Promise<Resultado<DescuentoDeQuincenaDto>>;
  /** Anula un vale de cualquier día (B3-26): administración, con su PIN; cada cosa al estante o a merma. */
  anularVale(ctx: Contexto, entrada: unknown, autorizacion: unknown, ahora?: number): Promise<Resultado<ValeDto>>;
}

const CON_PIN = { confirmarConPin: true } as const;

export function casosAdministraPersonal(base: Base, cifrador: Cifrador | null): CasosAdministraPersonal {
  return {
    async descontar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = DescontarQuincenaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se marcó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<DescuentoDeQuincenaDto | Rechazo> => {
        const previa = await tx.staffPayrollDeduction.findFirst({ where: { operationKey: cmd.idempotencyKey } });
        if (previa) return descuentoDto(previa);
        // Administración, con su PIN (como anular un cobro, B3-18): no mueve la gaveta, pero cierra lo que se debe.
        const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cobro.anular", autorizacion, ahora, CON_PIN);
        if (!permiso.ok) return permiso;
        const persona = await tx.staffUser.findUnique({ where: { id: cmd.persona }, select: { id: true, fullName: true } });
        if (!persona) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa persona no es de este local." };
        // De una en una por persona (dos equipos a la vez no descuentan dos veces lo mismo).
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`descuento:${ctx.branchId}:${persona.id}`}, 0))::text AS candado`;
        // La marca anterior de esta quincena: lo que ya se descontó no se descuenta otra vez.
        const anterior = await tx.staffPayrollDeduction.findFirst({
          where: { branchId: ctx.branchId, staffUserId: persona.id, periodFrom: dia(cmd.desde) },
          orderBy: { markedAt: "desc" },
        });
        const tras = anterior?.markedAt.getTime() ?? 0;
        // Lo de este momento, después de la marca anterior: lo consumido (sin lo anulado ni lo devuelto) y lo adelantado.
        const filas = await tx.staffConsumption.findMany({
          where: { branchId: ctx.branchId, staffUserId: persona.id, businessDate: { gte: dia(cmd.desde), lte: dia(cmd.hasta) }, at: { gt: new Date(tras) } },
          include: CON_LA_VENTA,
        });
        const anulados = await anulacionesDe(tx, filas.map((f) => f.id));
        const consumido = filas.map((f) => valeDe(f, cifrador, anulados.get(f.id) ?? null)).reduce((n, x) => n + BigInt(x.neto.minor), 0n);
        const adelantado = (
          await tx.cashMovement.findMany({
            where: {
              branchId: ctx.branchId,
              reason: "ADELANTO",
              staffUserId: persona.id,
              businessDate: { gte: dia(cmd.desde), lte: dia(cmd.hasta) },
              recordedAt: { gt: new Date(tras) },
            },
          })
        ).map(movimientoDto).reduce((n, a) => n + BigInt(a.enDolares.minor), 0n);
        if (consumido + adelantado === 0n) {
          return anterior
            ? { ok: false, motivo: "CONFLICTO", mensaje: `Esa quincena ya se descontó (${anterior.markedByName}).`, problemas: [{ path: ["persona"], message: "YA_DESCONTADA" }] }
            : { ok: false, motivo: "CONFLICTO", mensaje: `${persona.fullName} no tiene nada pendiente en esta quincena.`, problemas: [{ path: ["persona"], message: "NADA_QUE_DESCONTAR" }] };
        }
        const quien = await nombreDe(tx, ctx);
        const fila = await tx.staffPayrollDeduction.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            staffUserId: persona.id,
            staffName: persona.fullName,
            periodFrom: dia(cmd.desde),
            periodTo: dia(cmd.hasta),
            consumedMinor: consumido,
            advancedMinor: adelantado,
            currency: "USD",
            operationKey: cmd.idempotencyKey,
            markedAt: new Date(ahora),
            markedBy: ctx.quien?.userId ?? null,
            markedByName: quien.nombre,
            authorizedBy: permiso.autorizadoPor ?? ctx.quien!.userId!,
          },
        });
        await auditar(tx, ctx, {
          action: "personal.descontar",
          entityType: "staff_payroll_deduction",
          entityId: fila.id,
          authorizedBy: fila.authorizedBy,
          after: { persona: persona.fullName, desde: cmd.desde, hasta: cmd.hasta, consumido: USD(consumido), adelantado: USD(adelantado) },
        });
        return descuentoDto(fila);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "personal.descontar", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async anularVale(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AnularValeCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se anuló: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ValeDto | Rechazo> => {
        const c = await tx.staffConsumption.findUnique({ where: { id: cmd.valeId }, include: CON_LA_VENTA });
        if (!c || c.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese vale no existe en esta sucursal." };
        const previa = await tx.staffConsumptionVoid.findFirst({ where: { consumptionId: c.id } });
        if (previa) {
          return previa.operationKey === cmd.idempotencyKey
            ? valeDe(c, cifrador, previa)
            : { ok: false, motivo: "CONFLICTO", mensaje: `Ese vale ya se anuló (${previa.voidedByName}).`, problemas: [{ path: ["valeId"], message: "YA_ANULADO" }] };
        }
        const venta = ventaDe(c.sale, cifrador);
        if (venta.voided) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese vale ya se anuló con su venta.", problemas: [{ path: ["valeId"], message: "YA_ANULADO" }] };
        const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cobro.anular", autorizacion, ahora, CON_PIN);
        if (!permiso.ok) return permiso;
        const autorizadoPor = permiso.autorizadoPor ?? ctx.quien!.userId!;
        const autorizador = await tx.staffUser.findUniqueOrThrow({ where: { id: autorizadoPor }, select: { id: true, fullName: true, role: true } });

        // Las líneas del vale quedan anuladas en su cuenta, y lo suyo vuelve al estante (o vuelve y sale como merma).
        const actual = (await vigenteDe(tx, c.sale.accountId))!;
        const ids = venta.lineas.map((l) => l.lineId);
        const anulables = ids.filter((id) => actual.cuenta.lines.some((l) => l.id === id && !l.anulacion));
        const enMerma = new Set(cmd.aMerma.map((i) => ids[i]).filter((x): x is string => x !== undefined));
        const anulacion = {
          motivo: "OTRO" as const,
          detalle: `Vale anulado${cmd.nota ? ` · ${cmd.nota}` : ""}`.slice(0, 120),
          autorizadaPor: { id: autorizador.id, name: autorizador.fullName, role: autorizador.role },
          en: new Date(ahora).toISOString(),
        };
        const conAnulacion = anulables.reduce((x, id) => withAnulacion(x, id, { ...anulacion, preparado: enMerma.has(id) }), actual.cuenta);
        const devolucion = await comprobarExistencias(tx, ctx, actual.cuenta.id, actual.cuenta.lines, actual.cuenta.lines.filter((l) => !anulables.includes(l.id)), () => ["valeId"]);
        if ("ok" in devolucion) return devolucion;
        const merma = await comprobarExistencias(tx, ctx, actual.cuenta.id, actual.cuenta.lines, actual.cuenta.lines.filter((l) => !enMerma.has(l.id)), () => ["aMerma"]);
        if ("ok" in merma) return merma;
        const quien = await nombreDe(tx, ctx);
        const nueva = FamilyAccountSchema.parse({ ...conAnulacion, version: actual.version + 1 });
        await guardarVersion(tx, ctx, nueva, { cause: "ANULACION", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
        await asentarExistencias(tx, ctx, devolucion, { accountId: nueva.id, version: nueva.version!, ahora, quien: quien.nombre });
        await aMerma(tx, ctx, merma, {
          nota: `Vale anulado · ${c.staffName} · orden ${orden(c.sale.orderNumber)}`,
          operationKey: claveSecundaria(cmd.idempotencyKey, "merma"),
          autorizadoPor: autorizador.id,
          resumen: { motivo: "MERMA", valeAnulado: { vale: c.id, orden: c.sale.orderNumber } },
          ahora,
        });
        const anulada = await tx.staffConsumptionVoid.create({
          data: {
            tenantId: ctx.tenantId,
            consumptionId: c.id,
            content: venta.lineas.map((l) => ({ lineId: l.lineId, concepto: l.concept, destino: enMerma.has(l.lineId) ? "MERMA" : "ESTANTE" })),
            note: cmd.nota ?? null,
            operationKey: cmd.idempotencyKey,
            voidedAt: new Date(ahora),
            voidedBy: ctx.quien?.userId ?? null,
            voidedByName: quien.nombre,
            authorizedBy: autorizador.id,
          },
        });
        await auditar(tx, ctx, {
          action: "personal.anular_vale",
          entityType: "staff_consumption",
          entityId: c.id,
          authorizedBy: autorizador.id,
          after: { orden: c.sale.orderNumber, persona: c.staffName, total: USD(c.totalMinor), merma: enMerma.size },
        });
        return valeDe(c, cifrador, anulada);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "personal.anular_vale", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}
