/**
 * Las personas del equipo — F2-10, F2-11, DEC-15, §9.10.6.
 *
 * Dar de alta, de baja, reingresar, cambiar el rol, reponer el PIN y conceder o revocar
 * excepciones. SI SE PUEDE lo decide el dominio (`revisarCambio`, las cinco puertas) sobre el
 * equipo real de la base; aquí se guarda, con su historial y su asiento, en una transacción.
 * Nada se borra: una baja pone `active = false` y cierra sus sesiones en el acto (F2-10: «dar de
 * baja revoca todo su acceso en menos de 5 segundos»).
 *
 * Un alta o una reposición dan un PIN TEMPORAL, que se enseña una sola vez a quien hizo el
 * cambio; la persona elige el suyo al entrar con él, antes de tener sesión.
 */
import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";
import {
  ACCIONES_INTOCABLES,
  checkNewPin,
  revisarCambio,
  type Action,
  type Role,
} from "@l2/domain-identity";
import {
  PermissionExceptionCommandSchema,
  UserCommandSchema,
  UserSummarySchema,
  problemasDe,
  type Rechazo,
  type Resultado,
  type UserSummaryDto,
  type UsersDirectoryDto,
} from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { cargarActor, esAccion, esRol, exigirPermiso, nombreDe } from "./actor.ts";

export interface PersonaASembrar {
  readonly nombre: string;
  readonly role: Role;
  readonly pin: string;
  readonly activa?: boolean;
}

export interface CambioHecho {
  readonly usuario: UserSummaryDto;
  readonly mensaje: string;
  /** Solo en alta y reposición: se enseña UNA vez y no se guarda en claro en ningún sitio. */
  readonly pinTemporal?: string;
}

export interface CasosEquipo {
  /**
   * Crea la persona si no hay ninguna con ese nombre en el tenant; si ya existe, no la toca.
   * Solo desde el sistema (semillas y consola): una persona no se da de alta a sí misma.
   */
  asegurar(ctx: Contexto, p: PersonaASembrar): Promise<{ ok: true; creada: boolean; id: string } | Rechazo>;
  /** El directorio de la sucursal, con excepciones vigentes e historia (`usuarios.gestionar`). */
  directorio(ctx: Contexto): Promise<Resultado<UsersDirectoryDto>>;
  /** Alta, baja, reingreso, cambio de rol o PIN repuesto (`UserCommand`). */
  cambiar(ctx: Contexto, comando: unknown): Promise<Resultado<CambioHecho>>;
  /** Conceder o revocar una excepción sobre el rol de una persona (`PermissionExceptionCommand`). */
  excepcion(ctx: Contexto, comando: unknown): Promise<Resultado<UserSummaryDto>>;
}

/** Un PIN de 4 cifras que pasa la política del dominio (no trivial). */
function pinTemporal(): string {
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (checkNewPin(pin).ok) return pin;
  }
}

async function resumen(tx: Transaccion, userId: string): Promise<UserSummaryDto> {
  // Tres relaciones en un `include` hacen que Prisma lance sus consultas a la vez sobre la única
  // conexión de la transacción (aviso de pg; error en pg@9): los cambios van en su propia consulta.
  const persona = await tx.staffUser.findUniqueOrThrow({
    where: { id: userId },
    include: { branches: true, exceptions: { where: { retiredAt: null }, orderBy: { at: "desc" } } },
  });
  const u = { ...persona, changes: await tx.staffUserChange.findMany({ where: { userId }, orderBy: { at: "desc" } }) };
  return UserSummarySchema.parse({
    id: u.id,
    fullName: u.fullName,
    role: u.role,
    branchIds: u.branches.map((b) => b.branchId),
    active: u.active,
    soporte: u.supportLogin,
    exceptions: u.exceptions.map((e) => ({
      effect: e.effect,
      action: e.action,
      ...(e.effect === "GRANT" ? { permission: e.permission } : {}),
      grantedBy: e.grantedBy ?? "sistema",
      grantedByName: e.grantedByName,
      reason: e.reason,
      at: e.at.toISOString(),
    })),
    changes: u.changes.map((c) => ({
      kind: c.kind,
      ...(c.kind === "ALTA" ? { role: c.toRole } : {}),
      ...(c.kind === "ROL" ? { from: c.fromRole, to: c.toRole } : {}),
      by: c.byUserId ?? "sistema",
      byName: c.byName,
      reason: c.reason,
      at: c.at.toISOString(),
    })),
  });
}

