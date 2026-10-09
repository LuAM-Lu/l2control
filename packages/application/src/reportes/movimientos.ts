/**
 * Los movimientos (kárdex) — B11-3 (M-29).
 *
 * De solo lectura, para quien ve la sucursal (`reportes.verSucursal`). De un producto o de una categoría, en un periodo
 * de días del local: el saldo al empezar (la suma de los movimientos de antes), cada movimiento con su fecha, quién, de
 * dónde vino o por qué, y el saldo que dejó (`@l2/domain-inventory`). Además de `stock_movement`, lo que pasó sin mover
 * nada: un conteo que cuadró y un inventario inicial en cero. Una venta dice dónde se vendió (la mesa, el parque, el
 * mostrador), nunca a quién.
 */
import {
  ConsultaDeMovimientosSchema,
  InformeDeMovimientosSchema,
  problemasDe,
  type InformeDeMovimientosDto,
  type Rechazo,
  type Resultado,
  type TipoDeMovimiento,
} from "@l2/contracts";
import { conSaldo, resumenDeKardex } from "@l2/domain-inventory";
import { addDays, startOfDay } from "@l2/domain-rates";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { existenciasDe } from "../inventario/existencias.ts";

const ENTRADA: Readonly<Record<string, string>> = { COMPRA: "Compra", REPOSICION: "Reposición", INICIAL: "Inventario inicial" };
const SALIDA: Readonly<Record<string, string>> = {
  MERMA: "Merma",
  CONSUMO_INTERNO: "Consumo interno",
  REGALO: "Regalo",
  DEVOLUCION_PROVEEDOR: "Devolución al proveedor",
};

/** Dónde se vendió, por la cuenta que movió la existencia: el lugar, sin el nombre de nadie. */
function lugarDe(content: unknown): string {
  const c = (content ?? {}) as { kind?: string; tableLabel?: string | null; dePie?: boolean };
  if (c.kind === "MESA") return `Mesa ${c.tableLabel ?? ""}`.trim();
  if (c.kind === "MOSTRADOR") return c.dePie ? "De pie, en el salón" : "Mostrador";
  if (c.kind === "EVENTO") return "Cumpleaños";
  if (c.kind === "FAMILIA") return "Parque";
  return "Cuenta";
}

