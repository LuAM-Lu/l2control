/**
 * Las entradas de mercancía en el servidor — B9-3, F8-06, F8-01.
 *
 * Lo que llega (una compra con su proveedor y su factura, una reposición o el inventario inicial del
 * local, T-10) entra de una vez: una fila en `stock_entry` y un movimiento ENTRADA por producto, con sus
 * unidades (bultos × unidades por bulto; las sueltas son bultos de 1) y lo que costaron, tecleado por
 * unidad, por bulto o en total (M-24). El costo promedio ponderado sale solo de la suma
 * (`@l2/domain-inventory`).
 * Quién decide qué:
 *  · el dominio: qué línea vale (`entryLineProblem`) y cuánto entra (`entryLineTotals`);
 *  · la matriz: recibir es `inventario.entrada` (administración y supervisión), sin elevación: se hace
 *    con el proveedor delante; dar de alta un producto nuevo en la entrada (B9-6) es además del
 *    catálogo (`catalogo.modificar`, con elevación), como «Nuevo producto»;
 *  · este archivo: la clave (un doble clic no carga dos veces), el candado de cada producto (una venta
 *    a la vez lee el costo de después), la transacción y su asiento.
 */
import {
  AnularEntradaDeMercanciaCommandSchema,
  EntradasSchema,
  RegistrarEntradaCommandSchema,
  problemasDe,
  type CostoPor,
  type EntradaDto,
  type EntradasDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { entryLineProblem, entryLineTotals, type EntryCostBasis, type EntryLine, type EntryLineProblem } from "@l2/domain-inventory";
import { money, sum } from "@l2/domain-money";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { arranquesDe, asentarArranques, bloquearProducto } from "./existencias.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { Deshacer, crearProductoEn } from "./productos.ts";

/** Cuántas entradas enseña la pantalla: las más recientes. */
export const ENTRADAS_RECIENTES = 60;

export interface CasosEntradas {
  /** Las entradas recientes de la sucursal, de la más nueva a la más vieja. */
  leer(ctx: Contexto): Promise<Resultado<EntradasDto>>;
  /** Registra una entrada (`RegistrarEntradaCommandSchema`). Devuelve cómo quedó. */
  registrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EntradaDto>>;
  /**
   * Anula una entrada mal cargada (`AnularEntradaDeMercanciaCommandSchema`, B9-12): cada línea sale a su costo de esa entrada. Si
   * de algún producto ya se vendió o se sacó algo desde entonces, se niega y dice cuánto (eso se corrige con un conteo).
   * `autorizacion`: el PIN de administración.
   */
  anular(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<EntradaDto>>;
}

const CON_PIN = { confirmarConPin: true } as const;

const MENSAJE_LINEA: Record<EntryLineProblem, string> = {
  BULTOS: "Bultos enteros, de 1 a 10.000",
  UNIDADES_POR_BULTO: "Unidades por bulto enteras, de 1 a 1.000",
  COSTO_NEGATIVO: "El costo no puede ser negativo",
  COSTO_EXCESIVO: "Más de $ 100.000,00 en una línea: ¿se tecleó en bolívares?",
};

const BASE_DEL_COSTO: Readonly<Record<CostoPor, EntryCostBasis>> = { UNIDAD: "UNIT", BULTO: "PACK", TOTAL: "LINE" };

/** La línea del mando, como la entiende el dominio. */
const lineaDelDominio = (l: { bultos: number; unidadesPorBulto: number; costo: { por: CostoPor; minor: string } }): EntryLine => ({
  packs: l.bultos,
  packSize: l.unidadesPorBulto,
  cost: { per: BASE_DEL_COSTO[l.costo.por], minor: BigInt(l.costo.minor) },
});

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
        const problema = entryLineProblem(lineaDelDominio(l));
        if (problema) {
          const campo = problema === "BULTOS" ? "bultos" : problema === "UNIDADES_POR_BULTO" ? "unidadesPorBulto" : "costo";
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
            // Dar de alta lo que llega por primera vez es del inventario (T-13): se puede dar a supervisión.
            const delCatalogo = await exigirPermiso(tx, ctx, "inventario.catalogo");
            if (delCatalogo) return delCatalogo;
          }

          const existentes = cmd.lineas.flatMap((l) => ("productId" in l ? [l.productId] : []));
          const enCero = cmd.enCero ?? [];
          const productos = await tx.product.findMany({ where: { id: { in: [...existentes, ...enCero] } }, select: { id: true, name: true, tracksStock: true } });
          const porId = new Map(productos.map((p) => [p.id, { name: p.name }]));
          const sinContar = (p: { name: string }) =>
            `${p.name} no se cuenta: es un preparado o un servicio. Cámbiale el tipo en Productos si se quiere contar.`;
          for (const [i, l] of cmd.lineas.entries()) {
            if (!("productId" in l)) continue;
            const p = productos.find((x) => x.id === l.productId);
            if (!p) return invalido("Ese producto no existe en este local.", ["lineas", i, "productId"], "Producto desconocido");
            if (!p.tracksStock) return invalido(sinContar(p), ["lineas", i, "productId"], "SIN_CONTROL_DE_STOCK");
          }
          for (const [i, id] of enCero.entries()) {
            const p = productos.find((x) => x.id === id);
            if (!p) return invalido("Ese producto no existe en este local.", ["enCero", i], "Producto desconocido");
            if (!p.tracksStock) return invalido(sinContar(p), ["enCero", i], "SIN_CONTROL_DE_STOCK");
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
            // Las líneas anteriores pueden haber creado ya sus productos: nada de la entrada queda.
            if ("ok" in creado) throw new Deshacer(creado);
            await auditar(tx, ctx, creado.asiento);
            ids.push(creado.fila.id);
            porId.set(creado.fila.id, { name: creado.fila.name });
          }

          // Los candados en orden de producto, como la venta: nadie lee el costo a medias.
          for (const id of [...ids, ...enCero].sort()) await bloquearProducto(tx, ctx.branchId, id);

          // El inventario inicial es de lo que todavía no lo tiene (B9-7): lo que ya arrancó se corrige con un
          // conteo, que compara con lo que dice el sistema. Se mira con los candados tomados.
          const arrancados = await arranquesDe(tx, ctx.branchId, [...existentes, ...enCero]);
          if (cmd.tipo === "INICIAL") {
            const ya = [
              ...cmd.lineas.flatMap((l, i) => ("productId" in l && arrancados.has(l.productId) ? [{ id: l.productId, path: ["lineas", i, "productId"] }] : [])),
              ...enCero.flatMap((id, i) => (arrancados.has(id) ? [{ id, path: ["enCero", i] }] : [])),
            ];
            if (ya.length > 0) throw new Deshacer({
              ok: false,
              motivo: "INVALIDO",
              mensaje: `${ya.length === 1 ? `«${porId.get(ya[0]!.id)!.name}» ya tiene` : `${ya.length} productos ya tienen`} inventario inicial: lo que falte o sobre se corrige con un conteo.`,
              problemas: ya.map((x) => ({ path: x.path, message: "YA_TIENE_INVENTARIO_INICIAL" })),
            });
          }

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
            const t = entryLineTotals(lineaDelDominio(l));
            return { productId: ids[i]!, bultos: l.bultos, unidadesPorBulto: l.unidadesPorBulto, unidades: t.units, valorMinor: t.valueMinor, costo: l.costo };
          });
          // Lo que no había arrancado arranca aquí (B9-7): con lo que entra, o en cero lo que se contó y no hay.
          await asentarArranques(
            tx,
            ctx,
            [...lineas.map((l) => ({ productId: l.productId, quantity: l.unidades })), ...enCero.map((productId) => ({ productId, quantity: 0 }))],
            { entryId: fila.id, ahora, quien: quien.nombre },
          );
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
                // Cómo se tecleó: por unidad, por bulto o el total de la línea (M-24).
                tecleado: { por: l.costo.por, minor: l.costo.minor },
              })),
              ...(enCero.length > 0 ? { enCero: enCero.map((id) => porId.get(id)!.name) } : {}),
            },
          });
          return entradaDe(tx, fila.id);
        });

      try {
        const r = await intentar().catch((e: unknown) => {
          if (e instanceof Deshacer) return e.rechazo;
          throw e;
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "inventario.entrada", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos envíos a la vez con la misma clave: la base deja uno, y el segundo devuelve ese.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar().catch((x: unknown) => {
          if (x instanceof Deshacer) return x.rechazo;
          throw x;
        });
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async anular(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AnularEntradaDeMercanciaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La entrada no se anuló: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EntradaDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "inventario.ajustar");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const e = await tx.stockEntry.findUnique({ where: { id: cmd.entryId } });
        if (!e || e.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa entrada no está en esta sucursal." };
        if (await tx.stockEntryVoid.findFirst({ where: { entryId: e.id } })) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa entrada ya está anulada." };
        const movs = await tx.stockMovement.findMany({ where: { entryId: e.id }, orderBy: { productId: "asc" } });
        for (const m of movs) await bloquearProducto(tx, ctx.branchId, m.productId);
        // Si de algún producto ya se vendió o se sacó algo desde esta entrada, no se sabe qué parte era suya: se niega.
        const problemas: { path: (string | number)[]; message: string }[] = [];
        const nombres = new Map((await tx.product.findMany({ where: { id: { in: movs.map((m) => m.productId) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
        let primero: string | null = null;
        for (const m of movs) {
          const salio = await tx.stockMovement.aggregate({ where: { branchId: ctx.branchId, productId: m.productId, quantity: { lt: 0 }, at: { gte: e.receivedAt } }, _sum: { quantity: true } });
          const n = -(salio._sum.quantity ?? 0);
          if (n > 0) {
            problemas.push({ path: ["lineas", m.productId], message: `YA_SALIO: ${n}` });
            primero ??= `De ${nombres.get(m.productId) ?? "un producto"} ya ${n === 1 ? "salió 1" : `salieron ${n}`} desde esta entrada`;
          }
        }
        if (primero) {
          return { ok: false, motivo: "CONFLICTO", mensaje: `${primero}: no se sabe qué parte era suya. Corrígelo con un conteo.`, problemas };
        }
        // La autorización se comprueba y se registra ANTES de mover nada (§7.3).
        const permiso = await exigirPermisoOAutorizacion(tx, ctx, "inventario.ajustar", autorizacion, ahora, CON_PIN);
        if (!permiso.ok) return permiso;
        const quien = await nombreDe(tx, ctx);
        const autorizador = permiso.autorizadoPor ? await tx.staffUser.findUnique({ where: { id: permiso.autorizadoPor }, select: { fullName: true } }) : null;
        const anulacion = await tx.stockEntryVoid.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            entryId: e.id,
            reason: cmd.motivo,
            at: new Date(ahora),
            createdBy: ctx.quien?.userId ?? null,
            createdByName: quien.nombre,
            deviceId: ctx.quien?.deviceId ?? null,
            authorizedBy: permiso.autorizadoPor ?? null,
            authorizedByName: autorizador?.fullName ?? null,
          },
        });
        // Cada línea sale a su costo de esa entrada: el costo promedio se recalcula solo (la suma de los movimientos).
        if (movs.length > 0) {
          await tx.stockMovement.createMany({
            data: movs.map((m) => ({
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              productId: m.productId,
              quantity: -m.quantity,
              kind: "ANULACION",
              valueMinor: -m.valueMinor,
              entryVoidId: anulacion.id,
              at: new Date(ahora),
              createdBy: ctx.quien?.userId ?? null,
              createdByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            })),
          });
        }
        const total = movs.reduce((t, m) => t + m.valueMinor, 0n);
        await auditar(tx, ctx, {
          action: "inventario.anular_entrada",
          entityType: "stock_entry",
          entityId: e.id,
          ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
          reason: cmd.motivo,
          before: { tipo: e.kind, lineas: movs.length, unidades: movs.reduce((t, m) => t + m.quantity, 0), total: { minor: String(total), currency: "USD" } },
          after: { anulada: true },
        });
        return entradaDe(tx, e.id);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "inventario.anular_entrada", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}

/** Una entrada con sus líneas, como la lee la pantalla. Dentro de la transacción, consulta a consulta. */
async function entradaDe(tx: Transaccion, id: string): Promise<EntradaDto> {
  const e = await tx.stockEntry.findUniqueOrThrow({ where: { id } });
  const anulacion = await tx.stockEntryVoid.findFirst({ where: { entryId: id } });
  const movs = await tx.stockMovement.findMany({ where: { entryId: id }, orderBy: { productId: "asc" } });
  const nombres = new Map((await tx.product.findMany({ where: { id: { in: movs.map((m) => m.productId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const total = sum(movs.map((m) => money(m.valueMinor, "USD")), "USD");
  // Lo que el inventario inicial contó en cero no movió nada: lo dice su arranque (B9-7).
  const ceros = await tx.stockStart.findMany({ where: { entryId: id, quantity: 0 }, orderBy: { productId: "asc" }, select: { productId: true } });
  const nombresCero = new Map(
    (await tx.product.findMany({ where: { id: { in: ceros.map((c) => c.productId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
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
    enCero: ceros.map((c) => ({ productId: c.productId, nombre: nombresCero.get(c.productId) ?? "Producto" })),
    anulada: anulacion ? { por: anulacion.createdByName, autorizo: anulacion.authorizedByName, motivo: anulacion.reason, en: anulacion.at.toISOString() } : null,
  };
}
