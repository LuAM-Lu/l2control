/**
 * Las entradas de mercancía en el servidor — B9-3, F8-06, F8-01.
 *
 * Lo que llega (una compra con su proveedor y su factura, o una reposición) entra de una vez: una
 * fila en `stock_entry` y un movimiento ENTRADA por producto, con sus unidades (bultos × unidades por
 * bulto) y lo que costaron. El costo promedio ponderado sale solo de la suma (`@l2/domain-inventory`).
 * Quién decide qué:
 *  · el dominio: qué línea vale (`entryLineProblem`) y cuánto entra (`entryLineTotals`);
 *  · la matriz: recibir es `inventario.entrada` (administración y supervisión), sin elevación: se hace
 *    con el proveedor delante; dar de alta un producto nuevo en la entrada (B9-6) es además del
 *    catálogo (`catalogo.modificar`, con elevación), como «Nuevo producto»;
 *  · este archivo: la clave (un doble clic no carga dos veces), el candado de cada producto (una venta
 *    a la vez lee el costo de después), la transacción y su asiento.
 */
import {
  EntradasSchema,
  RegistrarEntradaCommandSchema,
  problemasDe,
  type EntradaDto,
  type EntradasDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { entryLineProblem, entryLineTotals, type EntryLineProblem } from "@l2/domain-inventory";
import { money, sum } from "@l2/domain-money";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { bloquearProducto } from "./existencias.ts";
import { crearProductoEn } from "./productos.ts";

/** Cuántas entradas enseña la pantalla: las más recientes. */
export const ENTRADAS_RECIENTES = 60;

export interface CasosEntradas {
  /** Las entradas recientes de la sucursal, de la más nueva a la más vieja. */
  leer(ctx: Contexto): Promise<Resultado<EntradasDto>>;
  /** Registra una entrada (`RegistrarEntradaCommandSchema`). Devuelve cómo quedó. */
  registrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EntradaDto>>;
}

const MENSAJE_LINEA: Record<EntryLineProblem, string> = {
  BULTOS: "Bultos enteros, de 1 a 10.000",
  UNIDADES_POR_BULTO: "Unidades por bulto enteras, de 1 a 1.000",
  COSTO_NEGATIVO: "El costo no puede ser negativo",
  COSTO_EXCESIVO: "Más de $ 100.000,00 en una línea: ¿se tecleó en bolívares?",
};

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});

