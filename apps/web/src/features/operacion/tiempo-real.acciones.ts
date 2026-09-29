"use server";

import type { Resultado, TicketTiempoRealDto } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { entorno } from "../../servidor/entorno";
import { sesionActual } from "../../servidor/sesion";

/**
 * El ticket del canal en vivo (B5-1, ADR-025): solo para quien tiene sesión, firmado aquí con la
 * sesión que leyó el servidor de su cookie. El navegador no dice quién es ni de qué sucursal; el
 * ticket caduca en un minuto y el worker lo vuelve a comprobar contra la base.
 */
export async function pedirTicketTiempoReal(): Promise<Resultado<TicketTiempoRealDto>> {
  const s = await sesionActual();
  if (!s) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Sin sesión no hay canal en vivo." };
  const ticket = (await aplicacion()).tiempoReal.ticket(
    { tenantId: s.tenantId, branchId: s.branchId, sessionId: s.id, userId: s.userId, deviceId: s.deviceId },
    Date.now(),
  );
  if (!ticket) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El servidor no tiene con qué firmar el canal en vivo." };
  const e = entorno();
  return { ok: true, valor: { ticket, url: e.L2_TIEMPO_REAL_URL, puerto: e.L2_TIEMPO_REAL_PUERTO } };
}
