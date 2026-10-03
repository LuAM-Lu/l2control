/**
 * Salidas y conteo físico en el servidor — B9-4, F8-07, §7.3.
 *
 * Lo que sale sin venderse y lo que un conteo encuentra de más o de menos. Quién decide qué:
 *  · el dominio (`@l2/domain-inventory`): qué mueve un conteo (`countMoves`), lo que no alcanza
 *    (`stockShortfalls`) y el costo de lo que sale o sobra (`costOfUnits`, `costOfSurplus`);
 *  · la matriz: es `inventario.ajustar`: administración confirma con su PIN y supervisión pide la de
 *    administración (D-AUT: nadie se autoriza a sí mismo un ajuste de inventario);
 *  · este archivo: la clave (un doble clic no ajusta dos veces), el candado de cada producto, que el
 *    conteo no ajuste a ciegas si la existencia cambió mientras se contaba, y que la autorización
 *    quede registrada ANTES de mover nada, con su asiento.
 */
import {
  AjustesInventarioSchema,
  RegistrarConteoCommandSchema,
  RegistrarSalidaCommandSchema,
  problemasDe,
  type AjusteInventarioDto,
  type AjustesInventarioDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { costOfSurplus, costOfUnits, countMoves, stockShortfalls, type StockMove, type StockValue } from "@l2/domain-inventory";
import { money, sum } from "@l2/domain-money";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { autorizadoresPara, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { bloquearProducto, existenciasDe } from "./existencias.ts";

/** Cuántas salidas y conteos enseña la pantalla: los más recientes. */
export const AJUSTES_RECIENTES = 60;

export interface CasosSalidas {
  /** Las salidas y los conteos recientes de la sucursal. */
  leer(ctx: Contexto): Promise<Resultado<AjustesInventarioDto>>;
  /** Saca con motivo (`RegistrarSalidaCommandSchema`); `autorizacion`, el PIN de quien autoriza. */
  salida(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<AjusteInventarioDto>>;
  /** Deja la existencia igual a lo contado (`RegistrarConteoCommandSchema`), con su autorización. */
  conteo(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<AjusteInventarioDto>>;
  /** Quiénes pueden autorizar a quien opera un ajuste de inventario. */
  autorizadores(ctx: Contexto): Promise<{ id: string; nombre: string; rol: string }[]>;
}

/** Mover inventario sin venderlo no se hace con la sesión que alguien dejó abierta: siempre con PIN. */
const CON_PIN = { confirmarConPin: true } as const;

const invalido = (mensaje: string, problemas: { path: (string | number)[]; message: string }[]): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas });
const quedan = (n: number) => (n === 0 ? "no queda ninguno" : n === 1 ? "queda 1" : `quedan ${n}`);

type Producto = { id: string; name: string; tracksStock: boolean };

export function casosSalidas(base: Base): CasosSalidas {
  /** Los productos de las líneas: que existan y lleven existencia. */
  async function productosDe(tx: Transaccion, ids: readonly string[]): Promise<Map<string, Producto> | Rechazo> {
    const filas = await tx.product.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, tracksStock: true } });
    const porId = new Map(filas.map((p) => [p.id, p]));
    for (const [i, id] of ids.entries()) {
      const p = porId.get(id);
      if (!p) return invalido("Ese producto no existe en este local.", [{ path: ["lineas", i, "productId"], message: "Producto desconocido" }]);
      if (!p.tracksStock) return invalido(`${p.name} no lleva existencia: no hay nada que sacar ni que contar.`, [{ path: ["lineas", i, "productId"], message: "SIN_CONTROL_DE_STOCK" }]);
    }
    return porId;
  }

  /** Corre `intentar` y traduce lo de siempre: el rechazo por permiso, auditado; el doble envío, el mismo. */
  async function conReintento(ctx: Contexto, accion: "inventario.salida" | "inventario.conteo", intentar: () => Promise<AjusteInventarioDto | Rechazo>): Promise<Resultado<AjusteInventarioDto>> {
    try {
      const r = await intentar();
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    } catch (e) {
      // Dos envíos a la vez con la misma clave: la base deja uno, y el segundo devuelve ese.
      if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
      const r = await intentar();
      return "ok" in r ? r : { ok: true, valor: r };
    }
  }

  /** Un doble clic devuelve lo ya registrado con esa clave (sin volver a pedir el PIN). */
  async function previaDe(tx: Transaccion, ctx: Contexto, clave: string, kind: "SALIDA" | "CONTEO"): Promise<AjusteInventarioDto | Rechazo | null> {
    const previa = await tx.stockAdjustment.findUnique({ where: { tenantId_operationKey: { tenantId: ctx.tenantId, operationKey: clave } } });
    if (!previa) return null;
    if (previa.branchId !== ctx.branchId || previa.kind !== kind) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otra operación." };
    return ajusteDe(tx, previa.id);
  }

  return {
    async leer(ctx) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<AjustesInventarioDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "inventario.ajustar");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const filas = await tx.stockAdjustment.findMany({ where: { branchId: ctx.branchId }, orderBy: { at: "desc" }, take: AJUSTES_RECIENTES, select: { id: true } });
        const ajustes: AjusteInventarioDto[] = [];
        for (const f of filas) ajustes.push(await ajusteDe(tx, f.id));
        return AjustesInventarioSchema.parse({ ajustes });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async salida(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = RegistrarSalidaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La salida no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return conReintento(ctx, "inventario.salida", () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<AjusteInventarioDto | Rechazo> => {
          const p = await permisoEn(tx, ctx, "inventario.ajustar");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          const previa = await previaDe(tx, ctx, cmd.idempotencyKey, "SALIDA");
          if (previa) return previa;

          const ids = cmd.lineas.map((l) => l.productId);
          const productos = await productosDe(tx, ids);
          if (!(productos instanceof Map)) return productos;
          for (const id of [...ids].sort()) await bloquearProducto(tx, ctx.branchId, id);
          const hay = await existenciasDe(tx, ctx.branchId, ids);
          const moves = cmd.lineas.map((l) => ({ productId: l.productId, quantity: -l.cantidad }));
          const faltan = stockShortfalls(moves, new Map([...hay].map(([id, x]) => [id, x.quantity])));
          if (faltan.length > 0) {
            const nombre = (id: string) => productos.get(id)!.name;
            return invalido(
              `No sale más de lo que hay: de ${nombre(faltan[0]!.productId)} ${quedan(faltan[0]!.available)}.`,
              faltan.map((f) => ({ path: ["lineas", ids.indexOf(f.productId), "cantidad"], message: `Solo ${quedan(f.available)}` })),
            );
          }

          // La autorización se comprueba y se registra ANTES de mover nada (§7.3).
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "inventario.ajustar", autorizacion, ahora, CON_PIN);
          if (!permiso.ok) return permiso;
          const vacio: StockValue = { quantity: 0, valueMinor: 0n };
          return asentarAjuste(tx, ctx, {
            kind: "SALIDA",
            reason: cmd.motivo,
            note: cmd.detalle ?? null,
            content: cmd.lineas,
            operationKey: cmd.idempotencyKey,
            ahora,
            autorizadoPor: permiso.autorizadoPor!,
            movimientos: moves.map((m) => ({ ...m, valueMinor: -costOfUnits(hay.get(m.productId) ?? vacio, -m.quantity) })),
            resumen: { motivo: cmd.motivo },
          });
        }),
      );
    },

    async conteo(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = RegistrarConteoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El conteo no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return conReintento(ctx, "inventario.conteo", () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<AjusteInventarioDto | Rechazo> => {
          const p = await permisoEn(tx, ctx, "inventario.ajustar");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          const previa = await previaDe(tx, ctx, cmd.idempotencyKey, "CONTEO");
          if (previa) return previa;

          const ids = cmd.lineas.map((l) => l.productId);
          const productos = await productosDe(tx, ids);
          if (!(productos instanceof Map)) return productos;
          for (const id of [...ids].sort()) await bloquearProducto(tx, ctx.branchId, id);
          const hay = await existenciasDe(tx, ctx.branchId, ids);
          // No se ajusta a ciegas: si se vendió (o entró) algo mientras se contaba, lo contado ya no
          // se compara con lo que había. Se vuelve a mirar.
          const cambiadas = cmd.lineas.flatMap((l, i) => {
            const ahoraHay = hay.get(l.productId)?.quantity ?? 0;
            return ahoraHay === l.esperado ? [] : [{ i, l, ahoraHay }];
          });
          if (cambiadas.length > 0) {
            const nombre = productos.get(cambiadas[0]!.l.productId)!.name;
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: `La existencia de ${nombre} cambió mientras contabas: ahora el sistema dice ${cambiadas[0]!.ahoraHay}. Revisa ese conteo y vuelve a registrarlo.`,
              problemas: cambiadas.map((c) => ({ path: ["lineas", c.i, "esperado"], message: `CAMBIO: ahora ${c.ahoraHay}` })),
            };
          }

          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "inventario.ajustar", autorizacion, ahora, CON_PIN);
          if (!permiso.ok) return permiso;

          const moves = countMoves(cmd.lineas.map((l) => ({ productId: l.productId, expected: l.esperado, counted: l.contado })));
          const vacio: StockValue = { quantity: 0, valueMinor: 0n };
          const movimientos: (StockMove & { valueMinor: bigint })[] = [];
          for (const m of moves) {
            const stock = hay.get(m.productId) ?? vacio;
            if (m.quantity < 0) {
              movimientos.push({ ...m, valueMinor: -costOfUnits(stock, -m.quantity) });
              continue;
            }
            // Lo que sobra entra al costo promedio; sin existencia, al de la última entrada.
            const ultima = await tx.stockMovement.findFirst({ where: { branchId: ctx.branchId, productId: m.productId, kind: "ENTRADA" }, orderBy: { at: "desc" }, select: { quantity: true, valueMinor: true } });
            movimientos.push({ ...m, valueMinor: costOfSurplus(stock, ultima ? { quantity: ultima.quantity, valueMinor: ultima.valueMinor } : null, m.quantity) });
          }
          return asentarAjuste(tx, ctx, {
            kind: "CONTEO",
            reason: null,
            note: cmd.detalle ?? null,
            content: cmd.lineas,
            operationKey: cmd.idempotencyKey,
            ahora,
            autorizadoPor: permiso.autorizadoPor!,
            movimientos,
            resumen: { contados: cmd.lineas.length, conDiferencia: moves.length },
          });
        }),
      );
    },

    async autorizadores(ctx) {
      return base.conTenant(ctx.tenantId, (tx) => autorizadoresPara(tx, ctx, "inventario.ajustar"));
    },
  };
}

