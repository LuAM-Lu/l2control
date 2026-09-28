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

let ordenDePrueba = 0;

/**
 * Una cuenta registrada (B3-3), sin versiones: basta para que el libro de pagos la cite. Las pruebas
 * de las cuentas en sí las abren con `app.cuentas.guardar`.
 */
export async function crearCuenta(local: LocalDePrueba, kind: "FAMILIA" | "MESA" | "MOSTRADOR" = "MOSTRADOR"): Promise<string> {
  const id = randomUUID();
  const { tenantId, branchId } = local.sistema;
  await local.base.conTenant(tenantId, (tx) =>
    tx.account.create({
      data: { id, tenantId, branchId, kind, orderNumber: 10_000 + ++ordenDePrueba, openedAt: new Date(), openedByName: "Prueba del libro" },
    }),
  );
  return id;
}

/**
 * La cuenta de una familia, abierta como en el local: por la entrada del parque (B4-2), con un niño
 * en un paquete de 1 hora a $ 10,00. Publica ese tarifario si el local todavía no tiene uno.
 */
export async function familiaDePrueba(
  local: LocalDePrueba,
  ctx: Contexto,
  ahora: number,
  paymentMode: "PREPAGO" | "CUENTA_ABIERTA" = "CUENTA_ABIERTA",
): Promise<import("@l2/contracts").FamilyAccountDto> {
  if (!(await local.app.tarifario.leer(local.sistema))) {
    const r = await local.app.tarifario.publicar(local.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: { minor: "1000", currency: "USD" }, active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
    });
    if (!r.ok) throw new Error(r.mensaje);
  }
  const n = ++ordenDePrueba;
  const r = await local.app.parque.entrar(
    ctx,
    {
      idempotencyKey: randomUUID(),
      paymentMode,
      entries: [{ wristbandCode: `PRUEBA-${n}`, kid: {}, packageId: "pkg-60" }],
      guardian: { fullName: "Familia Pérez", contactReference: `0412-${String(2_000_000 + n)}` },
    },
    ahora,
  );
  if (!r.ok) throw new Error(r.mensaje);
  return r.valor.account;
}