const con = (...partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(" · ");

type Fila = { at: number; quantity: number; tipo: TipoDeMovimiento; detalle: string; quien: string; autorizo: string | null };

export interface CasosMovimientos {
  /** El kárdex de un producto o de una categoría en un periodo (`ConsultaDeMovimientosSchema`). */
  movimientos(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<InformeDeMovimientosDto>>;
}

export function casosMovimientos(base: Base): CasosMovimientos {
  return {
    async movimientos(ctx, entrada, ahora = Date.now()) {
      const v = ConsultaDeMovimientosSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: v.error.issues[0]?.message ?? "El informe no se pudo pedir: revisa el periodo.", problemas: problemasDe(v.error) };
      const q = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<InformeDeMovimientosDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);

        // Lo que se cuenta, para elegir; y lo que entra en el informe.
        const contados = await tx.product.findMany({
          where: { tracksStock: true },
          select: { id: true, name: true, sku: true, category: true },
          orderBy: [{ category: "asc" }, { name: "asc" }],
        });
        // Sin producto ni categoría (o con uno que ya no se cuenta), el informe trae solo lo que se puede elegir.
        const elegidos = q.producto ? contados.filter((x) => x.id === q.producto) : q.categoria ? contados.filter((x) => x.category === q.categoria) : [];
        const ids = elegidos.map((x) => x.id);

        // El periodo en instantes: del comienzo del primer día al del siguiente al último, en la zona del local.
        const inicio = new Date(startOfDay(q.desde, ajustes.zonaHoraria));
        const fin = new Date(startOfDay(addDays(q.hasta, 1), ajustes.zonaHoraria));
        const enPeriodo = { gte: inicio, lt: fin };

        const antes = await tx.stockMovement.groupBy({ by: ["productId"], where: { branchId: ctx.branchId, productId: { in: ids }, at: { lt: inicio } }, _sum: { quantity: true } });
        const inicial = new Map(antes.map((a) => [a.productId, a._sum.quantity ?? 0]));
        const ahoraHay = await existenciasDe(tx, ctx.branchId, ids);

        const movs = await tx.stockMovement.findMany({
          where: { branchId: ctx.branchId, productId: { in: ids }, at: enPeriodo },
          include: {
            entrada: { select: { kind: true, supplier: true, invoice: true } },
            ajuste: { select: { kind: true, reason: true, note: true, content: true, authorizedByName: true } },
            causa: { select: { content: true } },
            anulada: { select: { reason: true, authorizedByName: true, entrada: { select: { kind: true, receivedAt: true } } } },
            retorno: { select: { reason: true, authorizedByName: true, sale: { select: { orderNumber: true } } } },
          },
          orderBy: [{ at: "asc" }, { id: "asc" }],
        });
        const filas = new Map<string, Fila[]>(ids.map((id) => [id, []]));
        const movidos = new Set<string>();
        for (const m of movs) {
          const fila: Fila = { at: m.at.getTime(), quantity: m.quantity, tipo: m.kind as TipoDeMovimiento, detalle: "", quien: m.createdByName, autorizo: null };
          if (m.kind === "ENTRADA" && m.entrada) {
            fila.detalle = con(ENTRADA[m.entrada.kind] ?? m.entrada.kind, m.entrada.supplier, m.entrada.invoice && `factura ${m.entrada.invoice}`, m.packs !== null && m.packSize !== null && m.packSize > 1 && `${m.packs} × ${m.packSize}`);
            movidos.add(`${m.entryId}|${m.productId}`);
          } else if (m.kind === "SALIDA" && m.ajuste) {
            fila.detalle = con(SALIDA[m.ajuste.reason ?? ""] ?? "Salida", m.ajuste.note);
            fila.autorizo = m.ajuste.authorizedByName;
          } else if (m.kind === "AJUSTE" && m.ajuste) {
            const linea = (m.ajuste.content as { productId: string; esperado?: number; contado?: number }[]).find((l) => l.productId === m.productId);
            fila.detalle = con(linea ? `Conteo: se esperaban ${linea.esperado ?? "?"} y se contaron ${linea.contado ?? "?"}` : "Conteo", m.ajuste.note);
            fila.autorizo = m.ajuste.authorizedByName;
            movidos.add(`${m.adjustmentId}|${m.productId}`);
          } else if (m.kind === "VENTA") {
            fila.detalle = `Venta · ${lugarDe(m.causa?.content)}`;
          } else if (m.kind === "DEVOLUCION") {
            fila.detalle = `Quitado de una cuenta sin cobrar · ${lugarDe(m.causa?.content)}`;
          } else if (m.kind === "RETORNO" && m.retorno) {
            // B3-14: lo que un cliente devolvió y volvió al estante.
            fila.detalle = con(`Devuelto por un cliente · orden #${String(m.retorno.sale.orderNumber).padStart(4, "0")}`, m.retorno.reason);
            fila.autorizo = m.retorno.authorizedByName;
          } else if (m.kind === "ANULACION" && m.anulada) {
            // B9-12: la entrada mal cargada, anulada con su reverso.
            fila.detalle = con(`Anulación: ${(ENTRADA[m.anulada.entrada.kind] ?? "entrada").toLowerCase()}`, m.anulada.reason);
            fila.autorizo = m.anulada.authorizedByName;
          }
          filas.get(m.productId)!.push(fila);
        }

        // Lo que pasó sin mover nada: el conteo que cuadró y el inventario inicial en cero.
        const conteos = await tx.stockAdjustment.findMany({ where: { branchId: ctx.branchId, kind: "CONTEO", at: enPeriodo }, select: { id: true, at: true, note: true, content: true, createdByName: true, authorizedByName: true } });
        for (const c of conteos) {
          for (const l of c.content as { productId: string; esperado?: number; contado?: number }[]) {
            if (!filas.has(l.productId) || movidos.has(`${c.id}|${l.productId}`)) continue;
            filas.get(l.productId)!.push({ at: c.at.getTime(), quantity: 0, tipo: "CONTEO", detalle: con(`Conteo: se contaron ${l.contado ?? "?"}, cuadra`, c.note), quien: c.createdByName, autorizo: c.authorizedByName });
          }
        }
        const arranques = await tx.stockStart.findMany({ where: { branchId: ctx.branchId, productId: { in: ids }, startedAt: enPeriodo, quantity: 0, entryId: { not: null } }, select: { productId: true, entryId: true, startedAt: true, createdByName: true } });
        for (const a of arranques) {
          if (movidos.has(`${a.entryId}|${a.productId}`)) continue;
          filas.get(a.productId)!.push({ at: a.startedAt.getTime(), quantity: 0, tipo: "INICIAL", detalle: "Inventario inicial en cero", quien: a.createdByName, autorizo: null });
        }

        const categorias = [...new Set(contados.map((x) => x.category))];
        return InformeDeMovimientosSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          periodo: { desde: q.desde, hasta: q.hasta },
          filtro: { producto: q.producto ? (elegidos[0]?.name ?? null) : null, categoria: q.producto ? null : (q.categoria ?? null) },
          productos: elegidos.map((x) => {
            const desde = inicial.get(x.id) ?? 0;
            const lista = filas.get(x.id)!;
            const resumen = resumenDeKardex(desde, lista);
            return {
              id: x.id,
              nombre: x.name,
              sku: x.sku,
              categoria: x.category,
              inicial: desde,
              entradas: resumen.entradas,
              salidas: resumen.salidas,
              final: resumen.final,
              existencia: ahoraHay.get(x.id)?.quantity ?? 0,
              movimientos: conSaldo(desde, lista).map((f) => ({
                en: new Date(f.at).toISOString(),
                tipo: f.tipo,
                detalle: f.detalle,
                quien: f.quien,
                autorizo: f.autorizo,
                cantidad: f.quantity,
                saldo: f.saldo,
              })),
            };
          }),
          opciones: { productos: contados.map((x) => ({ id: x.id, nombre: x.name, sku: x.sku, categoria: x.category })), categorias },
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
