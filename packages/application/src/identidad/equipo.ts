/**
 * Las personas del equipo (F2-10). Aquí, de momento, lo que necesitan las semillas y la consola:
 * asegurar que una persona existe con su rol, su sucursal y su PIN. Dar altas, bajas, cambios de
 * rol y excepciones desde el panel llega con B1-5 a este mismo archivo.
 */
import { hash } from "@node-rs/argon2";
import { checkNewPin, type Role } from "@l2/domain-identity";
import type { Rechazo } from "@l2/contracts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";

export interface PersonaASembrar {
  readonly nombre: string;
  readonly role: Role;
  readonly pin: string;
  readonly activa?: boolean;
}

export interface CasosEquipo {
  /**
   * Crea la persona si no hay ninguna con ese nombre en el tenant; si ya existe, no la toca.
   * Solo desde el sistema (semillas y consola): una persona no se da de alta a sí misma.
   */
  asegurar(ctx: Contexto, p: PersonaASembrar): Promise<{ ok: true; creada: boolean; id: string } | Rechazo>;
}

export function casosEquipo(base: Base): CasosEquipo {
  return {
    async asegurar(ctx, p) {
      if (!ctx.sistema) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Solo la consola del servidor siembra personas." };
      const pin = checkNewPin(p.pin);
      if (!pin.ok) return { ok: false, motivo: "INVALIDO", mensaje: pin.message };
      const pinHash = await hash(p.pin);

      return base.conTenant(ctx.tenantId, async (tx) => {
        const existente = await tx.staffUser.findFirst({ where: { fullName: p.nombre } });
        if (existente) return { ok: true as const, creada: false, id: existente.id };

        const u = await tx.staffUser.create({
          data: { tenantId: ctx.tenantId, fullName: p.nombre, role: p.role, active: p.activa ?? true, pinHash },
        });
        await tx.staffUserBranch.create({ data: { tenantId: ctx.tenantId, userId: u.id, branchId: ctx.branchId } });
        await tx.staffUserChange.create({
          data: { tenantId: ctx.tenantId, userId: u.id, kind: "ALTA", toRole: p.role, reason: "Alta desde la consola del servidor", byName: "Consola del servidor" },
        });
        await auditar(tx, ctx, { action: "usuario.alta", entityType: "staff_user", entityId: u.id, after: { nombre: u.fullName, role: u.role } });
        return { ok: true as const, creada: true, id: u.id };
      });
    },
  };
}
