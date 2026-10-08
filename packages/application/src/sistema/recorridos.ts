/**
 * Los recorridos guiados que vio cada persona — T-12 (M-27, P-4).
 *
 * La web enseña el recorrido de una pantalla la primera vez que una persona la abre, y a petición desde la ayuda.
 * Aquí se guarda que lo vio (o lo saltó), por persona y no por equipo: los equipos del local son compartidos. Volver
 * a verlo no añade otra fila (la base solo admite una por persona, recorrido y versión) y nada se borra.
 *
 * No pide ningún permiso más que tener sesión: es de la persona que opera, sobre sí misma.
 */
import {
  RecorridoVistoCommandSchema,
  RecorridosVistosSchema,
  problemasDe,
  type RecorridosVistosDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";

export interface CasosRecorridos {
  /** Los recorridos que vio la persona de la sesión. */
  vistos(ctx: Contexto): Promise<Resultado<RecorridosVistosDto>>;
  /** Anota que la persona de la sesión vio (o saltó) un recorrido (`RecorridoVistoCommandSchema`). */
  marcar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<RecorridosVistosDto>>;
}

const sinPersona: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra por el acceso para guardar lo que viste." };

export function casosRecorridos(base: Base): CasosRecorridos {
  const leer = (ctx: Contexto, userId: string) =>
    base.conTenant(ctx.tenantId, async (tx) =>
      RecorridosVistosSchema.parse({
        vistos: (await tx.userTourSeen.findMany({ where: { userId }, select: { tour: true, version: true }, orderBy: { seenAt: "asc" } })).map((f) => ({
          recorrido: f.tour,
          version: f.version,
        })),
      }),
    );

  return {
    async vistos(ctx) {
      const userId = ctx.quien?.userId;
      if (!userId) return sinPersona;
      return { ok: true, valor: await leer(ctx, userId) };
    },

    async marcar(ctx, entrada, ahora = Date.now()) {
      const v = RecorridoVistoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se guardó: el recorrido no es válido.", problemas: problemasDe(v.error) };
      const userId = ctx.quien?.userId;
      if (!userId) return sinPersona;
      try {
        await base.conTenant(ctx.tenantId, async (tx) => {
          await tx.userTourSeen.create({
            data: { tenantId: ctx.tenantId, userId, tour: v.data.recorrido, version: v.data.version, completed: v.data.completo, seenAt: new Date(ahora) },
          });
          await auditar(tx, ctx, {
            action: "ayuda.recorrido",
            entityType: "user_tour_seen",
            entityId: `${v.data.recorrido}@${v.data.version}`,
            after: { completo: v.data.completo },
          });
        });
      } catch (e) {
        // Ya lo había visto (otra pestaña, otro equipo): queda como estaba.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
      }
      return { ok: true, valor: await leer(ctx, userId) };
    },
  };
}
