/**
 * El tiempo real — B5-1, ADR-008 y ADR-025.
 *
 * Tres piezas, las tres para `apps/worker` salvo el ticket, que lo firma el servidor web:
 *
 *  · **ticket** y **abrir**: la autorización del canal ocurre en el apretón de manos (ADR-008).
 *    El ticket dice de qué sesión es; abrirlo comprueba la firma, el plazo y que la sesión siga viva.
 *  · **latido**: mientras el canal está abierto, el worker confirma cada minuto que sus sesiones
 *    siguen vivas (y echa a las que no). Hace de la petición que antes hacía el sondeo: la sesión
 *    caduca a los 30 minutos sin nada abierto, no a los 30 minutos sin tocar la pantalla (eso lo
 *    decide el bloqueo de la estación, a los 3).
 *  · **despachar**: publica lo pendiente del outbox. Lo lee con su tenant, lo agrupa por sucursal,
 *    lo traduce a temas y lo marca publicado en la misma transacción: si publicar falla, no se marca
 *    y sale en la siguiente vuelta. Puede salir dos veces, nunca ninguna (y un tema repetido solo
 *    cuesta una lectura de más).
 */
import type { Tema } from "@l2/contracts";
import type { Base } from "@l2/database";
import { esRol } from "../identidad/actor.ts";
import { SESION_INACTIVA_MS } from "../identidad/plazos.ts";
import { temasDe } from "./temas.ts";
import type { DatosDelTicket, Firmante } from "./ticket.ts";

/** El latido refresca `last_seen_at` como mucho una vez por minuto, igual que `consultar`. */
const REFRESCO_MS = 60_000;
/** Cuántos eventos del outbox se publican por vuelta. */
const LOTE = 200;
/** El canal de `pg_notify` que usa el disparador de la auditoría. */
const CANAL_OUTBOX = "l2_outbox";

/** Lo que el worker cuenta en vivo: a qué sucursal (o a todo el tenant, si es nula) y qué cambió. */
export interface Aviso {
  readonly branchId: string | null;
  readonly temas: readonly Tema[];
}

export interface CasosTiempoReal {
  /** El ticket de una sesión que el servidor web ya comprobó. `null` sin clave de cifrado. */
  ticket(sesion: DatosDelTicket, ahora: number): string | null;
  /** Abre un ticket: firma, plazo, tenant de este servidor y sesión viva en la base. */
  abrir(ticket: unknown, tenantId: string, ahora: number): Promise<DatosDelTicket | null>;
  /** De estas sesiones, las que siguen vivas; a esas les apunta que siguen ahí. */
  latido(tenantId: string, sesiones: readonly string[], ahora: number): Promise<ReadonlySet<string>>;
  /** Publica lo pendiente del outbox del tenant. Devuelve cuántos eventos salieron. */
  despachar(tenantId: string, publicar: (avisos: readonly Aviso[]) => void | Promise<void>, lote?: number): Promise<number>;
  /** Avisa al confirmarse una transacción con eventos (`LISTEN`). La carga es el tenant. */
  escuchar(alAviso: (tenantId: string) => void, alCaer?: (error: Error) => void): Promise<() => Promise<void>>;
}

export function casosTiempoReal(base: Base, firmante: Firmante | null): CasosTiempoReal {
  /** Las sesiones vivas de entre `ids`, con las mismas reglas que `sesiones.consultar`. */
  const vivas = (tenantId: string, ids: readonly string[], ahora: number, apuntar: boolean) =>
    base.conTenant(tenantId, async (tx) => {
      if (ids.length === 0) return new Set<string>();
      const filas = await tx.staffSession.findMany({
        where: { id: { in: [...ids] }, closedAt: null },
        include: { user: true, device: true },
      });
      const buenas = filas.filter(
        (s) =>
          s.device.status === "APROBADO" &&
          s.user.active &&
          esRol(s.user.role) &&
          ahora - s.lastSeenAt.getTime() <= SESION_INACTIVA_MS,
      );
      if (apuntar && buenas.length > 0) {
        await tx.staffSession.updateMany({
          where: { id: { in: buenas.map((s) => s.id) }, closedAt: null, lastSeenAt: { lt: new Date(ahora - REFRESCO_MS) } },
          data: { lastSeenAt: new Date(ahora) },
        });
      }
      return new Set(buenas.map((s) => s.id));
    });

  return {
    ticket(sesion, ahora) {
      return firmante ? firmante.firmar(sesion, ahora) : null;
    },

    async abrir(ticket, tenantId, ahora) {
      if (!firmante || typeof ticket !== "string") return null;
      const datos = firmante.abrir(ticket, ahora);
      if (!datos || datos.tenantId !== tenantId) return null;
      const s = await base.conTenant(tenantId, (tx) =>
        tx.staffSession.findUnique({ where: { id: datos.sessionId }, select: { branchId: true, userId: true, deviceId: true } }),
      );
      // La sesión tiene que ser la que dice el ticket, en la sucursal que dice.
      if (!s || s.branchId !== datos.branchId || s.userId !== datos.userId || s.deviceId !== datos.deviceId) return null;
      return (await vivas(tenantId, [datos.sessionId], ahora, false)).has(datos.sessionId) ? datos : null;
    },

    latido: (tenantId, sesiones, ahora) => vivas(tenantId, sesiones, ahora, true),

    despachar(tenantId, publicar, lote = LOTE) {
      return base.conTenant(tenantId, async (tx) => {
        // SKIP LOCKED: si otra vuelta (u otro worker) ya los tiene, no se espera ni se repiten.
        const filas = await tx.$queryRaw<{ id: bigint; branch_id: string | null; action: string }[]>`
          SELECT id, branch_id::text AS branch_id, action FROM outbox_event
          WHERE published_at IS NULL ORDER BY id LIMIT ${lote} FOR UPDATE SKIP LOCKED`;
        if (filas.length === 0) return 0;

        const porSucursal = new Map<string | null, Set<Tema>>();
        for (const f of filas) {
          const temas = temasDe(f.action);
          if (temas.length === 0) continue;
          const conjunto = porSucursal.get(f.branch_id) ?? new Set<Tema>();
          for (const t of temas) conjunto.add(t);
          porSucursal.set(f.branch_id, conjunto);
        }
        const avisos = [...porSucursal].map(([branchId, temas]) => ({ branchId, temas: [...temas].sort() }));
        if (avisos.length > 0) await publicar(avisos);

        // El instante lo pone la base: su reloj es el mismo que puso `created_at`.
        await tx.$executeRaw`
          UPDATE outbox_event SET published_at = now() WHERE id = ANY(${filas.map((f) => f.id.toString())}::bigint[])`;
        return filas.length;
      });
    },

    escuchar: (alAviso, alCaer) => base.escuchar(CANAL_OUTBOX, alAviso, alCaer),
  };
}
