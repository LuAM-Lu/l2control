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

export async function abrirLocalDePrueba(url: string, nombre: string): Promise<LocalDePrueba> {
  const app = await conectar(url);
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
