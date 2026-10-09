/**
 * Retirar un producto del catálogo, y devolverlo — B9-11 (M-34, S-2).
 *
 * Retirar lo saca de Productos, la caja, la carta, la tablet y las listas de carga (el catálogo lo marca `retirado`);
 * su historia (ventas, entradas, movimientos) queda. Nada se borra: cada retiro y cada vuelta es una fila de
 * `product_retirement` (solo agregar), y el producto queda además apartado, para que una versión anterior lo vea fuera
 * de la venta. Si tiene existencia, sale en la misma transacción como una salida (B9-4) con el motivo que se elija y el
 * porqué del retiro como detalle. Lo autoriza administración con su PIN, como las salidas (`inventario.ajustar`).
 */
import {
  DevolverProductoCommandSchema,
  RetirarProductoCommandSchema,
  RetiroHechoSchema,
  problemasDe,
  type Rechazo,
  type Resultado,
  type RetiroHechoDto,
} from "@l2/contracts";
import { costOfUnits, type StockValue } from "@l2/domain-inventory";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { nombreDe } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { bloquearProducto, existenciasDe } from "./existencias.ts";
import { asentarAjuste } from "./salidas.ts";

export interface CasosRetiro {
  /** Retira un producto (`RetirarProductoCommandSchema`); `autorizacion`, el PIN de administración. */
  retirar(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<RetiroHechoDto>>;
  /** Lo devuelve al catálogo (`DevolverProductoCommandSchema`), apartado de la venta hasta que se active. */
  devolver(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<RetiroHechoDto>>;
}

const CON_PIN = { confirmarConPin: true } as const;
const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas: [{ path, message }] });

/** Los productos retirados: los que tienen como última fila un RETIRO. */
export async function retiradosDe(tx: Transaccion): Promise<Set<string>> {
  const filas = await tx.productRetirement.findMany({ orderBy: [{ at: "desc" }, { id: "desc" }], distinct: ["productId"], select: { productId: true, kind: true } });
  return new Set(filas.filter((f) => f.kind === "RETIRO").map((f) => f.productId));
}

async function estaRetirado(tx: Transaccion, productId: string): Promise<boolean> {
  const ultima = await tx.productRetirement.findFirst({ where: { productId }, orderBy: [{ at: "desc" }, { id: "desc" }], select: { kind: true } });
  return ultima?.kind === "RETIRO";
}