/** Una salida o un conteo con sus líneas, como los lee la pantalla. Consulta a consulta. */
/**
 * Escribe la salida o el conteo con sus movimientos y su asiento. La autorización ya pasó. La usa también
 * la anulación de un plato preparado (B6-6), que sale como merma con la autorización de la anulación.
 */
export async function asentarAjuste(
  tx: Transaccion,
  ctx: Contexto,
  a: Readonly<{
    kind: "SALIDA" | "CONTEO";
    reason: string | null;
    note: string | null;
    content: unknown[];
    operationKey: string;
    ahora: number;
    autorizadoPor: string;
    movimientos: readonly (StockMove & { valueMinor: bigint })[];
    resumen: Record<string, unknown>;
  }>,
): Promise<AjusteInventarioDto> {
  const quien = await nombreDe(tx, ctx);
  const autorizador = await tx.staffUser.findUniqueOrThrow({ where: { id: a.autorizadoPor }, select: { fullName: true } });
  const fila = await tx.stockAdjustment.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      kind: a.kind,
      reason: a.reason,
      note: a.note,
      content: a.content as never,
      operationKey: a.operationKey,
      at: new Date(a.ahora),
      createdBy: ctx.quien?.userId ?? null,
      createdByName: quien.nombre,
      deviceId: ctx.quien?.deviceId ?? null,
      authorizedBy: a.autorizadoPor,
      authorizedByName: autorizador.fullName,
    },
  });
  if (a.movimientos.length > 0) {
    await tx.stockMovement.createMany({
      data: a.movimientos.map((m) => ({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        productId: m.productId,
        quantity: m.quantity,
        kind: a.kind === "SALIDA" ? "SALIDA" : "AJUSTE",
        valueMinor: m.valueMinor,
        adjustmentId: fila.id,
        at: new Date(a.ahora),
        createdBy: ctx.quien?.userId ?? null,
        createdByName: quien.nombre,
        deviceId: ctx.quien?.deviceId ?? null,
      })),
    });
  }
  await auditar(tx, ctx, {
    action: a.kind === "SALIDA" ? "inventario.salida" : "inventario.conteo",
    entityType: "stock_adjustment",
    entityId: fila.id,
    authorizedBy: a.autorizadoPor,
    ...(a.reason ? { reason: a.reason } : {}),
    after: {
      ...a.resumen,
      detalle: a.note,
      movimientos: a.movimientos.map((m) => ({ productId: m.productId, cantidad: m.quantity, valor: { minor: String(m.valueMinor), currency: "USD" } })),
    },
  });
  return ajusteDe(tx, fila.id);
}

