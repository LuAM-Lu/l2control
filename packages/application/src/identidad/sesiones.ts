/**
 * La sesión en el servidor — F2-03, F2-12, ADR-013 y ADR-018.
 *
 * Entrar exige, en este orden: un equipo APROBADO (primer factor), una persona activa de la
 * sucursal de ese equipo, que no esté bloqueada, y su PIN (Argon2id). Cada fallo cuenta para el
 * bloqueo creciente del dominio y queda en la auditoría (§7.4: éxito y fallo). Un equipo tiene a
 * lo sumo una sesión abierta (DEC-17: el aparato es del puesto): entrar cierra la anterior.
 *
 * La sesión se comprueba en cada petición: caduca por inactividad y muere si el equipo se revoca
 * o la persona se da de baja. Cerrarla es de verdad, en la base.
 */
import { hash, verify } from "@node-rs/argon2";
import {
  DEFAULT_LOCKOUT_POLICY,
  checkNewPin,
  computeLockout,
  describeLockout,
  type Actor,
  type LockoutState,
  type Role,
} from "@l2/domain-identity";
import { SesionEnCursoSchema, type Rechazo, type Resultado, type SesionEnCursoDto } from "@l2/contracts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { cargarActor, esRol, permisoEn, rechazoDePermiso } from "./actor.ts";
import { coincide, componer, huella, leerCredencial, nuevoSecreto } from "./credenciales.ts";
import type { CasosDispositivos } from "./dispositivos.ts";

import { SESION_INACTIVA_MS } from "./plazos.ts";
export { SESION_INACTIVA_MS };
/** No se reescribe `last_seen_at` en cada petición: basta con una vez por minuto. */
const REFRESCO_MS = 60_000;

export interface SesionActiva {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly userId: string;
  readonly nombre: string;
  readonly role: Role;
  readonly actor: Actor;
  readonly abiertaEn: string;
  /** Hasta cuándo vale la elevación con contraseña y llave de acceso (B1-2, ADR-020). */
  readonly elevadaHasta: string | null;
}

export interface PersonaParaAcceso {
  readonly id: string;
  readonly nombre: string;
  readonly role: Role;
}

export type Bloqueo = Readonly<{ bloqueado: boolean; hasta: string | null; intentosRestantes: number; texto: string | null }>;

export type ResultadoEntrada =
  | Readonly<{ ok: true; credencial: string; sesion: SesionActiva }>
  | (Rechazo & Readonly<{ bloqueo?: Bloqueo; debeElegirPin?: true }>);

export interface CasosSesiones {
  /** Quién puede entrar en este equipo: las personas activas, con PIN, de su sucursal. */
  personas(dispositivo: string | undefined | null): Promise<PersonaParaAcceso[]>;
  /**
   * Entrar con PIN. Si el PIN es TEMPORAL (alta o reposición), no se abre sesión hasta que la
   * persona elija el suyo: sin `pinNuevo` responde `debeElegirPin`; con él, lo guarda y entra.
   */
  entrar(p: {
    dispositivo: string | undefined | null;
    userId: string;
    pin: string;
    pinNuevo?: string | undefined;
    ip: string | null;
    ahora: number;
  }): Promise<ResultadoEntrada>;
  /** La sesión de esta credencial, si sigue viva. La refresca; si caducó, la cierra. */
  consultar(credencial: string | undefined | null, ahora: number): Promise<SesionActiva | null>;
  salir(credencial: string | undefined | null, motivo: "SALIDA" | "CORTE_Z", ip: string | null): Promise<void>;
  /**
   * Quién está en sesión ahora en la sucursal, y en qué equipo (F9-08, D7, B5-1): lo que Inicio
   * enseña por puesto. Lo ve quien ve el resumen de la sucursal.
   */
  enCurso(ctx: Contexto, ahora: number): Promise<Resultado<SesionEnCursoDto[]>>;
}

/** El contexto de una operación hecha por quien tiene esta sesión. */
export function contextoDeSesion(s: SesionActiva, ip: string | null): Contexto {
  return {
    tenantId: s.tenantId,
    branchId: s.branchId,
    quien: { userId: s.userId, deviceId: s.deviceId },
    ip,
    elevadaHasta: s.elevadaHasta,
  };
}

const PIN = /^\d{4,8}$/;
const bloqueoDe = (l: LockoutState): Bloqueo => ({
  bloqueado: l.locked,
  hasta: l.lockedUntil === null ? null : new Date(l.lockedUntil).toISOString(),
  intentosRestantes: l.attemptsRemaining,
  texto: describeLockout(l),
});

/** Hash con el que comparar cuando no hay a quién: el tiempo de respuesta no delata si existe. */
let hashDeRelleno: Promise<string> | null = null;
const relleno = () => (hashDeRelleno ??= hash("l2-sin-persona"));

