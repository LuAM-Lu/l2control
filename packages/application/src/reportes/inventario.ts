/**
 * El inventario al momento — B11-2 (M-29).
 *
 * De solo lectura, para quien ve la sucursal (`reportes.verSucursal`). A la hora en que se pide, cada producto que se
 * cuenta con su existencia (la suma de sus movimientos, B9-2), su costo promedio y su valor al costo (B9-3), y su estado
 * con la misma regla que Inventario → Productos (`stockStatus`): sin inventario inicial, agotado, bajo mínimo o bien.
 * Un producto retirado de la venta con existencia sigue contando: lo que hay en el depósito vale aunque no se venda.
 */
import { InformeDeInventarioSchema, type InformeDeInventarioDto, type Rechazo, type Resultado } from "@l2/contracts";
import { averageUnitCostMinor, stockStatus } from "@l2/domain-inventory";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { arranquesDe, existenciasDe } from "../inventario/existencias.ts";

const usd = (minor: bigint) => ({ minor: String(minor), currency: "USD" as const });

export interface CasosInventarioAlMomento {
  /** El inventario de la sucursal a esta hora. */
  inventario(ctx: Contexto, ahora?: number): Promise<Resultado<InformeDeInventarioDto>>;
}

export function casosInventarioAlMomento(base: Base): CasosInventarioAlMomento {
  return {
    async inventario(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<InformeDeInventarioDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const contados = await tx.product.findMany({
          where: { tracksStock: true },
          select: { id: true, name: true, sku: true, presentation: true, category: true, minStock: true, active: true },
          orderBy: [{ category: "asc" }, { name: "asc" }],
        });
        const hay = await existenciasDe(tx, ctx.branchId);
        const arranques = await arranquesDe(tx, ctx.branchId);

        const productos = contados
          .map((x) => {
            const stock = hay.get(x.id) ?? { quantity: 0, valueMinor: 0n };
            const costo = averageUnitCostMinor(stock);
            return {
              id: x.id,
              nombre: x.name,
              sku: x.sku,
              presentacion: x.presentation,
              categoria: x.category,
              existencia: stock.quantity,
              minimo: x.minStock,
              costoPromedio: costo === null ? null : usd(costo),
              valor: usd(stock.quantity > 0 ? stock.valueMinor : 0n),
              estado: stockStatus(stock.quantity, x.minStock, arranques.has(x.id)),
              retirado: !x.active,
            };
          })
          // Uno retirado sin nada en el depósito ya no es inventario.
          .filter((x) => !x.retirado || x.existencia !== 0);

        const porCategoria = new Map<string, { productos: number; unidades: number; valor: bigint }>();
        for (const x of productos) {
          const c = porCategoria.get(x.categoria) ?? { productos: 0, unidades: 0, valor: 0n };
          c.productos += 1;
          c.unidades += x.existencia;
          c.valor += BigInt(x.valor.minor);
          porCategoria.set(x.categoria, c);
        }
        const cuenta = (e: string) => productos.filter((x) => x.estado === e).length;
        return InformeDeInventarioSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          resumen: {
            productos: productos.length,
            unidades: productos.reduce((s, x) => s + x.existencia, 0),
            valor: usd(productos.reduce((s, x) => s + BigInt(x.valor.minor), 0n)),
            agotados: cuenta("AGOTADO"),
            bajoMinimo: cuenta("BAJO_MINIMO"),
            sinInicial: cuenta("SIN_INICIAL"),
          },
          categorias: [...porCategoria.entries()].map(([categoria, c]) => ({ categoria, productos: c.productos, unidades: c.unidades, valor: usd(c.valor) })),
          productos,
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
