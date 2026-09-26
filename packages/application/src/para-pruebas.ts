/**
 * Utilidades SOLO para las pruebas de integración (`*.test-db.ts`): un local de prueba con
 * personas y equipos reales en la base. No las importa el código de la aplicación.
 */
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Role } from "@l2/domain-identity";
import { abrirBase, type Base } from "@l2/database";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import { conectar, type Aplicacion, type Contexto } from "./index.ts";

export interface LocalDePrueba {
  app: Aplicacion;
  base: Base;
  /** Contexto de sistema del local: tenant, sucursal principal y sin persona. */
  sistema: Contexto;
  /** Otra sucursal del mismo tenant. */
  otraSucursal: string;
  cerrar(): Promise<void>;
}

/** Clave de cifrado de las pruebas: fija y sin valor fuera de ellas. */
export const CLAVE_DE_PRUEBA = Buffer.alloc(32, 9).toString("base64");

export async function abrirLocalDePrueba(url: string, nombre: string): Promise<LocalDePrueba> {
  const app = await conectar(url, { claveCifrado: CLAVE_DE_PRUEBA });
  const base = await abrirBase(url);
  const tenantId = randomUUID();
  const sistema: Contexto = { tenantId, branchId: randomUUID(), sistema: true };
  const otraSucursal = randomUUID();
  await app.sucursal.asegurar(sistema, { tenant: nombre, sucursal: "Principal" });
  await base.conTenant(tenantId, (tx) => tx.branch.create({ data: { id: otraSucursal, tenantId, name: "Otra" } }));
  return {
    app,
    base,
    sistema,
    otraSucursal,
    async cerrar() {
      await borrarTenantsDePrueba(url, [tenantId]);
      await Promise.all([app.cerrar(), base.cerrar()]);
    },
  };
}

export async function crearPersona(
  local: LocalDePrueba,
  p: { nombre: string; role: Role; pin?: string | null; activa?: boolean; sucursales?: string[] },
): Promise<string> {
  const id = randomUUID();
  const { tenantId, branchId } = local.sistema;
  await local.base.conTenant(tenantId, async (tx) => {
    await tx.staffUser.create({
      data: {
        id,
        tenantId,
        fullName: p.nombre,
        role: p.role,
        active: p.activa ?? true,
        pinHash: p.pin === null ? null : await hash(p.pin ?? "2580"),
      },
    });
    for (const b of p.sucursales ?? [branchId]) {
      await tx.staffUserBranch.create({ data: { tenantId, userId: id, branchId: b } });
    }
  });
  return id;
}

/** Un equipo registrado (y aprobado, salvo que se diga lo contrario). Devuelve su credencial. */
export async function crearEquipo(local: LocalDePrueba, label: string, aprobar = true): Promise<string> {
  const r = await local.app.dispositivos.solicitar(local.sistema, label, "10.0.0.1");
  if (!r.ok) throw new Error(`No se pudo registrar el equipo: ${r.mensaje}`);
  if (aprobar) {
    const a = await local.app.dispositivos.ordenar(local.sistema, {
      kind: "APROBAR",
      deviceId: r.valor.credencial.split(".")[1],
      reason: "Aprobado en la preparación de la prueba",
    });
    if (!a.ok) throw new Error(`No se pudo aprobar el equipo: ${a.mensaje}`);
  }
  return r.valor.credencial;
}

/**
 * El contexto de una persona que entra con su PIN en `equipo` y confirma identidad con
 * contraseña y TOTP (F2-04), como haría la pantalla. Da credenciales si no las tenía.
 */
export async function contextoElevado(
  local: LocalDePrueba,
  equipo: string,
  persona: { id: string; nombre: string; pin: string },
): Promise<Contexto> {
  const { Secret, TOTP } = await import("otpauth");
  const { contextoDeSesion } = await import("./identidad/sesiones.ts");
  const c = await local.app.elevacion.credenciales(local.sistema, { nombre: persona.nombre, contrasena: "contraseña-de-prueba" });
  if (!c.ok) throw new Error(c.mensaje);
  const ahora = Date.now();
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId: persona.id, pin: persona.pin, ip: null, ahora });
  if (!r.ok) throw new Error(r.mensaje);
  const codigo = new TOTP({ secret: Secret.fromBase32(c.valor.secretoBase32) }).generate({ timestamp: ahora });
  const e = await local.app.elevacion.elevar({ sesion: r.credencial, contrasena: "contraseña-de-prueba", codigo, ip: null, ahora });
  if (!e.ok) throw new Error(e.mensaje);
  return contextoDeSesion((await local.app.sesiones.consultar(r.credencial, ahora))!, null);
}

/** El contexto de una persona que entra con su PIN (sin elevar). */
export async function contextoDe(local: LocalDePrueba, equipo: string, userId: string, pin: string): Promise<Contexto> {
  const { contextoDeSesion } = await import("./identidad/sesiones.ts");
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId, pin, ip: null, ahora: Date.now() });
  if (!r.ok) throw new Error(r.mensaje);
  return contextoDeSesion(r.sesion, null);
}