export function casosSesiones(base: Base, dispositivos: CasosDispositivos): CasosSesiones {
  return {
    async personas(texto) {
      const d = await dispositivos.identificar(texto);
      if (d.estado !== "APROBADO") return [];
      const filas = await base.conTenant(d.tenantId, (tx) =>
        tx.staffUser.findMany({
          where: { active: true, pinHash: { not: null }, branches: { some: { branchId: d.branchId } } },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true, role: true },
        }),
      );
      return filas.flatMap((u) => (esRol(u.role) ? [{ id: u.id, nombre: u.fullName, role: u.role }] : []));
    },

    async entrar({ dispositivo, userId, pin, pinNuevo, ip, ahora }) {
      const d = await dispositivos.identificar(dispositivo);
      if (d.estado !== "APROBADO") {
        return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Este equipo no está autorizado para entrar." };
      }
      const ctxEquipo: Contexto = { tenantId: d.tenantId, branchId: d.branchId, ip };
      const noEntra: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "PIN incorrecto." };

      if (!PIN.test(pin)) return { ok: false, motivo: "INVALIDO", mensaje: "El PIN son cuatro números." };

      // La persona tiene que existir, estar activa, ser de la sucursal del equipo y tener PIN.
      const u = await base.conTenant(d.tenantId, (tx) =>
        tx.staffUser.findUnique({ where: { id: userId }, include: { branches: true } }).catch(() => null),
      );
      const valida = u && u.active && u.pinHash && esRol(u.role) && u.branches.some((b) => b.branchId === d.branchId);
      if (!valida) {
        await verify(await relleno(), pin).catch(() => false);
        await base.conTenant(d.tenantId, (tx) =>
          auditar(tx, { ...ctxEquipo, quien: { userId: null, deviceId: d.id } }, {
            action: "sesion.pin_fallido",
            outcome: "NEGADO",
            entityType: "staff_user",
            entityId: userId.slice(0, 64),
            reason: "Persona inexistente, de baja, sin PIN o de otra sucursal",
          }),
        );
        return noEntra;
      }
      const ctxPersona: Contexto = { ...ctxEquipo, quien: { userId: u.id, deviceId: d.id } };

      // Bloqueo creciente (§7.2 A07): mientras dure, ni se comprueba el PIN.
      const bloqueo = computeLockout(u.pinFailures, u.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
      if (bloqueo.locked) {
        await base.conTenant(d.tenantId, (tx) =>
          auditar(tx, ctxPersona, { action: "sesion.bloqueada", outcome: "NEGADO", reason: describeLockout(bloqueo) ?? "Bloqueada" }),
        );
        return { ok: false, motivo: "NO_PERMITIDO", mensaje: describeLockout(bloqueo) ?? "Bloqueado.", bloqueo: bloqueoDe(bloqueo) };
      }

      if (!(await verify(u.pinHash!, pin).catch(() => false))) {
        const tras = await base.conTenant(d.tenantId, async (tx) => {
          const f = await tx.staffUser.update({
            where: { id: u.id },
            data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) },
            select: { pinFailures: true },
          });
          await auditar(tx, ctxPersona, { action: "sesion.pin_fallido", outcome: "NEGADO", after: { fallosSeguidos: f.pinFailures } });
          return computeLockout(f.pinFailures, ahora, ahora, DEFAULT_LOCKOUT_POLICY);
        });
        return { ...noEntra, mensaje: describeLockout(tras) ?? "PIN incorrecto.", bloqueo: bloqueoDe(tras) };
      }

      // PIN temporal: primero elige el suyo. El PIN correcto ya se comprobó, así que decirle
      // que tiene que cambiarlo no le da nada a nadie que no lo supiera.
      let pinPropio: string | null = null;
      if (u.pinMustChange) {
        if (pinNuevo === undefined) {
          return { ok: false, motivo: "INVALIDO", mensaje: "Es tu primer acceso con este PIN: elige el tuyo.", debeElegirPin: true };
        }
        const revision = checkNewPin(pinNuevo);
        if (!revision.ok) return { ok: false, motivo: "INVALIDO", mensaje: revision.message, debeElegirPin: true };
        if (pinNuevo === pin) {
          return { ok: false, motivo: "INVALIDO", mensaje: "Elige un PIN distinto del temporal.", debeElegirPin: true };
        }
        pinPropio = await hash(pinNuevo);
      }

      // Entra. Un equipo, una sesión: la que hubiera abierta en él se cierra.
      const secreto = nuevoSecreto();
      const sesion = await base.conTenant(d.tenantId, async (tx) => {
        await tx.staffSession.updateMany({
          where: { deviceId: d.id, closedAt: null },
          data: { closedAt: new Date(ahora), closedReason: "OTRA_SESION" },
        });
        await tx.staffUser.update({
          where: { id: u.id },
          data: { pinFailures: 0, pinLastFailureAt: null, ...(pinPropio ? { pinHash: pinPropio, pinMustChange: false } : {}) },
        });
        if (pinPropio) {
          await tx.staffUserChange.create({
            data: { tenantId: d.tenantId, userId: u.id, kind: "PIN", reason: "Eligió su PIN al entrar con el temporal", byUserId: u.id, byName: u.fullName },
          });
          await auditar(tx, ctxPersona, { action: "usuario.pin", entityType: "staff_user", entityId: u.id, reason: "Eligió su PIN al entrar con el temporal" });
        }
        await tx.device.update({ where: { id: d.id }, data: { lastSeenAt: new Date(ahora) } });
        const s = await tx.staffSession.create({
          data: {
            tenantId: d.tenantId,
            branchId: d.branchId,
            userId: u.id,
            deviceId: d.id,
            tokenHash: huella(secreto),
            openedAt: new Date(ahora),
            lastSeenAt: new Date(ahora),
          },
        });
        await auditar(tx, ctxPersona, { action: "sesion.abrir", entityType: "staff_session", entityId: s.id });
        const actor = await cargarActor(tx, u.id, d.branchId);
        return { s, actor };
      });
      if (!sesion.actor) return noEntra;

      return {
        ok: true,
        credencial: componer({ tenantId: d.tenantId, id: sesion.s.id, secreto }),
        sesion: {
          id: sesion.s.id,
          tenantId: d.tenantId,
          branchId: d.branchId,
          deviceId: d.id,
          deviceLabel: d.label,
          userId: u.id,
          nombre: u.fullName,
          role: u.role as Role,
          actor: sesion.actor,
          abiertaEn: sesion.s.openedAt.toISOString(),
          elevadaHasta: null,
        },
      };
    },

    async consultar(texto, ahora) {
      const cred = leerCredencial(texto);
      if (!cred) return null;
      return base.conTenant(cred.tenantId, async (tx) => {
        const s = await tx.staffSession.findUnique({
          where: { id: cred.id },
          include: { user: true, device: true },
        });
        if (!s || s.closedAt || !coincide(cred.secreto, s.tokenHash)) return null;

        const cerrar = async (motivo: "INACTIVIDAD" | "BAJA" | "DISPOSITIVO_REVOCADO") => {
          await tx.staffSession.update({ where: { id: s.id }, data: { closedAt: new Date(ahora), closedReason: motivo } });
          return null;
        };
        if (s.device.status !== "APROBADO") return cerrar("DISPOSITIVO_REVOCADO");
        if (!s.user.active || !esRol(s.user.role)) return cerrar("BAJA");
        if (ahora - s.lastSeenAt.getTime() > SESION_INACTIVA_MS) return cerrar("INACTIVIDAD");

        const actor = await cargarActor(tx, s.userId, s.branchId);
        if (!actor) return cerrar("BAJA");
        if (ahora - s.lastSeenAt.getTime() > REFRESCO_MS) {
          await tx.staffSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date(ahora) } });
        }
        return {
          id: s.id,
          tenantId: s.tenantId,
          branchId: s.branchId,
          deviceId: s.deviceId,
          deviceLabel: s.device.label,
          userId: s.userId,
          nombre: s.user.fullName,
          role: s.user.role,
          actor,
          abiertaEn: s.openedAt.toISOString(),
          elevadaHasta: s.elevatedUntil && s.elevatedUntil.getTime() > ahora ? s.elevatedUntil.toISOString() : null,
        } satisfies SesionActiva;
      });
    },

    async enCurso(ctx, ahora) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<SesionEnCursoDto[] | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const filas = await tx.staffSession.findMany({
          where: {
            branchId: ctx.branchId,
            closedAt: null,
            lastSeenAt: { gte: new Date(ahora - SESION_INACTIVA_MS) },
            device: { status: "APROBADO" },
            user: { active: true },
          },
          include: { user: true, device: true },
          orderBy: { openedAt: "asc" },
        });
        return filas.flatMap((s) =>
          esRol(s.user.role)
            ? [SesionEnCursoSchema.parse({ userName: s.user.fullName, role: s.user.role, deviceLabel: s.device.label, desde: s.openedAt.toISOString() })]
            : [],
        );
      });
      return Array.isArray(r) ? { ok: true, valor: r } : r;
    },

    async salir(texto, motivo, ip) {
      const cred = leerCredencial(texto);
      if (!cred) return;
      await base.conTenant(cred.tenantId, async (tx) => {
        const s = await tx.staffSession.findUnique({ where: { id: cred.id } });
        if (!s || s.closedAt || !coincide(cred.secreto, s.tokenHash)) return;
        await tx.staffSession.update({ where: { id: s.id }, data: { closedAt: new Date(), closedReason: motivo } });
        await auditar(tx, { tenantId: s.tenantId, branchId: s.branchId, quien: { userId: s.userId, deviceId: s.deviceId }, ip }, {
          action: "sesion.cerrar",
          entityType: "staff_session",
          entityId: s.id,
          reason: motivo,
        });
      });
    },
  };
}
