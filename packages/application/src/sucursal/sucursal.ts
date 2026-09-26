/**
 * El local y su sucursal. Hoy solo hace falta asegurarlos al preparar un entorno (las
 * semillas); darlos de alta desde la aplicación llega con el back-office de sucursales.
 */
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";

export interface CasosSucursal {
  /**
   * Crea el tenant y la sucursal de `ctx` si no existen. Idempotente: correrlo dos veces no
   * duplica nada ni cambia lo que ya estaba (los nombres existentes no se tocan).
   */
  asegurar(ctx: Contexto, nombres: { tenant: string; sucursal: string }): Promise<{ creada: boolean }>;
}

export function casosSucursal(base: Base): CasosSucursal {
  return {
    asegurar(ctx, nombres) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        const existe = await tx.branch.findUnique({ where: { id: ctx.branchId } });
        if (existe) return { creada: false };
        await tx.tenant.upsert({
          where: { id: ctx.tenantId },
          create: { id: ctx.tenantId, name: nombres.tenant },
          update: {},
        });
        await tx.branch.create({ data: { id: ctx.branchId, tenantId: ctx.tenantId, name: nombres.sucursal } });
        return { creada: true };
      });
    },
  };
}
