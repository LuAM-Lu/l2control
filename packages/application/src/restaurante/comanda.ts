/**
 * El papel de la cocina y de la barra — B6-2, B6-10; y la comanda de lo que vende la caja — B6-16 (M-37).
 *
 * `encolarComanda` pone el papel de un área de un pedido en la cola de la impresora de esa área: lo usan el pedido del
 * mesero (`pedidos.ts`) y la venta de la caja. La de la caja se prepara antes de escribir nada (qué se prepara y si
 * está su impresora: un rechazo no deshace lo ya escrito) y se asienta con el cobro o al dejar la venta pendiente.
 * Vive aparte para que la caja (`caja/cuentas.ts`) la use sin depender de los pedidos, que dependen de ella.
 */
import { randomUUID } from "node:crypto";
import type { AccountLineDto, FamilyAccountDto, Rechazo } from "@l2/contracts";
import { partesDelPedido, type AreaDeComanda, type AreaDeProducto } from "@l2/domain-orders";
import type { Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { nombreDe } from "../identidad/actor.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeComanda, rotuloDePedido } from "../impresion/plantillas.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { NOMBRE_DE_AREA, areaSinImpresora, areasDeProductos, oficioDe, sinImpresoraPara, type LineaGuardada } from "./comandas.ts";

type FilaPedido = Awaited<ReturnType<Transaccion["kitchenOrder"]["findFirstOrThrow"]>>;

const comanda = (n: number) => `#${String(n).padStart(4, "0")}`;

/**
 * La comanda de un área de un pedido (B6-10) en la cola de la impresora de esa área; `area: null`, la de un pedido de
 * antes, con todo, en la de cocina. `copia`, si es una reimpresión.
 */
export async function encolarComanda(tx: Transaccion, ctx: Contexto, fila: FilaPedido, area: AreaDeComanda | null, ahora: number, copia: boolean) {
  const local = await ajustesDe(tx, ctx.branchId);
  const partes = partesDelPedido(fila.items as unknown as LineaGuardada[]);
  const i = partes.findIndex((p) => p.area === area);
  const parte = partes[i];
  if (!parte) throw new Error(`El pedido ${fila.id} no tiene papel de ${area ?? "todo"}`);
  return encolarEn(
    tx,
    ctx,
    {
      tipo: "COMANDA",
      para: oficioDe(area),
      ...(area ? { area } : {}),
      titulo: `Comanda ${comanda(fila.number)}${area ? ` · ${NOMBRE_DE_AREA[area]}` : ""} · ${rotuloDePedido(fila)}`,
      copia,
      orderId: fila.id,
      documento: documentoDeComanda(
        {
          numero: fila.number,
          mesa: fila.tableId === null ? null : fila.tableLabel,
          enCaja: fila.tableId === null && fila.tableLabel === EN_CAJA,
          nombreCuenta: fila.accountLabel,
          enviadoEn: fila.createdAt.getTime(),
          enviadoPor: fila.createdByName,
          lineas: parte.lineas,
          area,
          parte: { n: i + 1, de: partes.length },
        },
        local,
        copia,
      ),
    },
    ahora,
  );
}

/* ───────────────────────────────── la comanda de la venta directa (B6-16, M-37) */

/** Lo que de una cuenta todavía no salió en una comanda y se prepara (cocina o barra), con su área. */
export type ComandaPorSalir = Readonly<{ lineas: readonly AccountLineDto[]; area: ReadonlyMap<string, AreaDeProducto> }>;

/**
 * Prepara la comanda de lo que la caja vende (B6-16): las líneas de un producto de cocina o de barra que todavía no
 * salieron en una comanda. Solo mira y comprueba, sin escribir nada: sin la impresora de un área, se niega antes de
 * asentar el cobro (un rechazo no deshace lo ya escrito). `null` si no hay nada que preparar.
 */
export async function prepararComandaDeCaja(tx: Transaccion, ctx: Contexto, cuenta: FamilyAccountDto, queNoPaso: string): Promise<ComandaPorSalir | Rechazo | null> {
  if (cuenta.kind === "EVENTO") return null;
  const sinSalir = cuenta.lines.filter((l) => l.productId !== undefined && l.orderId === undefined && !l.paid && !l.movedTo && !l.anulacion && !l.partida && !l.parteDe);
  if (sinSalir.length === 0) return null;
  const area = await areasDeProductos(tx, sinSalir.map((l) => l.productId!));
  const lineas = sinSalir.filter((l) => {
    const a = area.get(l.productId!);
    return a === "COCINA" || a === "BARRA";
  });
  if (lineas.length === 0) return null;
  const falta = await areaSinImpresora(tx, ctx.branchId, partesDelPedido(lineas.map((l) => ({ area: area.get(l.productId!) }))).map((p) => p.area));
  if (falta) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: sinImpresoraPara(falta, queNoPaso) };
  return { lineas, area };
}

