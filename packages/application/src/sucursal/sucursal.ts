/**
 * El local y su sucursal. Nacen al preparar un entorno (las semillas) o con la instalación
 * inicial (T-4, `instalacion.ts`); más sucursales llegan con el back-office de sucursales.
 */
import { DEFAULT_LEDGER_METHODS } from "@l2/domain-cash";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";

export interface CasosSucursal {
  /**
   * Crea el tenant y la sucursal de `ctx` si no existen. Idempotente: correrlo dos veces no
   * duplica nada ni cambia lo que ya estaba (los nombres existentes no se tocan). Un local nuevo
   * nace con los siete medios de pago de §5.5 (B3-2); los que piden datos, apagados.
   */
  asegurar(ctx: Contexto, nombres: { tenant: string; sucursal: string }): Promise<{ creada: boolean }>;
}

/**
 * Crea el tenant, la sucursal y los siete medios de pago de §5.5 (B3-2; los que piden datos,
 * apagados) dentro del `tx` de quien lo llama. La usan las semillas y la instalación inicial.
 */
export async function crearLocal(tx: Transaccion, lugar: { tenantId: string; branchId: string }, nombres: { tenant: string; sucursal: string }): Promise<void> {
  await tx.tenant.upsert({
    where: { id: lugar.tenantId },
    create: { id: lugar.tenantId, name: nombres.tenant },
    update: {},
  });
  await tx.branch.create({ data: { id: lugar.branchId, tenantId: lugar.tenantId, name: nombres.sucursal } });
  await tx.paymentMethod.createMany({
    data: DEFAULT_LEDGER_METHODS.map((m, position) => ({
      tenantId: lugar.tenantId,
      code: m.code,
      label: m.label,
      currency: m.currency,
      givesChange: m.givesChange,
      triggersIgtf: m.triggersIgtf,
      dataKind: m.dataKind,
      active: m.active,
      position,
      createdByName: "Alta del local",
    })),
    skipDuplicates: true,
  });
}

export function casosSucursal(base: Base): CasosSucursal {
  return {
    asegurar(ctx, nombres) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        const existe = await tx.branch.findUnique({ where: { id: ctx.branchId } });
        if (existe) return { creada: false };
        await crearLocal(tx, ctx, nombres);
        return { creada: true };
      });
    },
  };
}
