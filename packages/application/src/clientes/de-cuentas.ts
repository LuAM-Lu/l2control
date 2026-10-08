/**
 * El cliente vigente de cada cuenta (B6-9, M-33): lo lee la caja al armar una cuenta, sin depender del resto del módulo
 * de clientes (que a su vez guarda versiones de la cuenta).
 */
import type { ClienteDeCuentaDto } from "@l2/contracts";
import type { Transaccion } from "@l2/database";

/** El cliente vigente de cada cuenta que lo tiene: la última fila de cada una. */
export async function clientesDeCuentas(tx: Transaccion, accountIds: readonly string[]): Promise<Map<string, ClienteDeCuentaDto>> {
  const r = new Map<string, ClienteDeCuentaDto>();
  if (accountIds.length === 0) return r;
  const filas = await tx.accountCustomer.findMany({
    where: { accountId: { in: [...accountIds] } },
    orderBy: [{ setAt: "desc" }, { id: "desc" }],
  });
  for (const f of filas) {
    if (r.has(f.accountId)) continue;
    r.set(f.accountId, { nombre: f.fullName, cedula: f.document, telefono: f.phone, ...(f.guardianId ? { clienteId: f.guardianId } : {}) });
  }
  return r;
}