/**
 * Asienta la comanda preparada (B6-16): el pedido con su número que se canta, «CAJA» en grande y a quién va, cada
 * producto con su cantidad y su nota; un papel por área en su impresora, como el del mesero. Devuelve la cuenta con
 * su pedido puesto en esas líneas, para guardarla en la misma versión: así no vuelven a salir.
 */
export async function asentarComandaDeCaja(
  tx: Transaccion,
  ctx: Contexto,
  cuenta: FamilyAccountDto,
  porSalir: ComandaPorSalir,
  aQuien: string,
  ahora: number,
): Promise<FamilyAccountDto> {
  const grupos = new Map<string, LineaGuardada>();
  for (const l of porSalir.lineas) {
    const clave = `${l.productId}|${l.nota ?? ""}`;
    const g = grupos.get(clave);
    grupos.set(clave, g ? { ...g, cantidad: g.cantidad + 1 } : { productId: l.productId!, nombre: l.concept, cantidad: 1, nota: l.nota?.trim() ? l.nota.trim() : null, area: porSalir.area.get(l.productId!)! });
  }
  const lineas = [...grupos.values()];
  const pedidoId = randomUUID();
  const quien = await nombreDe(tx, ctx);
  // El número que se canta en la cocina: el mismo correlativo de los pedidos del mesero (D13).
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`comanda:${ctx.branchId}`}, 0))::text AS candado`;
  const max = await tx.kitchenOrder.aggregate({ where: { branchId: ctx.branchId }, _max: { number: true } });
  const etiqueta = aQuien.trim().length >= 2 ? aQuien.trim().slice(0, 40) : "Venta directa";
  const fila = await tx.kitchenOrder.create({
    data: {
      id: pedidoId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      accountId: cuenta.id,
      number: (max._max.number ?? 0) + 1,
      tableId: null,
      tableLabel: EN_CAJA,
      accountLabel: etiqueta,
      items: lineas,
      createdAt: new Date(ahora),
      createdBy: ctx.quien?.userId ?? null,
      createdByName: quien.nombre,
      deviceId: ctx.quien?.deviceId ?? null,
    },
  });
  await auditar(tx, ctx, {
    action: "pedido.enviar",
    entityType: "kitchen_order",
    entityId: fila.id,
    after: {
      comanda: fila.number,
      mesa: EN_CAJA,
      nombreCuenta: etiqueta,
      cuenta: { id: cuenta.id, orden: cuenta.orderNumber ?? null, version: cuenta.version ?? null },
      lineas: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, area: l.area })),
    },
  });
  for (const parte of partesDelPedido(lineas)) {
    const trabajo = await encolarComanda(tx, ctx, fila, parte.area, ahora, false);
    // Las impresoras se comprobaron al preparar: si aun así falta una, se deshace todo.
    if ("ok" in trabajo) throw new Error(`La comanda no se encoló: ${trabajo.mensaje}`);
  }
  const ids = new Set(porSalir.lineas.map((l) => l.id));
  return { ...cuenta, lines: cuenta.lines.map((l) => (ids.has(l.id) ? { ...l, orderId: pedidoId } : l)) };
}

/** El rótulo de un pedido de la caja (B6-16): sin mesa, como el de pie, pero dice «Caja». */
export const EN_CAJA = "Caja";
