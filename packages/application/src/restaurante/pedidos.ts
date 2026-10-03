/**
 * Los pedidos del mesero y su comanda impresa — B6-2, ADR-022, F6-06, F6-09.
 *
 * Enviar un pedido es UNA transacción: el pedido (`kitchen_order`, solo-agregar), sus platos en la cuenta
 * de la mesa (la abre si la mesa no tiene ninguna, I-05), lo que se cuenta sale del estante (ADR-023) y la
 * comanda entra en la cola de la impresora de comandas (ADR-015). Si algo de eso no puede pasar, no pasa
 * nada: **ningún pedido existe sin su comanda** y ninguna comanda sale sin pedido.
 *
 * Quién decide qué:
 *  · el contrato: la forma del pedido; el servidor la revalida (ADR-017);
 *  · el dominio (`@l2/domain-orders`): qué entra en la cuenta (catálogo de ahora; si el precio cambió
 *    desde que la tablet lo enseñó, no se pide) y en qué quedó la comanda por sus trabajos;
 *  · este archivo: el permiso, la mesa (con el candado de las mesas, el mismo del plano), la existencia,
 *    el número de comanda y que todo vaya junto.
 *
 * La cocina no tiene pantalla (ADR-022): no hay «en fuego», «listo» ni «entregado». Lo que importa es si
 * la comanda salió en papel; si no salió, la tablet y la caja lo ven y se reimprime.
 */
