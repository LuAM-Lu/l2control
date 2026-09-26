/**
 * Leer el registro de auditoría. Solo lectura: el registro no se corrige, se añade.
 */
import type { AuditEntry, Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";

export interface FiltroAuditoria {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  /** Cuántos, de lo más reciente a lo más antiguo. Por defecto 50, como mucho 500. */
  limite?: number;
}

export interface CasosAuditoria {
  listar(ctx: Contexto, filtro?: FiltroAuditoria): Promise<AuditEntry[]>;
}

export function casosAuditoria(base: Base): CasosAuditoria {
  return {
    listar(ctx, filtro = {}) {
      const limite = Math.min(Math.max(filtro.limite ?? 50, 1), 500);
      return base.conTenant(ctx.tenantId, (tx) =>
        tx.auditEntry.findMany({
          where: {
            ...(filtro.entityType ? { entityType: filtro.entityType } : {}),
            ...(filtro.entityId ? { entityId: filtro.entityId } : {}),
            ...(filtro.actorId ? { actorId: filtro.actorId } : {}),
          },
          orderBy: { occurredAt: "desc" },
          take: limite,
        }),
      );
    },
  };
}