export function casosRetiro(base: Base): CasosRetiro {
  return {
    async retirar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = RetirarProductoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se retiró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<RetiroHechoDto | Rechazo> => {
        const p = await tx.product.findUnique({ where: { id: cmd.productId } });
        if (!p) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
        // Un doble toque: el retiro ya está (con esta clave, su salida).
        if (await estaRetirado(tx, p.id)) {
          const previa = await tx.stockAdjustment.findUnique({ where: { tenantId_operationKey: { tenantId: ctx.tenantId, operationKey: cmd.idempotencyKey } } });
          if (previa) return RetiroHechoSchema.parse({ productId: p.id, retirado: true, en: previa.at.toISOString(), unidadesSacadas: 0 });
          return { ok: false, motivo: "CONFLICTO", mensaje: `${p.name} ya está retirado.` };
        }
        // Lo que le queda en esta sucursal sale con el retiro: se dice cómo.
        if (p.tracksStock) await bloquearProducto(tx, ctx.branchId, p.id);
        const hay = p.tracksStock ? ((await existenciasDe(tx, ctx.branchId, [p.id])).get(p.id) ?? { quantity: 0, valueMinor: 0n }) : null;
        const quedan = hay ? Math.max(0, hay.quantity) : 0;
        if (quedan > 0 && !cmd.salida) {
          return invalido(`Quedan ${quedan} de ${p.name}: elige cómo salen (merma, consumo interno, regalo o devolución al proveedor).`, ["salida"], "TIENE_EXISTENCIA");
        }
        // La autorización se comprueba y se registra ANTES de mover nada (§7.3).
        const permiso = await exigirPermisoOAutorizacion(tx, ctx, "inventario.ajustar", autorizacion, ahora, CON_PIN);
        if (!permiso.ok) return permiso;
        let ajusteId: string | null = null;
        if (quedan > 0 && hay) {
          const ajuste = await asentarAjuste(tx, ctx, {
            kind: "SALIDA",
            reason: cmd.salida!,
            note: `Retiro del catálogo: ${cmd.motivo}`.slice(0, 280),
            content: [{ productId: p.id, cantidad: quedan }],
            operationKey: cmd.idempotencyKey,
            ahora,
            autorizadoPor: permiso.autorizadoPor!,
            movimientos: [{ productId: p.id, quantity: -quedan, valueMinor: -costOfUnits(hay as StockValue, quedan) }],
            resumen: { motivo: cmd.salida, retiro: true },
          });
          ajusteId = ajuste.id;
        }
        const quien = await nombreDe(tx, ctx);
        const autorizador = await tx.staffUser.findUnique({ where: { id: permiso.autorizadoPor! }, select: { fullName: true } });
        await tx.productRetirement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: p.id,
            kind: "RETIRO",
            reason: cmd.motivo,
            adjustmentId: ajusteId,
            at: new Date(ahora),
            createdBy: ctx.quien?.userId ?? null,
            createdByName: quien.nombre,
            authorizedBy: permiso.autorizadoPor ?? null,
            authorizedByName: autorizador?.fullName ?? null,
          },
        });
        // Apartado también: una versión anterior, que no conoce el retiro, lo ve fuera de la venta.
        if (p.active) await tx.product.update({ where: { id: p.id }, data: { active: false } });
        await auditar(tx, ctx, {
          action: "producto.retirar",
          entityType: "product",
          entityId: p.id,
          authorizedBy: permiso.autorizadoPor!,
          reason: cmd.motivo,
          before: { nombre: p.name, activo: p.active, existencia: quedan },
          after: { nombre: p.name, retirado: true, ...(ajusteId ? { salida: ajusteId, unidades: quedan } : {}) },
        });
        return RetiroHechoSchema.parse({ productId: p.id, retirado: true, en: new Date(ahora).toISOString(), unidadesSacadas: quedan });
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "producto.retirar", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async devolver(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = DevolverProductoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se devolvió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<RetiroHechoDto | Rechazo> => {
        const p = await tx.product.findUnique({ where: { id: cmd.productId } });
        if (!p) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese producto no existe en este local." };
        if (!(await estaRetirado(tx, p.id))) return { ok: false, motivo: "CONFLICTO", mensaje: `${p.name} no está retirado.` };
        const permiso = await exigirPermisoOAutorizacion(tx, ctx, "inventario.ajustar", autorizacion, ahora, CON_PIN);
        if (!permiso.ok) return permiso;
        const quien = await nombreDe(tx, ctx);
        const autorizador = await tx.staffUser.findUnique({ where: { id: permiso.autorizadoPor! }, select: { fullName: true } });
        await tx.productRetirement.create({
          data: {
            tenantId: ctx.tenantId,
            productId: p.id,
            kind: "VUELTA",
            reason: cmd.motivo,
            at: new Date(ahora),
            createdBy: ctx.quien?.userId ?? null,
            createdByName: quien.nombre,
            authorizedBy: permiso.autorizadoPor ?? null,
            authorizedByName: autorizador?.fullName ?? null,
          },
        });
        // Vuelve apartado: se pone a la venta con «Activar» cuando corresponda (y, si se cuenta, con su entrada).
        await auditar(tx, ctx, {
          action: "producto.devolver",
          entityType: "product",
          entityId: p.id,
          authorizedBy: permiso.autorizadoPor!,
          reason: cmd.motivo,
          before: { nombre: p.name, retirado: true },
          after: { nombre: p.name, retirado: false, activo: p.active },
        });
        return RetiroHechoSchema.parse({ productId: p.id, retirado: false, en: new Date(ahora).toISOString(), unidadesSacadas: 0 });
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "producto.devolver", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}
