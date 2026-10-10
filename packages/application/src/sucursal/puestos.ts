/**
 * Los puestos, por uso — T-20 (M-37, U-14).
 *
 * De cada puesto de servicio (caja, parque, mesas), la primera actividad del día (la llegada) y la última, sacadas de la
 * auditoría del día en la sucursal: cada asiento con su persona cuenta para el puesto de lo que hizo
 * (`puestoDeLaActividad`), sea del rol que sea. La cuenta de soporte (T-17) no ocupa puestos del local. Y desde cuándo
 * está abierta la caja: sin caja abierta, un puesto vacío no avisa. Lo lee quien ve la sucursal (Inicio).
 */
import { PuestosDelDiaSchema, type PuestosDelDiaDto, type Rechazo, type Resultado } from "@l2/contracts";
import { PUESTOS_DE_SERVICIO, puestoDeLaActividad, type PuestoDeServicio, type Role } from "@l2/domain-identity";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { zonaDe } from "./ajustes.ts";

export interface CasosPuestos {
  /** Los puestos del día de hoy en la sucursal: su llegada y su última actividad. */
  delDia(ctx: Contexto, ahora?: number): Promise<Resultado<PuestosDelDiaDto>>;
}

type Marca = { en: Date; quien: string; equipo: string | null };

export function casosPuestos(base: Base): CasosPuestos {
  return {
    async delDia(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PuestosDelDiaDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const zona = await zonaDe(tx, ctx.branchId);
        const hoy = new Date(startOfDay(calendarDay(new Date(ahora).toISOString(), zona), zona));
        const asientos = await tx.auditEntry.findMany({
          where: { branchId: ctx.branchId, occurredAt: { gte: hoy }, actorId: { not: null } },
          select: { occurredAt: true, action: true, actorId: true, deviceId: true },
          orderBy: { occurredAt: "asc" },
        });
        const personas = new Map(
          (
            await tx.staffUser.findMany({
              where: { id: { in: [...new Set(asientos.map((a) => a.actorId!))] } },
              select: { id: true, fullName: true, role: true, supportLogin: true },
            })
          ).map((u) => [u.id, u]),
        );
        const equipos = new Map(
          (await tx.device.findMany({ where: { id: { in: [...new Set(asientos.flatMap((a) => (a.deviceId ? [a.deviceId] : [])))] } }, select: { id: true, label: true, cashPoint: true } })).map(
            (d) => [d.id, d],
          ),
        );
        const primera = new Map<PuestoDeServicio, Marca>();
        const ultima = new Map<PuestoDeServicio, Marca>();
        for (const a of asientos) {
          const quien = personas.get(a.actorId!);
          if (!quien || quien.supportLogin) continue;
          const equipo = a.deviceId ? equipos.get(a.deviceId) : undefined;
          const puesto = puestoDeLaActividad({ accion: a.action, rol: quien.role as Role, enPuntoDeCobro: equipo?.cashPoint ?? false });
          if (!puesto) continue;
          const marca = { en: a.occurredAt, quien: quien.fullName, equipo: equipo?.label ?? null };
          if (!primera.has(puesto)) primera.set(puesto, marca);
          ultima.set(puesto, marca);
        }
        const abierta = await tx.cashShift.findFirst({ where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" } }, orderBy: { openedAt: "asc" }, select: { openedAt: true } });
        return PuestosDelDiaSchema.parse({
          cajaAbiertaDesde: abierta?.openedAt.toISOString() ?? null,
          puestos: PUESTOS_DE_SERVICIO.map((puesto) => {
            const p1 = primera.get(puesto);
            const u = ultima.get(puesto);
            return {
              puesto,
              primera: p1 ? { en: p1.en.toISOString(), quien: p1.quien } : null,
              ultima: u ? { en: u.en.toISOString(), quien: u.quien, equipo: u.equipo } : null,
            };
          }),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
