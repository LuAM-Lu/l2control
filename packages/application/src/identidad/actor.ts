/**
 * Quién es quien opera, en la forma que entiende el dominio, y qué puede hacer AQUÍ — F2-05.
 *
 * La matriz es la de `@l2/domain-identity`, la misma que usa la web para pintar; lo que cambia
 * es de dónde salen los datos: de la base, dentro de la transacción del tenant. El actor lleva
 * TODO lo que decide el permiso (§9.10.6 y F2-13): rol, sucursales, concesiones y revocaciones
 * vigentes de la persona, y ajustes vigentes de su rol en esta sucursal.
 *
 * Deny-by-default: sin persona, persona de baja o rol desconocido → DENEGADO.
 */
import { MATRIZ, can, type Action, type Actor, type Permission, type Role } from "@l2/domain-identity";
import type { Rechazo } from "@l2/contracts";
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";

export const ROLES: readonly Role[] = ["ADMIN", "SUPERVISOR", "CAJERO", "MESERO", "MONITOR_PARQUE", "COCINA"];
export const esRol = (r: string): r is Role => (ROLES as readonly string[]).includes(r);
export const esAccion = (a: string): a is Action => Object.hasOwn(MATRIZ, a);
const esNivel = (p: string | null): p is Permission =>
  p === "PERMITIDO" || p === "REQUIERE_AUTORIZACION" || p === "DENEGADO";

/** El actor de `userId` para operar en `branchId`, o `null` si no puede operar en absoluto. */
export async function cargarActor(tx: Transaccion, userId: string, branchId: string): Promise<Actor | null> {
  const u = await tx.staffUser.findUnique({
    where: { id: userId },
    include: { branches: true, exceptions: { where: { retiredAt: null } } },
  });
  if (!u || !u.active || !esRol(u.role)) return null;

  const ajustes = await tx.roleAdjustment.findMany({ where: { branchId, role: u.role, retiredAt: null } });

  const grants: Partial<Record<Action, Permission>> = {};
  const revokes: Action[] = [];
  // Una acción que ya no existe en la matriz se ignora: no puede conceder nada.
  for (const e of u.exceptions) {
    if (!esAccion(e.action)) continue;
    if (e.effect === "REVOKE") revokes.push(e.action);
    else if (e.effect === "GRANT" && esNivel(e.permission)) grants[e.action] = e.permission;
  }
  const roleAdjustments: Partial<Record<Action, Permission>> = {};
  for (const a of ajustes) {
    if (esAccion(a.action) && esNivel(a.permission)) roleAdjustments[a.action] = a.permission;
  }

  return {
    id: u.id,
    role: u.role,
    branchIds: u.branches.map((b) => b.branchId),
    grants,
    revokes,
    roleAdjustments,
  };
}

/** El permiso de quien opera en `ctx` para `accion`, en la sucursal del contexto. */
export async function permisoEn(tx: Transaccion, ctx: Contexto, accion: Action): Promise<Permission> {
  // El sistema (semillas, consola del servidor) no es una persona: no pasa por la matriz.
  if (ctx.sistema) return "PERMITIDO";
  if (!ctx.quien?.userId) return "DENEGADO";
  const actor = await cargarActor(tx, ctx.quien.userId, ctx.branchId);
  return actor ? can(actor, accion, { branchId: ctx.branchId }) : "DENEGADO";
}

/**
 * Lo que además del permiso exige confirmar identidad con contraseña y llave de acceso (F2-04, ADR-020):
 * configuración, precios, personas y reportes globales. Vale para leer y para escribir.
 */
export const ACCIONES_ELEVADAS: readonly Action[] = ["catalogo.modificar", "usuarios.gestionar", "reportes.verTodas"];

/**
 * El permiso completo de una operación, en un solo sitio: la matriz y, si la acción lo exige,
 * la elevación vigente. `null` = adelante; si no, el rechazo que hay que devolver.
 */
export async function exigirPermiso(tx: Transaccion, ctx: Contexto, accion: Action): Promise<Rechazo | null> {
  const p = await permisoEn(tx, ctx, accion);
  if (p !== "PERMITIDO") return rechazoDePermiso(p);
  if (ctx.sistema || !ACCIONES_ELEVADAS.includes(accion)) return null;
  const hasta = ctx.elevadaHasta ? Date.parse(ctx.elevadaHasta) : Number.NaN;
  if (Number.isFinite(hasta) && hasta > Date.now()) return null;
  return {
    ok: false,
    motivo: "ELEVACION_REQUERIDA",
    mensaje: "Confirma que eres tú: tu contraseña y tu llave de acceso.",
  };
}

/** El rechazo que corresponde a un permiso que no es PERMITIDO, con palabras. */
export function rechazoDePermiso(p: Exclude<Permission, "PERMITIDO">): Rechazo {
  return p === "REQUIERE_AUTORIZACION"
    ? { ok: false, motivo: "NO_PERMITIDO", mensaje: "Esto necesita la autorización de un supervisor." }
    : { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu puesto no permite hacer esto." };
}

/** Nombre de quien opera, para los historiales que lo muestran («Aprobado por Abigail Karam»). */
export async function nombreDe(tx: Transaccion, ctx: Contexto): Promise<{ id: string; nombre: string }> {
  if (!ctx.quien?.userId) return { id: "sistema", nombre: "Consola del servidor" };
  const u = await tx.staffUser.findUnique({ where: { id: ctx.quien.userId }, select: { fullName: true } });
  return { id: ctx.quien.userId, nombre: u?.fullName ?? "Persona desconocida" };
}
