/**
 * El turno de caja en el servidor — B3-1, F4-01, I-06, ADR-009.
 *
 * Un equipo, un turno sin corte Z (la base lo impone). Abrirlo declara el fondo de la gaveta por
 * moneda; el equipo, quién, la hora y el día de negocio los pone el servidor desde la sesión
 * (ADR-017). Sin turno abierto en el equipo no se cobra: el libro de pagos lo exige (`turnoParaCobrar`).
 *
 * El día de negocio es el del local al abrir el turno (ADR-009): lo que se cobre en él cuenta en
 * ese día aunque sea a la 1:30 am. Los cortes X y Z y el arqueo guardado llegan con B3-5.
 */
import { AbrirTurnoCommandSchema, TurnoSchema, problemasDe, type Rechazo, type Resultado, type TurnoDto } from "@l2/contracts";
import { chargeProblem, openingFloatProblem, type ShiftStatus } from "@l2/domain-cash";
import { money, type CurrencyCode } from "@l2/domain-money";
import { calendarDay } from "@l2/domain-rates";
import { errorDeBase, type Base, type CashShift, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn } from "../identidad/actor.ts";
import { zonaDe } from "../sucursal/ajustes.ts";

export interface CasosTurnos {
  /** Abre el turno del equipo de la sesión con su fondo por moneda. */
  abrir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<TurnoDto>>;
  /** El turno sin corte Z del equipo de la sesión, o `null`. No exige permiso: la barra lo enseña. */
  delEquipo(ctx: Contexto): Promise<TurnoDto | null>;
  /** Los turnos sin corte Z de la sucursal, para Inicio. Vacío para quien no ve la sucursal. */
  abiertos(ctx: Contexto): Promise<TurnoDto[]>;
}

export type ConFondos = CashShift & { floats: { currency: string; amountMinor: bigint }[] };

/** El turno sin corte Z de un equipo, dentro de una transacción ya abierta. */
export function turnoSinCorteDe(tx: Transaccion, deviceId: string) {
  return tx.cashShift.findFirst({ where: { deviceId, status: { not: "CERRADO_Z" } }, include: { floats: true } });
}

/**
 * El turno en el que puede cobrar el equipo de `ctx`, o el rechazo (F4-01, I-14): sin turno
 * abierto no se cobra, y con corte Z tampoco.
 */
export async function turnoParaCobrar(tx: Transaccion, ctx: Contexto): Promise<CashShift | Rechazo> {
  const turno = ctx.quien?.deviceId ? await turnoSinCorteDe(tx, ctx.quien.deviceId) : null;
  const problema = chargeProblem(turno ? { status: turno.status as ShiftStatus } : null);
  if (problema || !turno) {
    return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Este equipo no tiene turno abierto: sin turno no se cobra. Ábrelo en Turno." };
  }
  return turno;
}

export function casosTurnos(base: Base): CasosTurnos {
  return {
    async abrir(ctx, entrada, ahora = Date.now()) {
      const v = AbrirTurnoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El turno no se abrió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const fondos = v.data.fondos.map((f) => money(BigInt(f.amount.minor), f.currency as CurrencyCode));
      const problema = openingFloatProblem(fondos);
      if (problema) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El turno no se abrió: revisa el fondo.", problemas: [{ path: ["fondos"], message: problema }] };
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ConFondos | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "turno.abrir");
          if (rechazo) return rechazo;
          // El turno es del equipo (I-06): sin equipo aprobado no hay dónde abrirlo.
          const deviceId = ctx.quien?.deviceId;
          const equipo = deviceId ? await tx.device.findUnique({ where: { id: deviceId } }) : null;
          if (!equipo || equipo.status !== "APROBADO" || !ctx.quien?.userId) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "El turno se abre desde un equipo aprobado, con tu sesión." };
          }
          if (await turnoSinCorteDe(tx, equipo.id)) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Este equipo ya tiene un turno abierto." };
          }
          const quien = await nombreDe(tx, ctx);
          // El día de negocio lo fija la zona de la sucursal (ADR-009, B4-4).
          const dia = calendarDay(new Date(ahora).toISOString(), await zonaDe(tx, ctx.branchId));
          const turno = await tx.cashShift.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              deviceId: equipo.id,
              pointLabel: equipo.label,
              businessDate: new Date(`${dia}T00:00:00.000Z`),
              status: "ABIERTO",
              openedAt: new Date(ahora),
              openedBy: ctx.quien.userId,
              openedByName: quien.nombre,
            },
          });
          const floats = [];
          for (const f of fondos) {
            floats.push(await tx.cashShiftFloat.create({ data: { tenantId: ctx.tenantId, shiftId: turno.id, currency: f.currency, amountMinor: f.amount } }));
          }
          await auditar(tx, ctx, {
            action: "turno.abrir",
            entityType: "cash_shift",
            entityId: turno.id,
            after: {
              punto: turno.pointLabel,
              businessDate: dia,
              fondos: floats.map((f) => ({ currency: f.currency, amountMinor: String(f.amountMinor) })),
            },
          });
          return { ...turno, floats };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "turno.abrir", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: turnoDto(r) };
      } catch (e) {
        // Dos aperturas a la vez en el mismo equipo: la base deja una (I-06).
        if (errorDeBase(e)?.motivo === "DUPLICADO") return { ok: false, motivo: "CONFLICTO", mensaje: "Este equipo ya tiene un turno abierto." };
        throw e;
      }
    },

    async abiertos(ctx) {
      const filas = await base.conTenant(ctx.tenantId, async (tx) => {
        if ((await permisoEn(tx, ctx, "reportes.verSucursal")) === "DENEGADO") return [];
        return tx.cashShift.findMany({
          where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" } },
          include: { floats: true },
          orderBy: { openedAt: "asc" },
        });
      });
      return filas.map(turnoDto);
    },

    async delEquipo(ctx) {
      const deviceId = ctx.quien?.deviceId;
      if (!deviceId) return null;
      const t = await base.conTenant(ctx.tenantId, (tx) => turnoSinCorteDe(tx, deviceId));
      return t ? turnoDto(t) : null;
    },
  };
}

/** El turno en la forma del contrato, revalidado al salir (fail-closed). */
export function turnoDto(t: ConFondos): TurnoDto {
  return TurnoSchema.parse({
    id: t.id,
    deviceId: t.deviceId,
    punto: t.pointLabel,
    businessDate: t.businessDate.toISOString().slice(0, 10),
    estado: t.status,
    abiertoPor: { id: t.openedBy, name: t.openedByName },
    abiertoEn: t.openedAt.toISOString(),
    fondos: t.floats.map((f) => ({ currency: f.currency, amount: { minor: String(f.amountMinor), currency: f.currency } })),
    ...(t.closedAt && t.closedBy && t.closedByName
      ? { cerradoPor: { id: t.closedBy, name: t.closedByName }, cerradoEn: t.closedAt.toISOString() }
      : {}),
  });
}