const sinPersona: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Esto lo hace una persona con sesión." };

export function casosEquipo(base: Base): CasosEquipo {
  return {
    async asegurar(ctx, p) {
      if (!ctx.sistema) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Solo la consola del servidor siembra personas." };
      const pin = checkNewPin(p.pin);
      if (!pin.ok) return { ok: false, motivo: "INVALIDO", mensaje: pin.message };
      const pinHash = await hash(p.pin);

      return base.conTenant(ctx.tenantId, async (tx) => {
        const existente = await tx.staffUser.findFirst({ where: { fullName: p.nombre } });
        if (existente) return { ok: true as const, creada: false, id: existente.id };

        const u = await tx.staffUser.create({
          data: { tenantId: ctx.tenantId, fullName: p.nombre, role: p.role, active: p.activa ?? true, pinHash },
        });
        await tx.staffUserBranch.create({ data: { tenantId: ctx.tenantId, userId: u.id, branchId: ctx.branchId } });
        await tx.staffUserChange.create({
          data: { tenantId: ctx.tenantId, userId: u.id, kind: "ALTA", toRole: p.role, reason: "Alta desde la consola del servidor", byName: "Consola del servidor" },
        });
        await auditar(tx, ctx, { action: "usuario.alta", entityType: "staff_user", entityId: u.id, after: { nombre: u.fullName, role: u.role } });
        return { ok: true as const, creada: true, id: u.id };
      });
    },

    directorio(ctx) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<UsersDirectoryDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        const ids = await tx.staffUser.findMany({
          where: { branches: { some: { branchId: ctx.branchId } } },
          orderBy: [{ active: "desc" }, { fullName: "asc" }],
          select: { id: true },
        });
        const users = [];
        for (const u of ids) users.push(await resumen(tx, u.id));
        return { ok: true, valor: { users } };
      });
    },

    async cambiar(ctx, entrada) {
      const cmd = UserCommandSchema.safeParse(entrada);
      if (!cmd.success) return { ok: false, motivo: "INVALIDO", mensaje: "El cambio no es válido.", problemas: problemasDe(cmd.error) };
      const c = cmd.data;
      if (!ctx.quien?.userId) return sinPersona;
      const accion = (
        { ALTA: "usuario.alta", BAJA: "usuario.baja", REINGRESO: "usuario.reingreso", ROL: "usuario.rol", PIN: "usuario.pin", SOPORTE: "usuario.soporte", SOPORTE_FIN: "usuario.soporte" } as const
      )[c.kind];
      const temporal = c.kind === "ALTA" || c.kind === "PIN" ? pinTemporal() : null;
      const temporalHash = temporal ? await hash(temporal) : null;

      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<CambioHecho>> => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        const autor = await cargarActor(tx, ctx.quien!.userId!, ctx.branchId);
        if (!autor) return sinPersona;

        // Las cinco puertas del dominio, sobre el equipo REAL de la base.
        const equipo = (await tx.staffUser.findMany({ select: { id: true, role: true, active: true, supportLogin: true } }))
          .flatMap((u) => (esRol(u.role) ? [{ id: u.id, role: u.role, active: u.active, soporte: u.supportLogin !== null }] : []));
        const cambio =
          c.kind === "ALTA"
            ? ({ kind: "ALTA", role: c.role } as const)
            : c.kind === "ROL"
              ? ({ kind: "ROL", userId: c.userId, role: c.role } as const)
              : ({ kind: c.kind, userId: c.userId } as const);
        const veredicto = revisarCambio({ equipo, autor, cambio, branchId: ctx.branchId });
        if (!veredicto.ok) return { ok: false, motivo: "NO_PERMITIDO", mensaje: veredicto.motivo };

        const quien = await nombreDe(tx, ctx);
        const rastro = { tenantId: ctx.tenantId, reason: c.reason, byUserId: quien.id, byName: quien.nombre };

        if (c.kind === "ALTA") {
          // F2-06: nadie da acceso a una sucursal que no gestiona.
          if (c.branchIds.some((b) => !autor.branchIds.includes(b))) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "No puedes dar acceso a una sucursal que no gestionas." };
          }
          const u = await tx.staffUser.create({
            data: { tenantId: ctx.tenantId, fullName: c.fullName, role: c.role, pinHash: temporalHash, pinMustChange: true },
          });
          for (const b of new Set(c.branchIds)) await tx.staffUserBranch.create({ data: { tenantId: ctx.tenantId, userId: u.id, branchId: b } });
          await tx.staffUserChange.create({ data: { ...rastro, userId: u.id, kind: "ALTA", toRole: c.role } });
          await auditar(tx, ctx, { action: accion, entityType: "staff_user", entityId: u.id, after: { nombre: c.fullName, role: c.role, sucursales: c.branchIds }, reason: c.reason });
          return { ok: true, valor: { usuario: await resumen(tx, u.id), mensaje: `${c.fullName} entra al equipo.`, pinTemporal: temporal! } };
        }

        const antes = await tx.staffUser.findUniqueOrThrow({ where: { id: c.userId } });
        const nombre = antes.fullName.split(" ")[0] ?? antes.fullName;
        let mensaje: string;
        if (c.kind === "BAJA") {
          await tx.staffUser.update({ where: { id: c.userId }, data: { active: false } });
          // F2-10: la baja revoca el acceso en el acto, no «en la próxima petición».
          await tx.staffSession.updateMany({ where: { userId: c.userId, closedAt: null }, data: { closedAt: new Date(), closedReason: "BAJA" } });
          mensaje = `${antes.fullName} queda de baja. No se borra: su historia se conserva.`;
        } else if (c.kind === "REINGRESO") {
          await tx.staffUser.update({ where: { id: c.userId }, data: { active: true } });
          mensaje = `${antes.fullName} vuelve al equipo.`;
        } else if (c.kind === "ROL") {
          await tx.staffUser.update({ where: { id: c.userId }, data: { role: c.role } });
          mensaje = `${nombre} cambia de rol.`;
        } else if (c.kind === "SOPORTE") {
          // T-17: el usuario es único en el tenant; otro con el mismo se dice antes de tocar nada.
          const otro = await tx.staffUser.findFirst({ where: { supportLogin: c.usuario, NOT: { id: c.userId } }, select: { id: true } });
          if (otro) return { ok: false, motivo: "INVALIDO", mensaje: `El usuario «${c.usuario}» ya es de otra persona.`, problemas: [{ path: ["usuario"], message: "Ya es de otra persona" }] };
          await tx.staffUser.update({ where: { id: c.userId }, data: { supportLogin: c.usuario } });
          mensaje = `${nombre} es la cuenta de soporte: entra por «Acceso de soporte» con el usuario «${c.usuario}».`;
        } else if (c.kind === "SOPORTE_FIN") {
          await tx.staffUser.update({ where: { id: c.userId }, data: { supportLogin: null } });
          mensaje = `${nombre} deja de ser la cuenta de soporte: vuelve a salir en «¿Quién entra?».`;
        } else {
          await tx.staffUser.update({
            where: { id: c.userId },
            data: { pinHash: temporalHash, pinMustChange: true, pinFailures: 0, pinLastFailureAt: null },
          });
          mensaje = `PIN repuesto: ${nombre} elegirá uno nuevo al entrar con el temporal.`;
        }
        await tx.staffUserChange.create({
          data: { ...rastro, userId: c.userId, kind: c.kind, ...(c.kind === "ROL" ? { fromRole: antes.role, toRole: c.role } : {}) },
        });
        await auditar(tx, ctx, {
          action: accion,
          entityType: "staff_user",
          entityId: c.userId,
          before: { role: antes.role, activo: antes.active, soporte: antes.supportLogin },
          after:
            c.kind === "ROL"
              ? { role: c.role }
              : c.kind === "BAJA"
                ? { activo: false }
                : c.kind === "REINGRESO"
                  ? { activo: true }
                  : c.kind === "SOPORTE"
                    ? { soporte: c.usuario }
                    : c.kind === "SOPORTE_FIN"
                      ? { soporte: null }
                      : { pin: "repuesto" },
          reason: c.reason,
        });
        return {
          ok: true,
          valor: { usuario: await resumen(tx, c.userId), mensaje, ...(c.kind === "PIN" ? { pinTemporal: temporal! } : {}) },
        };
      });
      if (!r.ok && r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
      return r;
    },

    async excepcion(ctx, entrada) {
      const cmd = PermissionExceptionCommandSchema.safeParse(entrada);
      if (!cmd.success) return { ok: false, motivo: "INVALIDO", mensaje: "La excepción no es válida.", problemas: problemasDe(cmd.error) };
      const c = cmd.data;
      if (!ctx.quien?.userId) return sinPersona;
      const accion = c.effect === "GRANT" ? "permiso.conceder" : "permiso.revocar";
      if (!esAccion(c.action)) return { ok: false, motivo: "INVALIDO", mensaje: "Esa acción no existe." };

      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<UserSummaryDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        // Escalada clásica: nadie se toca sus propios permisos.
        if (c.userId === ctx.quien!.userId) {
          return { ok: false, motivo: "NO_PERMITIDO", mensaje: "No puedes cambiar tus propios permisos: pide que lo haga otra persona." };
        }
        // Lo que gobierna el sistema no se regala por excepción (mismo criterio que F2-13).
        if (c.effect === "GRANT" && ACCIONES_INTOCABLES.includes(c.action as Action)) {
          return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Gestionar personas y el catálogo no se conceden por excepción: son de la administración." };
        }
        const u = await tx.staffUser.findUnique({ where: { id: c.userId }, include: { branches: true } });
        if (!u || !u.branches.some((b) => b.branchId === ctx.branchId)) {
          return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa persona no está en esta sucursal." };
        }
        if (!u.active) return { ok: false, motivo: "INVALIDO", mensaje: "Esa persona está de baja." };

        const quien = await nombreDe(tx, ctx);
        const previa = await tx.permissionException.findFirst({ where: { userId: c.userId, action: c.action, retiredAt: null } });
        if (previa) await tx.permissionException.update({ where: { id: previa.id }, data: { retiredAt: new Date() } });
        await tx.permissionException.create({
          data: {
            tenantId: ctx.tenantId,
            userId: c.userId,
            action: c.action,
            effect: c.effect,
            permission: c.effect === "GRANT" ? c.permission : null,
            reason: c.reason,
            grantedBy: quien.id === "sistema" ? null : quien.id,
            grantedByName: quien.nombre,
          },
        });
        await auditar(tx, ctx, {
          action: accion,
          entityType: "staff_user",
          entityId: c.userId,
          before: previa ? { accion: previa.action, efecto: previa.effect, nivel: previa.permission } : null,
          after: { accion: c.action, efecto: c.effect, nivel: c.effect === "GRANT" ? c.permission : null },
          reason: c.reason,
        });
        return { ok: true, valor: await resumen(tx, c.userId) };
      });
      if (!r.ok && r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
      return r;
    },
  };
}
