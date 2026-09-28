import "server-only";
import { connection } from "next/server";
import type { FamilyAccountDto } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Las cuentas de la sucursal, leídas en el servidor (B3-3): las que no están cobradas y las cobradas
 * hoy. Solo con alguien en sesión que trabaje con cuentas; si no, ninguna. Si el servidor no las
 * puede leer, tampoco: una cola inventada es peor que una vacía que lo dice (fail-closed).
 */
export async function cuentasDelLocal(): Promise<FamilyAccountDto[]> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return [];
  const r = await (await aplicacion()).cuentas.leer(ctx);
  if (!r.ok) {
    if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cuentas no disponibles");
    return [];
  }
  return r.valor.cuentas;
}
