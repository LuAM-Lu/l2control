/**
 * Saldar una deuda al cobrar su cuenta — B3-11, M-33.
 *
 * La caja cobra una deuda en una cuenta del mostrador (`customer_debt_collection`). Cuando ese cobro la deja cobrada
 * entera, la deuda queda COBRADA en la misma transacción, con quién y cuándo. Vive aparte del resto del módulo de
 * deudas para que el cobro (en `caja/cuentas.ts`) lo llame sin importar lo que a su vez importa la caja.
 */
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";

/** Si `accountId` cobra una deuda pendiente, la deja COBRADA. `operationKey`: la del cobro, una vez. */
export async function saldarDeudaDelCobro(tx: Transaccion, ctx: Contexto, accountId: string, operationKey: string, ahora: number, quien: string): Promise<void> {
  const cobro = await tx.customerDebtCollection.findFirst({ where: { accountId }, select: { debtId: true } });
  if (!cobro) return;
  const ya = await tx.customerDebtOutcome.findFirst({ where: { debtId: cobro.debtId }, select: { id: true } });
  if (ya) return;
  await tx.customerDebtOutcome.create({
    data: {
      tenantId: ctx.tenantId,
      debtId: cobro.debtId,
      kind: "COBRADA",
      at: new Date(ahora),
      byUser: ctx.quien?.userId ?? null,
      byName: quien,
      accountId,
      operationKey,
    },
  });
  await auditar(tx, ctx, { action: "deuda.cobrada", entityType: "customer_debt", entityId: cobro.debtId, after: { cuentaCobro: accountId } });
}