async function ajusteDe(tx: Transaccion, id: string): Promise<AjusteInventarioDto> {
  const a = await tx.stockAdjustment.findUniqueOrThrow({ where: { id } });
  const movs = await tx.stockMovement.findMany({ where: { adjustmentId: id } });
  const declaradas = a.content as { productId: string; cantidad?: number; esperado?: number; contado?: number }[];
  const nombres = new Map(
    (await tx.product.findMany({ where: { id: { in: declaradas.map((l) => l.productId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
  const porProducto = new Map(movs.map((m) => [m.productId, m]));
  const usd = (minor: bigint) => ({ minor: String(minor), currency: "USD" as const });
  return {
    id: a.id,
    tipo: a.kind as AjusteInventarioDto["tipo"],
    motivo: a.reason as AjusteInventarioDto["motivo"],
    detalle: a.note,
    en: a.at.toISOString(),
    por: a.createdByName,
    autorizadoPor: a.authorizedByName,
    lineas: declaradas.map((l) => {
      const m = porProducto.get(l.productId);
      return {
        productId: l.productId,
        nombre: nombres.get(l.productId) ?? "Producto",
        cantidad: m?.quantity ?? 0,
        esperado: a.kind === "CONTEO" ? (l.esperado ?? null) : null,
        contado: a.kind === "CONTEO" ? (l.contado ?? null) : null,
        valor: usd(m?.valueMinor ?? 0n),
      };
    }),
    valor: usd(sum(movs.map((m) => money(m.valueMinor, "USD")), "USD").amount),
  };
}
