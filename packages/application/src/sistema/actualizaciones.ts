/**
 * Las actualizaciones del sistema — T-8b, ADR-028, M-25.
 *
 * La web no pone versiones: **pide**. Administración, con su identidad confirmada, deja una actualización
 * PEDIDA («ahora», que solo se puede sin turnos abiertos ni niños en sala, o «al cierre»); el actualizador
 * del VPS la ve, comprueba lo mismo otra vez y la pone con el despliegue de T-8a (respaldo, migraciones,
 * salud y vuelta atrás sola), y escribe cómo terminó. En staging el actualizador se pone al día solo con
 * cada versión publicada (`AUTOMATICA`). Una a la vez; una pedida se puede cancelar mientras espera.
 *
 * Las versiones disponibles las escribe el actualizador (las publicadas con sus imágenes listas); la que
 * está en marcha la dice el servidor web (la suya, `L2_VERSION`), no el navegador.
 */
import {
  CancelarActualizacionCommandSchema,
  EstadoDelSistemaSchema,
  PedirActualizacionCommandSchema,
  problemasDe,
  type ActualizacionDto,
  type EstadoDelSistemaDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { epochMs, isOrphan, orphanAfterMs } from "@l2/domain-park";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import { errorDeBase, type Base, type SystemUpdate, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";

/** Lo que el servidor web sabe de sí mismo: su versión y si se pone al día solo (staging). */
export type Servidor = Readonly<{ enMarcha: string; automatico: boolean }>;

export interface CasosActualizaciones {
  /** La versión en marcha, las disponibles, la pendiente, las últimas y lo que impide actualizar ahora. */
  estado(ctx: Contexto, servidor: Servidor, ahora?: number): Promise<Resultado<EstadoDelSistemaDto>>;
  /** Pide una versión (`PedirActualizacionCommandSchema`). */
  pedir(ctx: Contexto, entrada: unknown, servidor: Servidor, ahora?: number): Promise<Resultado<EstadoDelSistemaDto>>;
  /** Cancela la pedida mientras espera (`CancelarActualizacionCommandSchema`). */
  cancelar(ctx: Contexto, entrada: unknown, servidor: Servidor, ahora?: number): Promise<Resultado<EstadoDelSistemaDto>>;
}

/** Cuántas del historial enseña el panel. */
const HISTORIAL = 10;

/** «0.58.0» frente a «0.57.12»: número a número. Positivo si `a` es más nueva. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});

function dto(f: SystemUpdate): ActualizacionDto {
  return {
    id: f.id,
    version: f.version,
    desde: f.fromVersion,
    modo: f.mode as ActualizacionDto["modo"],
    estado: f.state as ActualizacionDto["estado"],
    pedidaEn: f.requestedAt.toISOString(),
    pedidaPor: f.requestedByName,
    terminadaEn: f.finishedAt?.toISOString() ?? null,
    detalle: f.detail,
  };
}

/**
 * Lo que impide poner una versión ahora: los turnos de caja sin su Z y los niños en sala. Una estancia
 * huérfana (de otro día, o de más horas de las del ajuste) no cuenta: ya no hay nadie (D9, B4-4).
 */
async function ocupado(tx: Transaccion, branchId: string, ahora: number) {
  const turnosAbiertos = await tx.cashShift.count({ where: { branchId, status: { not: "CERRADO_Z" } } });
  const a = await ajustesDe(tx, branchId);
  const hoy = startOfDay(calendarDay(new Date(ahora).toISOString(), a.zonaHoraria), a.zonaHoraria);
  const activas = await tx.parkSession.findMany({ where: { branchId, status: "ACTIVA" }, select: { startedAt: true } });
  const ninosEnSala = activas.filter((s) => !isOrphan(epochMs(s.startedAt.getTime()), epochMs(ahora), epochMs(hoy), orphanAfterMs(a.horasHuerfana))).length;
  return { turnosAbiertos, ninosEnSala };
}

async function leer(tx: Transaccion, ctx: Contexto, servidor: Servidor, ahora: number): Promise<EstadoDelSistemaDto> {
  const versiones = await tx.systemRelease.findMany({ orderBy: { publishedAt: "desc" }, take: 30 });
  const disponibles = versiones
    .filter((v) => compararVersiones(v.version, servidor.enMarcha) > 0)
    .sort((x, y) => compararVersiones(y.version, x.version))
    .map((v) => ({ version: v.version, publicadaEn: v.publishedAt.toISOString(), novedades: v.notes, urgente: v.urgent }));
  const pendiente = await tx.systemUpdate.findFirst({ where: { state: { in: ["PEDIDA", "EN_CURSO"] } } });
  const historial = await tx.systemUpdate.findMany({ where: { state: { notIn: ["PEDIDA", "EN_CURSO"] } }, orderBy: { requestedAt: "desc" }, take: HISTORIAL });
  return EstadoDelSistemaSchema.parse({
    enMarcha: servidor.enMarcha,
    automatico: servidor.automatico,
    disponibles,
    pendiente: pendiente ? dto(pendiente) : null,
    historial: historial.map(dto),
    ocupado: await ocupado(tx, ctx.branchId, ahora),
  });
}

export function casosActualizaciones(base: Base): CasosActualizaciones {
  return {
    async estado(ctx, servidor, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoDelSistemaDto | Rechazo> => {
        // Ver qué hay es de quien decide, sin confirmar la identidad: confirmarla es para pedir.
        const p = await permisoEn(tx, ctx, "sistema.actualizar");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        return leer(tx, ctx, servidor, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async pedir(ctx, entrada, servidor, ahora = Date.now()) {
      const v = PedirActualizacionCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La actualización no se pidió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      if (servidor.automatico) return { ok: false, motivo: "CONFLICTO", mensaje: "Este servidor se pone al día solo con cada versión publicada: no hace falta pedirla." };
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoDelSistemaDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "sistema.actualizar");
          if (rechazo) return rechazo;
          const publicada = await tx.systemRelease.findUnique({ where: { tenantId_version: { tenantId: ctx.tenantId, version: cmd.version } } });
          if (!publicada) return invalido("Esa versión no está publicada en este servidor.", ["version"], "Versión desconocida");
          if (compararVersiones(cmd.version, servidor.enMarcha) <= 0) return invalido(`La ${servidor.enMarcha} ya está en marcha: solo se pide una más nueva.`, ["version"], "No es más nueva");
          if (await tx.systemUpdate.findFirst({ where: { state: { in: ["PEDIDA", "EN_CURSO"] } } })) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Ya hay una actualización pedida: espera a que termine o cancélala." };
          }
          if (cmd.cuando === "AHORA") {
            const o = await ocupado(tx, ctx.branchId, ahora);
            if (o.turnosAbiertos > 0 || o.ninosEnSala > 0) {
              return {
                ok: false,
                motivo: "CONFLICTO",
                mensaje: `Ahora no: ${[o.turnosAbiertos > 0 ? `${o.turnosAbiertos} ${o.turnosAbiertos === 1 ? "turno abierto" : "turnos abiertos"}` : null, o.ninosEnSala > 0 ? `${o.ninosEnSala} ${o.ninosEnSala === 1 ? "niño" : "niños"} en sala` : null].filter(Boolean).join(" y ")}. Elige «Al cierre» y se pondrá sola cuando no quede nada abierto.`,
              };
            }
          }
          const quien = await nombreDe(tx, ctx);
          const fila = await tx.systemUpdate.create({
            data: {
              tenantId: ctx.tenantId,
              version: cmd.version,
              fromVersion: servidor.enMarcha,
              mode: cmd.cuando,
              state: "PEDIDA",
              requestedAt: new Date(ahora),
              requestedBy: ctx.quien?.userId ?? null,
              requestedByName: quien.nombre,
            },
          });
          await auditar(tx, ctx, {
            action: "sistema.actualizar",
            entityType: "system_update",
            entityId: fila.id,
            after: { version: cmd.version, desde: servidor.enMarcha, cuando: cmd.cuando },
          });
          return leer(tx, ctx, servidor, ahora);
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "sistema.actualizar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos pedidas a la vez: la base deja una.
        if (errorDeBase(e)?.motivo === "DUPLICADO") return { ok: false, motivo: "CONFLICTO", mensaje: "Ya hay una actualización pedida: espera a que termine o cancélala." };
        throw e;
      }
    },

    async cancelar(ctx, entrada, servidor, ahora = Date.now()) {
      const v = CancelarActualizacionCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Falta qué actualización cancelar.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoDelSistemaDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "sistema.actualizar");
        if (rechazo) return rechazo;
        const fila = await tx.systemUpdate.findUnique({ where: { id: v.data.id } });
        if (!fila || fila.state !== "PEDIDA") {
          return { ok: false, motivo: "CONFLICTO", mensaje: fila?.state === "EN_CURSO" ? "Ya se está poniendo: no se puede cancelar a medias." : "Esa actualización ya no está esperando." };
        }
        const quien = await nombreDe(tx, ctx);
        // Con la condición en el `where`: si el actualizador la tomó en este instante, no se cancela.
        const hecho = await tx.systemUpdate.updateMany({
          where: { id: fila.id, state: "PEDIDA" },
          data: { state: "CANCELADA", finishedAt: new Date(ahora), cancelledByName: quien.nombre },
        });
        if (hecho.count !== 1) return { ok: false, motivo: "CONFLICTO", mensaje: "Ya se está poniendo: no se puede cancelar a medias." };
        await auditar(tx, ctx, { action: "sistema.cancelar", entityType: "system_update", entityId: fila.id, before: { version: fila.version, cuando: fila.mode } });
        return leer(tx, ctx, servidor, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
