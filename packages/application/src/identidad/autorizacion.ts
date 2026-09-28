/**
 * La autorización de un 🔐 — F2-08, §7.3, DEC-24.
 *
 * Cuando la matriz dice REQUIERE_AUTORIZACION, la operación puede hacerse, pero con el motivo y
 * la identidad de quien autoriza —un supervisor o la administración, con su PIN— registrados
 * ANTES de ejecutar: en la misma transacción y como primer asiento, así que no hay operación sin
 * su autorización ni autorización colgando de una operación que no ocurrió.
 *
 * Quién puede autorizar lo decide el dominio (`canAuthorize`). El PIN del autorizador pasa por
 * Argon2id y por su bloqueo creciente; cada negativa también queda registrada.
 */
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { DEFAULT_LOCKOUT_POLICY, canAuthorize, computeLockout, describeLockout, type Action } from "@l2/domain-identity";
import type { Rechazo } from "@l2/contracts";
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { cargarActor, permisoEn, rechazoDePermiso } from "./actor.ts";

/** Lo que aporta quien autoriza: su id, su PIN y el motivo (de la lista cerrada de cada acción). */
export const AutorizacionSchema = z.strictObject({
  autorizadorId: z.string().uuid(),
  pin: z.string().regex(/^\d{4,8}$/),
  motivo: z.string().trim().min(3).max(280),
});
export type Autorizacion = z.infer<typeof AutorizacionSchema>;

export type Adelante = Readonly<{ ok: true; autorizadoPor: string | null }>;

export type OpcionesDeAutorizacion = Readonly<{
  /**
   * Quien puede hacerlo por sí mismo confirma igual con su PIN (B3-4): una operación que devuelve
   * dinero o lo regala no se hace con la sesión que alguien dejó abierta. Queda como autorizada por
   * esa misma persona.
   */
  confirmarConPin?: boolean;
}>;

/**
 * El permiso de una operación que puede requerir autorización. Devuelve `autorizadoPor` para
 * guardarlo con la operación (y en `authorizedBy` de su asiento), o el rechazo.
 */
export async function exigirPermisoOAutorizacion(
  tx: Transaccion,
  ctx: Contexto,
  accion: Action,
  entrada: unknown,
  ahora: number = Date.now(),
  opciones: OpcionesDeAutorizacion = {},
): Promise<Adelante | Rechazo> {
  const p = await permisoEn(tx, ctx, accion);
  if (p === "DENEGADO") return rechazoDePermiso(p);
  if (p === "PERMITIDO" && (!opciones.confirmarConPin || ctx.sistema)) return { ok: true, autorizadoPor: null };

  const aut = AutorizacionSchema.safeParse(entrada);
  if (!aut.success) {
    return p === "PERMITIDO"
      ? { ok: false, motivo: "NO_PERMITIDO", mensaje: "Confirma con tu PIN." }
      : rechazoDePermiso("REQUIERE_AUTORIZACION");
  }
  if (p === "PERMITIDO") return confirmarPinPropio(tx, ctx, accion, aut.data, ahora);

  const { autorizadorId } = aut.data;
  const solicitante = ctx.quien?.userId ? await cargarActor(tx, ctx.quien.userId, ctx.branchId) : null;
  const autorizador = await cargarActor(tx, autorizadorId, ctx.branchId);
  if (!solicitante || !autorizador || !canAuthorize(autorizador, solicitante, accion, { branchId: ctx.branchId })) {
    return negarAutorizacion(tx, ctx, accion, autorizadorId, "Esa persona no puede autorizar esto.");
  }
  return comprobarPin(tx, ctx, accion, aut.data, ahora, "PIN de autorización incorrecto.");
}

/**
 * Quien opera confirma con su propio PIN (B3-4, B3-5): la cajera firma su corte Z, la administración
 * anula o regala. Nadie confirma por otro. Queda como autorizado por esa misma persona.
 */
export async function confirmarPinPropio(
  tx: Transaccion,
  ctx: Contexto,
  accion: Action,
  entrada: unknown,
  ahora: number = Date.now(),
): Promise<Adelante | Rechazo> {
  const aut = AutorizacionSchema.safeParse(entrada);
  if (!aut.success) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Confirma con tu PIN." };
  if (!ctx.quien?.userId || aut.data.autorizadorId !== ctx.quien.userId) {
    return negarAutorizacion(tx, ctx, accion, aut.data.autorizadorId, "Confirma con tu propio PIN.");
  }
  return comprobarPin(tx, ctx, accion, aut.data, ahora, "PIN incorrecto.");
}

async function negarAutorizacion(tx: Transaccion, ctx: Contexto, accion: Action, autorizadorId: string, mensaje: string, extra?: object): Promise<Rechazo> {
  await auditar(tx, ctx, { action: "autorizacion.negar", outcome: "NEGADO", reason: mensaje, after: { accion, autorizador: autorizadorId, ...extra } });
  return { ok: false, motivo: "NO_PERMITIDO", mensaje };
}

/** El PIN de quien autoriza, con su bloqueo creciente; cada negativa y cada concesión, auditadas. */
async function comprobarPin(tx: Transaccion, ctx: Contexto, accion: Action, a: Autorizacion, ahora: number, mensajeMalo: string): Promise<Adelante | Rechazo> {
  const u = await tx.staffUser.findUniqueOrThrow({ where: { id: a.autorizadorId } });
  const bloqueo = computeLockout(u.pinFailures, u.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
  if (bloqueo.locked) return negarAutorizacion(tx, ctx, accion, a.autorizadorId, describeLockout(bloqueo) ?? "Bloqueado.");
  if (!u.pinHash || u.pinMustChange || !(await verify(u.pinHash, a.pin).catch(() => false))) {
    await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) } });
    return negarAutorizacion(tx, ctx, accion, a.autorizadorId, mensajeMalo);
  }
  await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: 0, pinLastFailureAt: null } });
  await auditar(tx, ctx, { action: "autorizacion.conceder", authorizedBy: a.autorizadorId, reason: a.motivo, after: { accion } });
  return { ok: true, autorizadoPor: a.autorizadorId };
}

/**
 * Quiénes pueden autorizar a quien opera en `ctx` a hacer `accion`: lo que la pantalla ofrece en
 * «Quién autoriza». Vacío si no le hace falta autorización (o si no puede ni pidiéndola). Es una
 * lista para elegir, no un permiso: el que decide es `exigirPermisoOAutorizacion` al ejecutar.
 */
export async function autorizadoresPara(
  tx: Transaccion,
  ctx: Contexto,
  accion: Action,
): Promise<{ id: string; nombre: string; rol: string }[]> {
  if (!ctx.quien?.userId) return [];
  const solicitante = await cargarActor(tx, ctx.quien.userId, ctx.branchId);
  if (!solicitante) return [];
  const personas = await tx.staffUser.findMany({
    where: { active: true, branches: { some: { branchId: ctx.branchId } } },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });
  const lista: { id: string; nombre: string; rol: string }[] = [];
  for (const p of personas) {
    const actor = await cargarActor(tx, p.id, ctx.branchId);
    if (actor && canAuthorize(actor, solicitante, accion, { branchId: ctx.branchId })) {
      lista.push({ id: p.id, nombre: p.fullName, rol: p.role });
    }
  }
  return lista;
}