import { randomUUID } from "node:crypto";
import {
  EnviarPedidoCommandSchema,
  FamilyAccountSchema,
  PedidoSchema,
  PedidosDelLocalSchema,
  ReimprimirComandaCommandSchema,
  problemasDe,
  type AccountLineDto,
  type FamilyAccountDto,
  type PedidoDto,
  type PedidoEnviadoDto,
  type PedidosDelLocalDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { estadoDeComanda, lineasDelPedido, type EstadoDeTrabajo } from "@l2/domain-orders";
import { reintentado } from "@l2/domain-printing";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { catalogoEn, crearCuentaDeMesa, guardarVersion, vigenteDe } from "../caja/cuentas.ts";
import { asentarExistencias, comprobarExistencias } from "../inventario/existencias.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeComanda } from "../impresion/plantillas.ts";
import { ajustesDe, zonaDe } from "../sucursal/ajustes.ts";
import { candadoDeMesas, mesaParaCuentaNueva, mesasOcupadasEn } from "./plano.ts";

export interface CasosPedidos {
  /** Los pedidos de hoy en la sucursal, con su comanda: del más nuevo al más viejo. */
  leer(ctx: Contexto, ahora?: number): Promise<Resultado<PedidosDelLocalDto>>;
  /**
   * Envía un pedido (`EnviarPedidoCommandSchema`): sus platos entran en la cuenta de la mesa y su comanda
   * en la cola, en una transacción. Reenviar el mismo `pedidoId` devuelve el que ya se envió.
   */
  enviar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PedidoEnviadoDto>>;
  /**
   * Vuelve a mandar la comanda de un pedido a la impresora (`ReimprimirComandaCommandSchema`). Si no
   * salió, se reintenta tal cual (la cocina nunca la vio); si se descartó, sale otra vez como original; si
   * ya salió y se perdió el papel, sale una copia marcada «reimpresión». Mientras se imprime, no.
   */
  reimprimir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PedidoDto>>;
}

/** Quién ve los pedidos: quien los toma y la caja, que cobra la mesa y ve si salió la comanda. */
const VEN_PEDIDOS: readonly Action[] = ["pedido.tomar", "documento.emitir"];

const SIN_IMPRESORA = "No hay impresora de comandas encendida: el pedido no se envió. Configúrala en Ajustes → Impresoras.";

type FilaPedido = Awaited<ReturnType<Transaccion["kitchenOrder"]["findFirstOrThrow"]>>;
type LineaGuardada = Readonly<{ productId: string; nombre: string; cantidad: number; nota: string | null }>;

const comanda = (n: number) => `#${String(n).padStart(4, "0")}`;

export function casosPedidos(base: Base): CasosPedidos {
  return {
    async leer(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PedidosDelLocalDto | Rechazo> => {
        if (!(await puedeAlguna(tx, ctx, VEN_PEDIDOS))) return rechazoDePermiso("DENEGADO");
        const zona = await zonaDe(tx, ctx.branchId);
        const desde = new Date(startOfDay(calendarDay(new Date(ahora).toISOString(), zona), zona));
        const filas = await tx.kitchenOrder.findMany({ where: { branchId: ctx.branchId, createdAt: { gte: desde } }, orderBy: { number: "desc" } });
        return PedidosDelLocalSchema.parse({ pedidos: await pedidosDe(tx, filas) });
      });
      if ("ok" in r) return r;
      return { ok: true, valor: r };
    },

    async enviar(ctx, entrada, ahora = Date.now()) {
      const v = EnviarPedidoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El pedido no se envió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<PedidoEnviadoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "pedido.enviarCocina");
          if (rechazo) return rechazo;

          // El reintento de un envío (se cortó la red) devuelve el pedido que ya entró.
          const previo = await tx.kitchenOrder.findUnique({ where: { id: cmd.pedidoId } });
          if (previo) {
            if (previo.branchId !== ctx.branchId || previo.tableId !== cmd.tableId) {
              return { ok: false, motivo: "CONFLICTO", mensaje: "Ese identificador de pedido ya existe." };
            }
            const [pedido] = await pedidosDe(tx, [previo]);
            return { pedido: pedido!, cuenta: (await vigenteDe(tx, previo.accountId))!.cuenta };
          }

          // Sin impresora de comandas no sale el papel: el pedido no se envía (fail-closed, ADR-022).
          const impresora = await tx.printer.findFirst({ where: { branchId: ctx.branchId, active: true, forOrders: true }, select: { id: true } });
          if (!impresora) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: SIN_IMPRESORA };

          // La mesa: su cuenta abierta, o una nueva si está en el salón (I-05, con el candado de las mesas).
          await candadoDeMesas(tx, ctx.branchId);
          const abierta = (await mesasOcupadasEn(tx, ctx.branchId)).get(cmd.tableId);
          const actual = abierta ? await vigenteDe(tx, abierta) : null;
          let mesa: string;
          if (actual) mesa = actual.cuenta.tableLabel ?? "?";
          else {
            const r = await mesaParaCuentaNueva(tx, ctx.branchId, cmd.tableId);
            if ("ok" in r) return { ...r, ...(r.problemas ? { problemas: r.problemas.map((p) => ({ ...p, path: ["tableId"] })) } : {}) };
            mesa = r.label;
          }

          // Lo que entra en la cuenta lo dice el catálogo de ahora, no la tablet.
          const platoEn = await catalogoEn(tx, ahora);
          const unidades = lineasDelPedido(
            cmd.lineas.map((l) => ({ ...l, precioMinor: BigInt(l.precioMinor) })),
            (id) => {
              const p = platoEn(id);
              return p ? { name: p.name, amountMinor: p.amountMinor, taxCode: p.taxCode } : null;
            },
          );
          if (!unidades.ok) {
            if (unidades.problema === "PEDIDO_VACIO") return { ok: false, motivo: "INVALIDO", mensaje: "Un pedido sin platos no se envía." };
            const path = ["lineas", unidades.indice];
            return unidades.problema === "NO_SE_VENDE"
              ? { ok: false, motivo: "INVALIDO", mensaje: "Un plato del pedido ya no está a la venta: quítalo y vuelve a enviarlo.", problemas: [{ path, message: "NO_SE_VENDE" }] }
              : {
                  ok: false,
                  motivo: "CONFLICTO",
                  mensaje: `El precio de ${unidades.nombre} cambió: revisa el pedido con la mesa antes de enviarlo.`,
                  problemas: [{ path, message: "PRECIO_DISTINTO" }],
                };
          }
          const nuevas: AccountLineDto[] = unidades.unidades.map((u) => ({
            id: randomUUID(),
            concept: u.concepto.slice(0, 80),
            kind: "RESTAURANTE",
            amount: { minor: String(u.amountMinor), currency: "USD" },
            paid: false,
            productId: u.productId,
            taxCode: u.taxCode,
            // De qué pedido sale: así se anula junto si hace falta (F6-14).
            orderId: cmd.pedidoId,
          }));
          const antes = actual?.cuenta.lines ?? null;
          const existencias = await comprobarExistencias(tx, ctx, actual ? actual.cuenta.id : null, antes, [...(antes ?? []), ...nuevas], (productId) => [
            "lineas",
            Math.max(0, cmd.lineas.findIndex((l) => l.productId === productId)),
          ]);
          if ("ok" in existencias) return existencias;

          // Todo comprobado: se escribe.
          const quien = await nombreDe(tx, ctx);
          const cuenta: FamilyAccountDto = actual
            ? FamilyAccountSchema.parse({ ...actual.cuenta, lines: [...actual.cuenta.lines, ...nuevas], version: actual.version + 1 })
            : await crearCuentaDeMesa(tx, ctx, { tableId: cmd.tableId, label: mesa, lines: nuevas, ahora, quien: quien.nombre });
          await guardarVersion(tx, ctx, cuenta, { cause: "PEDIDO", operationKey: cmd.pedidoId, ahora, quien: quien.nombre });
          await asentarExistencias(tx, ctx, existencias, { accountId: cuenta.id, version: cuenta.version!, ahora, quien: quien.nombre });

          // El número que se canta en la cocina: continuo por sucursal, como el de las cuentas (D13).
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`comanda:${ctx.branchId}`}, 0))::text AS candado`;
          const max = await tx.kitchenOrder.aggregate({ where: { branchId: ctx.branchId }, _max: { number: true } });
          const lineas: LineaGuardada[] = cmd.lineas.map((l) => {
            const p = platoEn(l.productId)!;
            return { productId: l.productId, nombre: p.name, cantidad: l.cantidad, nota: l.nota?.trim() ? l.nota.trim() : null };
          });
          const fila = await tx.kitchenOrder.create({
            data: {
              id: cmd.pedidoId,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId: cuenta.id,
              number: (max._max.number ?? 0) + 1,
              tableId: cmd.tableId,
              tableLabel: mesa,
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
              mesa,
              cuenta: { id: cuenta.id, orden: cuenta.orderNumber ?? null, version: cuenta.version ?? null },
              lineas: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad })),
            },
          });
          const trabajo = await encolarComanda(tx, ctx, fila, ahora, false);
          // La impresora se comprobó arriba, en esta transacción: si aun así no hay, se deshace todo.
          if ("ok" in trabajo) throw new Error(`La comanda no se encoló: ${trabajo.mensaje}`);
          const [pedido] = await pedidosDe(tx, [fila]);
          return { pedido: pedido!, cuenta };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pedido.enviar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos envíos del mismo pedido a la vez (o la misma versión de la cuenta): se vuelve a mirar.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async reimprimir(ctx, entrada, ahora = Date.now()) {
      const v = ReimprimirComandaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La comanda no se reimprimió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PedidoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "pedido.enviarCocina");
        if (rechazo) return rechazo;
        const fila = await tx.kitchenOrder.findUnique({ where: { id: v.data.pedidoId } });
        if (!fila || fila.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese pedido no existe en esta sucursal." };
        // Solo la comanda: el papel «ANULAR» del mismo pedido (B6-6) no es una reimpresión suya.
        const trabajos = await tx.printJob.findMany({ where: { orderId: fila.id, kind: "COMANDA" }, orderBy: { createdAt: "asc" } });
        const estado = estadoDeComanda(trabajos.map((t) => ({ estado: t.status as EstadoDeTrabajo, creadoEn: t.createdAt.getTime() })));
        if (estado === "EN_COLA") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "La comanda se está imprimiendo: espera a que la impresora responda." };
        }
        const quien = await nombreDe(tx, ctx);
        const actual = await tx.printer.findFirst({ where: { branchId: ctx.branchId, active: true, forOrders: true }, select: { id: true } });
        if (!actual) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: SIN_IMPRESORA.replace("el pedido no se envió", "la comanda no se reimprimió") };
        let como: "REINTENTO" | "ORIGINAL" | "COPIA";
        if (estado === "NO_SALIO") {
          // No salió: la cocina nunca la vio. Se reintenta el mismo trabajo si su impresora sigue siendo la de
          // comandas; si cambió, se descarta (queda en el historial) y sale en la de ahora.
          const fallido = trabajos.filter((t) => t.status === "FALLIDO").at(-1)!;
          if (fallido.printerId === actual.id) {
            const n = reintentado({ estado: "FALLIDO" as EstadoDeTrabajo, intentos: fallido.attempts, proximoIntento: 0, enviadoEn: null }, ahora);
            await tx.printJob.update({
              where: { id: fallido.id },
              data: { status: n.estado, attempts: n.intentos, nextAttemptAt: new Date(n.proximoIntento), sentAt: null, finishedAt: null },
            });
            como = "REINTENTO";
          } else {
            await tx.printJob.update({
              where: { id: fallido.id },
              data: { status: "DESCARTADO", discardedBy: ctx.quien?.userId ?? null, discardedByName: quien.nombre },
            });
            const t = await encolarComanda(tx, ctx, fila, ahora, false);
            if ("ok" in t) return t;
            como = "ORIGINAL";
          }
        } else {
          // Descartada: sale como la primera vez. Impresa (se perdió el papel): una copia que lo dice.
          const t = await encolarComanda(tx, ctx, fila, ahora, estado === "IMPRESA");
          if ("ok" in t) return t;
          como = estado === "IMPRESA" ? "COPIA" : "ORIGINAL";
        }
        await auditar(tx, ctx, { action: "pedido.reimprimir", entityType: "kitchen_order", entityId: fila.id, after: { comanda: fila.number, mesa: fila.tableLabel, como } });
        const [pedido] = await pedidosDe(tx, [fila]);
        return pedido!;
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pedido.reimprimir", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}

/** La comanda de un pedido en la cola de la impresora de comandas; `copia`, si es una reimpresión. */
async function encolarComanda(tx: Transaccion, ctx: Contexto, fila: FilaPedido, ahora: number, copia: boolean) {
  const local = await ajustesDe(tx, ctx.branchId);
  const lineas = fila.items as unknown as LineaGuardada[];
  return encolarEn(
    tx,
    ctx,
    {
      tipo: "COMANDA",
      para: "comandas",
      titulo: `Comanda ${comanda(fila.number)} · Mesa ${fila.tableLabel}`,
      copia,
      orderId: fila.id,
      documento: documentoDeComanda(
        { numero: fila.number, mesa: fila.tableLabel, enviadoEn: fila.createdAt.getTime(), enviadoPor: fila.createdByName, lineas },
        local,
        copia,
      ),
    },
    ahora,
  );
}

/** Los pedidos con su comanda, como los lee una pantalla. Los trabajos, en su propia consulta. */
async function pedidosDe(tx: Transaccion, filas: readonly FilaPedido[]): Promise<PedidoDto[]> {
  if (filas.length === 0) return [];
  const trabajos = await tx.printJob.findMany({
    where: { orderId: { in: filas.map((f) => f.id) } },
    select: { orderId: true, kind: true, status: true, createdAt: true, copy: true, lastError: true, printerId: true },
    orderBy: { createdAt: "asc" },
  });
  const impresoras = new Map(
    (await tx.printer.findMany({ where: { id: { in: [...new Set(trabajos.map((t) => t.printerId))] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
  return filas.map((f) => {
    const suyos = trabajos.filter((t) => t.orderId === f.id && t.kind === "COMANDA");
    const ultimo = suyos.at(-1);
    const estado = estadoDeComanda(suyos.map((t) => ({ estado: t.status as EstadoDeTrabajo, creadoEn: t.createdAt.getTime() })));
    // El último papel «ANULAR» de este pedido (B6-6), si se anuló algo.
    const anulacion = trabajos.filter((t) => t.orderId === f.id && t.kind === "ANULACION").at(-1);
    const estadoAnulacion = anulacion ? estadoDeComanda([{ estado: anulacion.status as EstadoDeTrabajo, creadoEn: anulacion.createdAt.getTime() }]) : null;
    return PedidoSchema.parse({
      id: f.id,
      numero: f.number,
      tableId: f.tableId,
      mesa: f.tableLabel,
      cuentaId: f.accountId,
      lineas: f.items,
      enviadoEn: f.createdAt.toISOString(),
      enviadoPor: f.createdByName,
      comanda: {
        estado,
        impresora: ultimo ? (impresoras.get(ultimo.printerId) ?? null) : null,
        error: estado === "NO_SALIO" ? (ultimo?.lastError ?? "No salió") : null,
        reimpresiones: suyos.filter((t) => t.copy).length,
      },
      anulacion: anulacion && estadoAnulacion
        ? { estado: estadoAnulacion, error: estadoAnulacion === "NO_SALIO" ? (anulacion.lastError ?? "No salió") : null }
        : null,
    });
  });
}

/** ¿Tiene quien opera alguna de estas acciones? */
async function puedeAlguna(tx: Transaccion, ctx: Contexto, acciones: readonly Action[]): Promise<boolean> {
  for (const a of acciones) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") return true;
  return false;
}
