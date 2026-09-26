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
): Promise<Adelante | Rechazo> {
  const p = await permisoEn(tx, ctx, accion);
  if (p === "PERMITIDO") return { ok: true, autorizadoPor: null };
  if (p === "DENEGADO") return rechazoDePermiso(p);

  const aut = AutorizacionSchema.safeParse(entrada);
  if (!aut.success) return rechazoDePermiso("REQUIERE_AUTORIZACION");
  const { autorizadorId, pin, motivo } = aut.data;
  const negar = async (mensaje: string, extra?: object): Promise<Rechazo> => {
    await auditar(tx, ctx, { action: "autorizacion.negar", outcome: "NEGADO", reason: mensaje, after: { accion, autorizador: autorizadorId, ...extra } });
    return { ok: false, motivo: "NO_PERMITIDO", mensaje };
  };

  const solicitante = ctx.quien?.userId ? await cargarActor(tx, ctx.quien.userId, ctx.branchId) : null;
  const autorizador = await cargarActor(tx, autorizadorId, ctx.branchId);
  if (!solicitante || !autorizador || !canAuthorize(autorizador, solicitante, accion, { branchId: ctx.branchId })) {
    return negar("Esa persona no puede autorizar esto.");
  }

  const u = await tx.staffUser.findUniqueOrThrow({ where: { id: autorizadorId } });
  const bloqueo = computeLockout(u.pinFailures, u.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
  if (bloqueo.locked) return negar(describeLockout(bloqueo) ?? "Bloqueado.");
  if (!u.pinHash || u.pinMustChange || !(await verify(u.pinHash, pin).catch(() => false))) {
    await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) } });
    return negar("PIN de autorización incorrecto.");
  }

  await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: 0, pinLastFailureAt: null } });
  await auditar(tx, ctx, { action: "autorizacion.conceder", authorizedBy: autorizadorId, reason: motivo, after: { accion } });
  return { ok: true, autorizadoPor: autorizadorId };
}
