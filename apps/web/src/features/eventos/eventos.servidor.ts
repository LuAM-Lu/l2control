import "server-only";
import { connection } from "next/server";
import type { AgendaEventosDto, CatalogoEventosPublicadoDto, Resultado } from "@l2/contracts";
import { aplicacion, contextoDelLocal, log } from "../../servidor/aplicacion";
import { contextoActual } from "../../servidor/sesion";

/**
 * Los cumpleaños leídos en el servidor (B10-1). `connection()` obliga a leer en cada petición: una
 * agenda congelada en la compilación diría que no hay nada reservado.
 */

/** Los paquetes de cumpleaños vigentes y el anticipo. No es dato sensible: lo lee quien reserva y Ajustes. */
export async function catalogoDeEventos(): Promise<CatalogoEventosPublicadoDto> {
  await connection();
  return (await aplicacion()).eventos.leerCatalogo(contextoDelLocal());
}

/** Cuántos días de agenda se enseñan desde hoy: el contrato admite tres meses de una vez. */
export const DIAS_DE_AGENDA = 90;

/**
 * La agenda desde hoy (en el calendario del local) hasta dentro de `DIAS_DE_AGENDA` días. Con la
 * persona de la sesión; el rechazo se devuelve tal cual para que la pantalla lo diga.
 */
export async function agendaDeEventos(): Promise<Resultado<AgendaEventosDto>> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Nadie ha entrado en este equipo: entra por el acceso para ver la agenda." };
  const app = await aplicacion();
  // Primero el día de hoy del local (lo dice el servidor), y con él el rango.
  const hoy = await app.eventos.deHoy(ctx);
  if (!hoy.ok) return hoy;
  const hasta = new Date(Date.parse(`${hoy.valor.hoy}T00:00:00.000Z`) + DIAS_DE_AGENDA * 86_400_000).toISOString().slice(0, 10);
  return app.eventos.agenda(ctx, { desde: hoy.valor.hoy, hasta });
}

/**
 * Los cumpleaños de hoy que siguen en pie, para el aviso de Inicio y de la apertura del turno. `null`
 * sin sesión o si quien está no ve la agenda: el aviso no sale, que no es lo mismo que «no hay».
 */
export async function eventosDeHoy(): Promise<AgendaEventosDto | null> {
  await connection();
  const ctx = await contextoActual();
  if (!ctx) return null;
  // Es un aviso: si no se puede leer, se anota y no se pinta, pero no tumba Inicio ni la apertura del turno.
  try {
    const r = await (await aplicacion()).eventos.deHoy(ctx);
    if (!r.ok) {
      if (r.motivo !== "NO_PERMITIDO") log().warn({ tenantId: ctx.tenantId, motivo: r.motivo }, "cumpleaños de hoy no disponibles");
      return null;
    }
    return r.valor;
  } catch (e) {
    log().error({ tenantId: ctx.tenantId, err: e }, "no se pudieron leer los cumpleaños de hoy");
    return null;
  }
}
