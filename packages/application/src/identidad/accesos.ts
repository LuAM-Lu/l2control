/**
 * Los ajustes de la sucursal sobre la matriz de roles — F2-13 (N-05).
 *
 * La matriz de §7.3 es la base; un local la ajusta rol por rol, con motivo y autor, sin
 * reescribirla y sin desplegar. Hay un suelo que ninguna sucursal toca (`esAjustable`): la fila
 * de administración y las dos llaves de la casa. Retirar un ajuste no lo borra: pone
 * `retired_at`, y la matriz vuelve a mandar.
 */
import { esAjustable } from "@l2/domain-identity";
import {
  BranchAccessSchema,
  RoleAdjustmentCommandSchema,
  problemasDe,
  type BranchAccessDto,
  type Resultado,
} from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { esAccion, esRol, exigirPermiso, nombreDe } from "./actor.ts";

export interface CasosAccesos {
  /** Los ajustes vigentes de la sucursal (`usuarios.gestionar`). */
  leer(ctx: Contexto): Promise<Resultado<BranchAccessDto>>;
  /** AJUSTAR una celda o RETIRAR su ajuste (`RoleAdjustmentCommand`). */
  ordenar(ctx: Contexto, comando: unknown): Promise<Resultado<BranchAccessDto>>;
}

async function vigentes(tx: Transaccion, branchId: string): Promise<BranchAccessDto> {
  const filas = await tx.roleAdjustment.findMany({ where: { branchId, retiredAt: null }, orderBy: { at: "asc" } });
  return BranchAccessSchema.parse({
    branchId,
    adjustments: filas.map((a) => ({
      role: a.role,
      action: a.action,
      permission: a.permission,
      by: a.byUserId ?? "sistema",
      byName: a.byName,
      reason: a.reason,
      at: a.at.toISOString(),
    })),
  });
}

export function casosAccesos(base: Base): CasosAccesos {
  return {
    leer(ctx) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<BranchAccessDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        return { ok: true, valor: await vigentes(tx, ctx.branchId) };
      });
    },

    async ordenar(ctx, entrada) {
      const cmd = RoleAdjustmentCommandSchema.safeParse(entrada);
      if (!cmd.success) return { ok: false, motivo: "INVALIDO", mensaje: "El ajuste no es válido.", problemas: problemasDe(cmd.error) };
      const c = cmd.data;
      const accion = c.kind === "AJUSTAR" ? "acceso.ajustar" : "acceso.retirar";
      if (c.branchId !== ctx.branchId) {
        return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Solo se ajustan los accesos de la sucursal en la que estás." };
      }
      if (!esRol(c.role) || !esAccion(c.action)) return { ok: false, motivo: "INVALIDO", mensaje: "Ese rol o esa acción no existen." };
      if (!esAjustable(c.role, c.action)) {
        return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Esa celda es del suelo que ninguna sucursal toca." };
      }

      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<BranchAccessDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        const previo = await tx.roleAdjustment.findFirst({ where: { branchId: c.branchId, role: c.role, action: c.action, retiredAt: null } });
        if (c.kind === "RETIRAR" && !previo) return { ok: false, motivo: "INVALIDO", mensaje: "Ese rol no tiene ajuste en esa acción." };
        if (previo) await tx.roleAdjustment.update({ where: { id: previo.id }, data: { retiredAt: new Date() } });
        const quien = await nombreDe(tx, ctx);
        if (c.kind === "AJUSTAR") {
          await tx.roleAdjustment.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: c.branchId,
              role: c.role,
              action: c.action,
              permission: c.permission,
              reason: c.reason,
              byUserId: quien.id === "sistema" ? null : quien.id,
              byName: quien.nombre,
            },
          });
        }
        await auditar(tx, ctx, {
          action: accion,
          entityType: "role_adjustment",
          entityId: `${c.role}:${c.action}`,
          before: previo ? { nivel: previo.permission } : null,
          after: c.kind === "AJUSTAR" ? { nivel: c.permission } : null,
          reason: c.reason,
        });
        return { ok: true, valor: await vigentes(tx, c.branchId) };
      });
      if (!r.ok && r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
      return r;
    },
  };
}
