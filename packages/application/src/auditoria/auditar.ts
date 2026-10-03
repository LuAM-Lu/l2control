/**
 * El asiento de auditoría — §7.4, F2-07.
 *
 * Se escribe con el `tx` de la operación: los dos se confirman juntos o ninguno. No hay
 * operación sin asiento ni asiento sin operación; si el asiento no entra, la operación no
 * ocurre (fail-closed). Los rechazos (`NEGADO`) van en su propia transacción, porque la
 * operación no llegó a existir.
 *
 * `before` y `after` pasan por la misma redacción que los logs: este registro sale de la
 * máquina (§7.4) y no puede llevar PIN, contactos ni referencias de pago (§7.6).
 */
import type { Base, Prisma, Transaccion } from "@l2/database";
import { redactar } from "@l2/observability";
import type { Contexto } from "../contexto.ts";

/**
 * El catálogo de lo que se audita. Un nombre nuevo se añade aquí, y la base además exige su
 * forma (`dominio.verbo`), así que un asiento no sirve para colar texto libre.
 */
export type AccionAuditada =
  | "tarifario.publicar"
  | "sucursal.ajustar"
  | "tasa.capturar"
  | "tasa.confirmar"
  | "tasa.aplicar"
  | "tasa.sincronizar"
  | "impuesto.programar"
  | "pago.asentar"
  | "pago.revertir"
  | "turno.abrir"
  | "cuenta.abrir"
  | "cuenta.guardar"
  | "cuenta.cobrar"
  | "cuenta.anular_cobro"
  | "cuenta.cortesia"
  | "cuenta.quitar_cortesia"
  | "cuenta.incobrable"
  | "cuenta.descuento"
  | "cuenta.quitar_descuento"
  | "descuento.crear"
  | "descuento.retirar"
  | "familia.vip"
  | "impresion.encolar"
  | "impresion.confirmar"
  | "impresion.fallar"
  | "impresion.reintentar"
  | "impresion.descartar"
  | "producto.carta"
  | "plano.publicar"
  | "pedido.enviar"
  | "pedido.reimprimir"
  | "pedido.anular"
  | "mesa.vincular"
  | "impresora.crear"
  | "impresora.editar"
  | "impresora.activar"
  | "impresora.retirar"
  | "agente.codigo"
  | "agente.vincular"
  | "agente.retirar"
  | "turno.arqueo"
  | "turno.corte_x"
  | "turno.corte_z"
  | "venta.imprimir"
  | "parque.entrada"
  | "parque.salida"
  | "parque.nombrar"
  | "parque.recarga"
  | "parque.cierre_administrativo"
  | "representante.corregir"
  | "nino.corregir"
  | "venta.reimprimir"
  | "medio.crear"
  | "medio.encender"
  | "medio.apagar"
  | "medio.datos"
  | "terminal.crear"
  | "terminal.retirar"
  | "producto.crear"
  | "producto.editar"
  | "producto.activar"
  | "producto.apartar"
  | "producto.minimo"
  | "existencia.mover"
  | "inventario.entrada"
  | "inventario.salida"
  | "inventario.conteo"
  | "precio.programar"
  | "feriado.registrar"
  | "feriado.retirar"
  | "sesion.abrir"
  | "sesion.cerrar"
  | "sesion.pin_fallido"
  | "sesion.bloqueada"
  | "sesion.elevar"
  | "sesion.elevar_fallido"
  | "dispositivo.solicitar"
  | "dispositivo.aprobar"
  | "dispositivo.revocar"
  | "dispositivo.renombrar"
  | "usuario.alta"
  | "usuario.baja"
  | "usuario.reingreso"
  | "usuario.rol"
  | "usuario.pin"
  | "usuario.contrasena"
  | "permiso.conceder"
  | "permiso.revocar"
  | "permiso.retirar"
  | "acceso.ajustar"
  | "acceso.retirar"
  | "autorizacion.conceder"
  | "autorizacion.negar";

export interface Asiento {
  action: AccionAuditada;
  outcome?: "HECHO" | "NEGADO";
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  /** Quién dio la autorización de un 🔐 (F2-08). */
  authorizedBy?: string;
  /** Solo si la operación no es de la sucursal del contexto (p. ej., un acceso sin dispositivo). */
  sinSucursal?: boolean;
}

/** Un JSON redactado, o nada: un campo vacío se omite y la base lo deja en NULL. */
const json = (campo: "before" | "after", v: unknown) =>
  v === undefined || v === null ? {} : { [campo]: redactar(v) as Prisma.InputJsonValue };

/** Escribe el asiento dentro de `tx`. El instante lo pone la base, no el que llama. */
export async function auditar(tx: Transaccion, ctx: Contexto, a: Asiento): Promise<void> {
  await tx.auditEntry.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: a.sinSucursal ? null : ctx.branchId,
      actorId: ctx.quien?.userId ?? null,
      deviceId: ctx.quien?.deviceId ?? null,
      ip: ctx.ip ?? null,
      action: a.action,
      outcome: a.outcome ?? "HECHO",
      entityType: a.entityType ?? null,
      entityId: a.entityId ?? null,
      ...json("before", a.before),
      ...json("after", a.after),
      reason: a.reason ?? null,
      authorizedBy: a.authorizedBy ?? null,
    },
  });
}

/** Registra un rechazo en su propia transacción: la operación no llegó a existir. */
export function auditarRechazo(base: Base, ctx: Contexto, a: Omit<Asiento, "outcome">): Promise<void> {
  return base.conTenant(ctx.tenantId, (tx) => auditar(tx, ctx, { ...a, outcome: "NEGADO" }));
}