export function casosEntradas(base: Base): CasosEntradas {
  return {
    async leer(ctx) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EntradasDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "inventario.entrada");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const filas = await tx.stockEntry.findMany({ where: { branchId: ctx.branchId }, orderBy: { receivedAt: "desc" }, take: ENTRADAS_RECIENTES });
        const entradas: EntradaDto[] = [];
        for (const f of filas) entradas.push(await entradaDe(tx, f.id));
        return EntradasSchema.parse({ entradas });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async registrar(ctx, entrada, ahora = Date.now()) {
      const v = RegistrarEntradaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La entrada no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      for (const [i, l] of cmd.lineas.entries()) {
        const problema = entryLineProblem({ packs: l.bultos, packSize: l.unidadesPorBulto, packCostMinor: BigInt(l.costoBultoMinor) });
        if (problema) {
          const campo = problema === "BULTOS" ? "bultos" : problema === "UNIDADES_POR_BULTO" ? "unidadesPorBulto" : "costoBultoMinor";
          return invalido("La entrada no se registró: hay datos que corregir.", ["lineas", i, campo], MENSAJE_LINEA[problema]);
        }
      }

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<EntradaDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "inventario.entrada");
          if (rechazo) return rechazo;
          // Un doble clic devuelve la entrada que ya se registró con esta clave.
          const previa = await tx.stockEntry.findUnique({ where: { tenantId_operationKey: { tenantId: ctx.tenantId, operationKey: cmd.idempotencyKey } } });
          if (previa) {
            return previa.branchId === ctx.branchId ? entradaDe(tx, previa.id) : { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó en otra sucursal." };
          }

          // Dar de alta un producto en la entrada (B9-6) es del catálogo: lo mismo que «Nuevo producto».
          const conNuevos = cmd.lineas.some((l) => "nuevo" in l);
          if (conNuevos) {
            const delCatalogo = await exigirPermiso(tx, ctx, "catalogo.modificar");
            if (delCatalogo) return delCatalogo;
          }

          const existentes = cmd.lineas.flatMap((l) => ("productId" in l ? [l.productId] : []));
          const productos = await tx.product.findMany({ where: { id: { in: existentes } }, select: { id: true, name: true, tracksStock: true } });
          const porId = new Map(productos.map((p) => [p.id, { name: p.name }]));
          for (const [i, l] of cmd.lineas.entries()) {
            if (!("productId" in l)) continue;
            const p = productos.find((x) => x.id === l.productId);
            if (!p) return invalido("Ese producto no existe en este local.", ["lineas", i, "productId"], "Producto desconocido");
            if (!p.tracksStock) {
              return invalido(`${p.name} no se cuenta: es un preparado o un servicio. Cámbiale el tipo en Productos si se quiere contar.`, ["lineas", i, "productId"], "SIN_CONTROL_DE_STOCK");
            }
          }

          const quien = await nombreDe(tx, ctx);
          // Los nuevos nacen a la venta, con su precio y su SKU, en esta misma transacción: si algo de la
          // entrada no vale, tampoco quedan creados.
          const ids: string[] = [];
          for (const [i, l] of cmd.lineas.entries()) {
            if ("productId" in l) {
              ids.push(l.productId);
              continue;
            }
            const creado = await crearProductoEn(tx, ctx, { ...l.nuevo, tipo: "PRODUCTO" }, quien.nombre, ahora, ["lineas", i, "nuevo"]);
            if ("ok" in creado) return creado;
            await auditar(tx, ctx, creado.asiento);
            ids.push(creado.fila.id);
            porId.set(creado.fila.id, { name: creado.fila.name });
          }

          // Los candados en orden de producto, como la venta: nadie lee el costo a medias.
          for (const id of [...ids].sort()) await bloquearProducto(tx, ctx.branchId, id);

          const fila = await tx.stockEntry.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              kind: cmd.tipo,
              supplier: cmd.proveedor ?? null,
              invoice: cmd.factura ?? null,
              operationKey: cmd.idempotencyKey,
              receivedAt: new Date(ahora),
              createdBy: ctx.quien?.userId ?? null,
              createdByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            },
          });
          const lineas = cmd.lineas.map((l, i) => {
            const t = entryLineTotals({ packs: l.bultos, packSize: l.unidadesPorBulto, packCostMinor: BigInt(l.costoBultoMinor) });
            return { productId: ids[i]!, bultos: l.bultos, unidadesPorBulto: l.unidadesPorBulto, unidades: t.units, valorMinor: t.valueMinor };
          });
          await tx.stockMovement.createMany({
            data: lineas.map((l) => ({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              productId: l.productId,
              quantity: l.unidades,
              kind: "ENTRADA",
              valueMinor: l.valorMinor,
              entryId: fila.id,
              packs: l.bultos,
              packSize: l.unidadesPorBulto,
              at: new Date(ahora),
              createdBy: ctx.quien?.userId ?? null,
              createdByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            })),
          });
          await auditar(tx, ctx, {
            action: "inventario.entrada",
            entityType: "stock_entry",
            entityId: fila.id,
            after: {
              tipo: cmd.tipo,
              proveedor: cmd.proveedor ?? null,
              factura: cmd.factura ?? null,
              lineas: lineas.map((l) => ({
                producto: porId.get(l.productId)!.name,
                bultos: l.bultos,
                unidadesPorBulto: l.unidadesPorBulto,
                unidades: l.unidades,
                costo: { minor: String(l.valorMinor), currency: "USD" },
              })),
            },
          });
          return entradaDe(tx, fila.id);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "inventario.entrada", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos envíos a la vez con la misma clave: la base deja uno, y el segundo devuelve ese.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },
  };
}

/** Una entrada con sus líneas, como la lee la pantalla. Dentro de la transacción, consulta a consulta. */
async function entradaDe(tx: Transaccion, id: string): Promise<EntradaDto> {
  const e = await tx.stockEntry.findUniqueOrThrow({ where: { id } });
  const movs = await tx.stockMovement.findMany({ where: { entryId: id }, orderBy: { productId: "asc" } });
  const nombres = new Map((await tx.product.findMany({ where: { id: { in: movs.map((m) => m.productId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const total = sum(movs.map((m) => money(m.valueMinor, "USD")), "USD");
  return {
    id: e.id,
    tipo: e.kind as EntradaDto["tipo"],
    proveedor: e.supplier,
    factura: e.invoice,
    recibidaEn: e.receivedAt.toISOString(),
    recibidaPor: e.createdByName,
    lineas: movs.map((m) => ({
      productId: m.productId,
      nombre: nombres.get(m.productId) ?? "Producto",
      bultos: m.packs!,
      unidadesPorBulto: m.packSize!,
      unidades: m.quantity,
      costo: { minor: String(m.valueMinor), currency: "USD" },
    })),
    total: { minor: String(total.amount), currency: "USD" },
  };
}
