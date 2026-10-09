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
 *
 * Un papel por área (B6-10): lo de cocina en la impresora de cocina y lo de barra en la de barra, con el mismo número;
 * cada uno se reimprime por su cuenta. Lo que se sirve sin papel no sale (`comandas.ts`).
 */
import { randomUUID } from "node:crypto";
import {
  EnviarPedidoCommandSchema,
  FamilyAccountSchema,
  type EnviarPedidoCommand,
  PedidoSchema,
  PedidosDelLocalSchema,
  ReimprimirComandaCommandSchema,
  ServirPedidoCommandSchema,
  DeshacerServidoCommandSchema,
  NotasRapidasQuerySchema,
  NotasRapidasSchema,
  type NotasRapidasDto,
  problemasDe,
  type AccountLineDto,
  type FamilyAccountDto,
  type PedidoDto,
  type PedidoEnviadoDto,
  type PedidosDelLocalDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import {
  estadoDeComanda,
  estadoDelPedido,
  lineasDelPedido,
  notasSugeridas,
  partesDelPedido,
  problemaParaDeshacer,
  servidoDelPedido,
  servidoPorPlato,
  type AreaDeComanda,
  type EstadoDeComanda,
  type EstadoDeTrabajo,
  type MarcaDePlato,
} from "@l2/domain-orders";
import { reintentado } from "@l2/domain-printing";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { catalogoEn, crearCuentaDeMesa, guardarVersion, nombrePropioDe, vigenteDe } from "../caja/cuentas.ts";
import { asentarExistencias, comprobarExistencias } from "../inventario/existencias.ts";
import { encolarEn, impresoraDe } from "../impresion/impresion.ts";
import { NOMBRE_DE_AREA, areaSinImpresora, areasDeProductos, oficioDe, sinImpresoraPara, type LineaGuardada } from "./comandas.ts";
import { documentoDeComanda, rotuloDePedido } from "../impresion/plantillas.ts";
import { ajustesDe, zonaDe } from "../sucursal/ajustes.ts";
import { candadoDeMesas, cuentaDeMesaPara, mesaParaCuentaNueva, mesaSinCuenta } from "./plano.ts";

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
  /**
   * Marca servidos platos de un pedido (`ServirPedidoCommandSchema`, B6-8, D-SERV, B6-11): los que diga o, sin decirlos,
   * todo lo que falte. Ahí termina su espera; el pedido, cuando se sirve su último plato. Lo hace quien toma pedidos. Lo
   * ya servido queda como estaba.
   */
  servir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PedidoDto>>;
  /** Deshace, en el momento, un plato marcado servido por error (`DeshacerServidoCommandSchema`, B6-11). */
  deshacerServido(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PedidoDto>>;
  /**
   * Las notas rápidas de un plato (`NotasRapidasQuerySchema`, B6-12): las 5 más escritas para ese producto en los
   * últimos 60 días en esta sucursal y, si tiene pocas, las de su categoría. Las aprende de los pedidos; nadie las configura.
   */
  notasRapidas(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<NotasRapidasDto>>;
}

/** Quién ve los pedidos: quien los toma y la caja, que cobra la mesa y ve si salió la comanda. */
const VEN_PEDIDOS: readonly Action[] = ["pedido.tomar", "documento.emitir"];

type FilaPedido = Awaited<ReturnType<Transaccion["kitchenOrder"]["findFirstOrThrow"]>>;

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
            const otraMesa = cmd.tableId !== undefined && previo.tableId !== cmd.tableId;
            const otraCuenta = cmd.cuentaId !== undefined && previo.accountId !== cmd.cuentaId;
            if (previo.branchId !== ctx.branchId || otraMesa || otraCuenta) {
              return { ok: false, motivo: "CONFLICTO", mensaje: "Ese identificador de pedido ya existe." };
            }
            const [pedido] = await pedidosDe(tx, [previo]);
            return { pedido: pedido!, cuenta: (await vigenteDe(tx, previo.accountId))!.cuenta };
          }

          // El área de cada plato (B6-10) y sus papeles: sin la impresora de un área no sale su papel, y el pedido no se
          // envía (fail-closed, ADR-022).
          const areaDelProducto = await areasDeProductos(tx, cmd.lineas.map((l) => l.productId));
          const partes = partesDelPedido(cmd.lineas.map((l) => ({ area: areaDelProducto.get(l.productId) ?? "COCINA" })));
          const falta = await areaSinImpresora(tx, ctx.branchId, partes.map((p) => p.area));
          if (falta) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: sinImpresoraPara(falta, "el pedido no se envió") };

          // A qué cuenta va (B6-7): la que nombra la tablet, la única de la mesa o una nueva en una mesa libre,
          // con el candado de las mesas.
          await candadoDeMesas(tx, ctx.branchId);
          const destino = await destinoDelPedido(tx, ctx, cmd);
          if ("ok" in destino) return destino;
          const { actual, tableId, mesa } = destino;

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
            : await crearCuentaDeMesa(tx, ctx, { tableId: tableId!, label: mesa, lines: nuevas, ahora, quien: quien.nombre });
          await guardarVersion(tx, ctx, cuenta, { cause: "PEDIDO", operationKey: cmd.pedidoId, ahora, quien: quien.nombre });
          await asentarExistencias(tx, ctx, existencias, { accountId: cuenta.id, version: cuenta.version!, ahora, quien: quien.nombre });

          // El número que se canta en la cocina: continuo por sucursal, como el de las cuentas (D13).
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`comanda:${ctx.branchId}`}, 0))::text AS candado`;
          const max = await tx.kitchenOrder.aggregate({ where: { branchId: ctx.branchId }, _max: { number: true } });
          const lineas: LineaGuardada[] = cmd.lineas.map((l) => {
            const p = platoEn(l.productId)!;
            return { productId: l.productId, nombre: p.name, cantidad: l.cantidad, nota: l.nota?.trim() ? l.nota.trim() : null, area: areaDelProducto.get(l.productId) ?? "COCINA" };
          });
          const fila = await tx.kitchenOrder.create({
            data: {
              id: cmd.pedidoId,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId: cuenta.id,
              number: (max._max.number ?? 0) + 1,
              tableId,
              tableLabel: mesa,
              accountLabel: nombrePropioDe(cuenta),
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
              ...(fila.accountLabel ? { nombreCuenta: fila.accountLabel } : {}),
              cuenta: { id: cuenta.id, orden: cuenta.orderNumber ?? null, version: cuenta.version ?? null },
              lineas: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, area: l.area })),
            },
          });
          // Un papel por área, en su impresora.
          for (const parte of partesDelPedido(lineas)) {
            const trabajo = await encolarComanda(tx, ctx, fila, parte.area, ahora, false);
            // Las impresoras se comprobaron arriba, en esta transacción: si aun así falta una, se deshace todo.
            if ("ok" in trabajo) throw new Error(`La comanda no se encoló: ${trabajo.mensaje}`);
          }
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
        // Cuál de sus papeles (B6-10): el del área que se pide o, sin decirla, el único que tenga.
        const partes = partesDelPedido(fila.items as unknown as LineaGuardada[]);
        if (partes.length === 0) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese pedido no tiene comanda: todo lo suyo se sirve sin papel." };
        const parte = v.data.area === undefined ? (partes.length === 1 ? partes[0] : undefined) : partes.find((p) => p.area === v.data.area || p.area === null);
        if (!parte) {
          return v.data.area === undefined
            ? { ok: false, motivo: "INVALIDO", mensaje: "Ese pedido tiene comanda de cocina y de barra: di cuál se reimprime.", problemas: [{ path: ["area"], message: "FALTA_EL_AREA" }] }
            : { ok: false, motivo: "NO_DISPONIBLE", mensaje: `Ese pedido no tiene comanda de ${NOMBRE_DE_AREA[v.data.area].toLowerCase()}.` };
        }
        // Solo la comanda de esa área: el papel «ANULAR» del mismo pedido (B6-6) no es una reimpresión suya.
        const trabajos = await tx.printJob.findMany({ where: { orderId: fila.id, kind: "COMANDA", area: parte.area }, orderBy: { createdAt: "asc" } });
        const estado = estadoDeComanda(trabajos.map((t) => ({ estado: t.status as EstadoDeTrabajo, creadoEn: t.createdAt.getTime() })));
        if (estado === "EN_COLA") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "La comanda se está imprimiendo: espera a que la impresora responda." };
        }
        const quien = await nombreDe(tx, ctx);
        const actual = await impresoraDe(tx, ctx.branchId, oficioDe(parte.area));
        if (!actual) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: sinImpresoraPara(parte.area ?? "COMANDAS", "la comanda no se reimprimió") };
        let como: "REINTENTO" | "ORIGINAL" | "COPIA";
        if (estado === "NO_SALIO") {
          // No salió: la cocina nunca la vio. Se reintenta el mismo trabajo si su impresora sigue siendo la de
          // comandas; si cambió, se descarta (queda en el historial) y sale en la de ahora.
          const fallido = trabajos.filter((t) => t.status === "FALLIDO").at(-1);
          if (!fallido) {
            // Nunca se encoló (no debería pasar): sale como la primera vez.
            const t = await encolarComanda(tx, ctx, fila, parte.area, ahora, false);
            if ("ok" in t) return t;
            como = "ORIGINAL";
          } else if (fallido.printerId === actual.id) {
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
            const t = await encolarComanda(tx, ctx, fila, parte.area, ahora, false);
            if ("ok" in t) return t;
            como = "ORIGINAL";
          }
        } else {
          // Descartada: sale como la primera vez. Impresa (se perdió el papel): una copia que lo dice.
          const t = await encolarComanda(tx, ctx, fila, parte.area, ahora, estado === "IMPRESA");
          if ("ok" in t) return t;
          como = estado === "IMPRESA" ? "COPIA" : "ORIGINAL";
        }
        await auditar(tx, ctx, {
          action: "pedido.reimprimir",
          entityType: "kitchen_order",
          entityId: fila.id,
          after: { comanda: fila.number, mesa: fila.tableLabel, como, ...(parte.area ? { area: parte.area } : {}) },
        });
        const [pedido] = await pedidosDe(tx, [fila]);
        return pedido!;
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pedido.reimprimir", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async servir(ctx, entrada, ahora = Date.now()) {
      const v = ServirPedidoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se marcó: el pedido no es válido.", problemas: problemasDe(v.error) };
      const marcar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<PedidoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "pedido.tomar");
          if (rechazo) return rechazo;
          const fila = await tx.kitchenOrder.findUnique({ where: { id: v.data.pedidoId } });
          if (!fila || fila.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese pedido no existe en esta sucursal." };
          // Las marcas de un pedido, de una en una: dos tablets a la vez no lo sirven dos veces.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`servido:${fila.id}`}, 0))::text AS candado`;
          const lineas = fila.items as unknown as LineaGuardada[];
          const pedidas = v.data.lineas ?? lineas.map((_, i) => i);
          const fuera = pedidas.find((i) => i >= lineas.length);
          if (fuera !== undefined) return { ok: false, motivo: "INVALIDO", mensaje: "Ese plato no es de este pedido.", problemas: [{ path: ["lineas"], message: "PLATO_DESCONOCIDO" }] };
          const antes = await servidosDe(tx, fila);
          // Lo ya servido queda como estaba (otra tablet lo marcó, o se pidió dos veces).
          const nuevas = [...new Set(pedidas)].filter((i) => antes[i] === null);
          if (nuevas.length > 0) {
            const quien = await nombreDe(tx, ctx);
            for (const i of nuevas) {
              await tx.kitchenOrderLineServed.create({
                data: { tenantId: ctx.tenantId, orderId: fila.id, lineIndex: i, kind: "SERVIDO", at: new Date(ahora), by: ctx.quien?.userId ?? null, byName: quien.nombre, deviceId: ctx.quien?.deviceId ?? null },
              });
            }
            const despues = await servidosDe(tx, fila);
            const entero = servidoDelPedido(despues);
            // El último plato: el pedido queda servido, también para la versión de antes (que lee kitchen_order_served).
            if (entero && !(await tx.kitchenOrderServed.findUnique({ where: { tenantId_orderId: { tenantId: ctx.tenantId, orderId: fila.id } } }))) {
              await tx.kitchenOrderServed.create({
                data: { tenantId: ctx.tenantId, orderId: fila.id, servedAt: new Date(ahora), servedBy: ctx.quien?.userId ?? null, servedName: quien.nombre, deviceId: ctx.quien?.deviceId ?? null },
              });
            }
            await auditar(tx, ctx, {
              action: "pedido.servir",
              entityType: "kitchen_order",
              entityId: fila.id,
              after: {
                comanda: fila.number,
                mesa: fila.tableLabel,
                platos: nuevas.map((i) => lineas[i]!.nombre),
                esperaMin: Math.max(0, Math.floor((ahora - fila.createdAt.getTime()) / 60_000)),
                pedidoServido: entero !== null,
              },
            });
          }
          return (await pedidosDe(tx, [fila]))[0]!;
        });
      try {
        const r = await marcar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pedido.servir", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos tablets a la vez: la segunda lee el que marcó la primera.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await marcar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async deshacerServido(ctx, entrada, ahora = Date.now()) {
      const v = DeshacerServidoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se deshizo: el plato no es válido.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PedidoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "pedido.tomar");
        if (rechazo) return rechazo;
        const fila = await tx.kitchenOrder.findUnique({ where: { id: v.data.pedidoId } });
        if (!fila || fila.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese pedido no existe en esta sucursal." };
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`servido:${fila.id}`}, 0))::text AS candado`;
        const lineas = fila.items as unknown as LineaGuardada[];
        if (v.data.linea >= lineas.length) return { ok: false, motivo: "INVALIDO", mensaje: "Ese plato no es de este pedido.", problemas: [{ path: ["linea"], message: "PLATO_DESCONOCIDO" }] };
        const plato = (await servidosDe(tx, fila))[v.data.linea] ?? null;
        const problema = problemaParaDeshacer(plato, ahora);
        if (problema === "NO_SERVIDO") return (await pedidosDe(tx, [fila]))[0]!; // ya estaba sin servir: nada que deshacer
        if (problema === "YA_NO") return { ok: false, motivo: "CONFLICTO", mensaje: "Se marcó servido hace rato: ya no se deshace." };
        const quien = await nombreDe(tx, ctx);
        await tx.kitchenOrderLineServed.create({
          data: { tenantId: ctx.tenantId, orderId: fila.id, lineIndex: v.data.linea, kind: "DESHECHO", at: new Date(ahora), by: ctx.quien?.userId ?? null, byName: quien.nombre, deviceId: ctx.quien?.deviceId ?? null },
        });
        await auditar(tx, ctx, {
          action: "pedido.deshacer_servido",
          entityType: "kitchen_order",
          entityId: fila.id,
          after: { comanda: fila.number, mesa: fila.tableLabel, plato: lineas[v.data.linea]!.nombre },
        });
        return (await pedidosDe(tx, [fila]))[0]!;
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "pedido.deshacer_servido", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async notasRapidas(ctx, entrada, ahora = Date.now()) {
      const v = NotasRapidasQuerySchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Ese plato no es válido.", problemas: problemasDe(v.error) };
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<NotasRapidasDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "pedido.tomar");
        if (rechazo) return rechazo;
        const producto = await tx.product.findUnique({ where: { id: v.data.productId }, select: { id: true, category: true } });
        if (!producto) return { ok: true, valor: { notas: [] } };
        const deLaCategoria = (await tx.product.findMany({ where: { category: producto.category }, select: { id: true } })).map((p) => p.id);
        // Las notas de los pedidos de esta sucursal, de lo más nuevo a lo más viejo: el empate lo gana la más reciente.
        const filas = await tx.$queryRaw<{ producto: string; nota: string }[]>`
          SELECT i->>'productId' AS producto, i->>'nota' AS nota
          FROM kitchen_order k, jsonb_array_elements(k.items) i
          WHERE k.branch_id = ${ctx.branchId}::uuid
            AND k.created_at >= ${new Date(ahora - DIAS_DE_NOTAS * 86_400_000)}
            AND i->>'productId' = ANY(${deLaCategoria}::text[])
            AND coalesce(btrim(i->>'nota'), '') <> ''
          ORDER BY k.created_at DESC
          LIMIT 3000`;
        const notas = notasSugeridas(
          filas.filter((f) => f.producto === producto.id).map((f) => f.nota),
          filas.filter((f) => f.producto !== producto.id).map((f) => f.nota),
        );
        return { ok: true, valor: NotasRapidasSchema.parse({ notas }) };
      });
    },
  };
}

/** De cuántos días atrás se aprenden las notas rápidas (B6-12). */
const DIAS_DE_NOTAS = 60;

/** Lo servido de cada plato de un pedido (B6-11): sus marcas sobre lo marcado por pedido antes de este paso. */
async function servidosDe(tx: Transaccion, fila: FilaPedido) {
  return (await servidosDeVarios(tx, [fila])).get(fila.id)!;
}

/** Lo servido de cada plato de varios pedidos, en dos consultas. */
async function servidosDeVarios(tx: Transaccion, filas: readonly FilaPedido[]) {
  const ids = filas.map((f) => f.id);
  const enteros = new Map(
    (await tx.kitchenOrderServed.findMany({ where: { orderId: { in: ids } }, select: { orderId: true, servedAt: true, servedName: true } })).map((s) => [
      s.orderId,
      { en: s.servedAt.getTime(), por: s.servedName },
    ]),
  );
  const marcas = await tx.kitchenOrderLineServed.findMany({ where: { orderId: { in: ids } }, orderBy: [{ at: "asc" }, { id: "asc" }] });
  // Lo marcado por pedido ANTES de B6-11 vale como todo servido: es anterior a toda marca de plato. El que este paso
  // escribe al servir el último plato, no (va con la marca de ese plato, en el mismo instante, y sus platos ya tienen las
  // suyas): deshacer uno tiene que poder dejar el pedido sin servir.
  return new Map(
    filas.map((f) => {
      const suyas: MarcaDePlato[] = marcas.filter((m) => m.orderId === f.id).map((m) => ({ linea: m.lineIndex, tipo: m.kind as MarcaDePlato["tipo"], en: m.at.getTime(), por: m.byName }));
      const marcado = enteros.get(f.id) ?? null;
      const entero = marcado && suyas.every((m) => m.en > marcado.en) ? marcado : null;
      return [f.id, servidoPorPlato((f.items as unknown as LineaGuardada[]).length, suyas, entero)];
    }),
  );
}

type VigenteDeCuenta = NonNullable<Awaited<ReturnType<typeof vigenteDe>>>;
type Destino = Readonly<{ actual: VigenteDeCuenta | null; tableId: string | null; mesa: string }>;

/**
 * La cuenta a la que va un pedido (B6-7). Sin mesa, una cuenta de pie abierta de esta sucursal, que nombra la
 * tablet. Con mesa, la que diga la tablet, la única que tenga, o ninguna: entonces la mesa tiene que estar en
 * el salón y libre, y el pedido abre su cuenta (`actual: null`). Con el candado de las mesas tomado.
 */
async function destinoDelPedido(tx: Transaccion, ctx: Contexto, cmd: EnviarPedidoCommand): Promise<Destino | Rechazo> {
  if (cmd.tableId === undefined) {
    const fila = await tx.account.findUnique({ where: { id: cmd.cuentaId! }, select: { branchId: true } });
    const vigente = fila?.branchId === ctx.branchId ? await vigenteDe(tx, cmd.cuentaId!) : null;
    if (!vigente || (vigente.cuenta.status !== "ABIERTA" && vigente.cuenta.status !== "POR_COBRAR")) {
      return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta ya no está abierta: vuelve a mirar el salón.", problemas: [{ path: ["cuentaId"], message: "CUENTA_CERRADA" }] };
    }
    if (!vigente.cuenta.dePie) {
      return { ok: false, motivo: "INVALIDO", mensaje: "El mesero pide para una mesa o para una cuenta de pie.", problemas: [{ path: ["cuentaId"], message: "NO_ES_DEL_SALON" }] };
    }
    return { actual: vigente, tableId: null, mesa: "De pie" };
  }
  const r = await cuentaDeMesaPara(tx, ctx.branchId, cmd.tableId, cmd.cuentaId);
  if ("ok" in r) return r;
  if (r.abierta) {
    const vigente = (await vigenteDe(tx, r.abierta))!;
    return { actual: vigente, tableId: cmd.tableId, mesa: vigente.cuenta.tableLabel ?? "?" };
  }
  // Una mesa sin cuenta no la abre un pedido: se sienta primero a su cliente (B6-9, M-33). Antes, si la mesa no está en
  // el salón, se dice eso.
  const enElSalon = await mesaParaCuentaNueva(tx, ctx.branchId, cmd.tableId);
  if ("ok" in enElSalon) return { ...enElSalon, ...(enElSalon.problemas ? { problemas: enElSalon.problemas.map((p) => ({ ...p, path: ["tableId"] })) } : {}) };
  return mesaSinCuenta(["tableId"]);
}

/**
 * La comanda de un área de un pedido (B6-10) en la cola de la impresora de esa área; `area: null`, la de un pedido de
 * antes, con todo, en la de cocina. `copia`, si es una reimpresión.
 */
async function encolarComanda(tx: Transaccion, ctx: Contexto, fila: FilaPedido, area: AreaDeComanda | null, ahora: number, copia: boolean) {
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

/** Los pedidos con su comanda, como los lee una pantalla. Los trabajos, en su propia consulta. */
async function pedidosDe(tx: Transaccion, filas: readonly FilaPedido[]): Promise<PedidoDto[]> {
  if (filas.length === 0) return [];
  // Cuándo se sirvió cada plato (B6-8, B6-11): sin marca, sigue esperando.
  const servidos = await servidosDeVarios(tx, filas);
  const iso = (s: { en: number; por: string } | null) => (s ? { en: new Date(s.en).toISOString(), por: s.por } : null);
  const trabajos = await tx.printJob.findMany({
    where: { orderId: { in: filas.map((f) => f.id) } },
    select: { orderId: true, kind: true, status: true, createdAt: true, copy: true, lastError: true, printerId: true, area: true },
    orderBy: { createdAt: "asc" },
  });
  const impresoras = new Map(
    (await tx.printer.findMany({ where: { id: { in: [...new Set(trabajos.map((t) => t.printerId))] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
  const estadoDe = (ts: readonly (typeof trabajos)[number][]) => estadoDeComanda(ts.map((t) => ({ estado: t.status as EstadoDeTrabajo, creadoEn: t.createdAt.getTime() })));
  return filas.map((f) => {
    // Un estado por papel (B6-10): el de cocina y el de barra, cada uno por sus trabajos.
    const comandas = partesDelPedido(f.items as unknown as LineaGuardada[]).map((p) => {
      const suyos = trabajos.filter((t) => t.orderId === f.id && t.kind === "COMANDA" && t.area === p.area);
      const ultimo = suyos.at(-1);
      const estado = estadoDe(suyos);
      return {
        area: p.area,
        estado,
        impresora: ultimo ? (impresoras.get(ultimo.printerId) ?? null) : null,
        error: estado === "NO_SALIO" ? (ultimo?.lastError ?? "No salió") : null,
        reimpresiones: suyos.filter((t) => t.copy).length,
      };
    });
    // El pedido entero: el papel que más atención pide.
    const estado = estadoDelPedido(comandas.map((c) => c.estado));
    const peor = comandas.find((c) => c.estado === estado) ?? null;
    // El último papel «ANULAR» de cada área (B6-6, B6-10), si se anuló algo.
    const anulaciones = [...new Set(trabajos.filter((t) => t.orderId === f.id && t.kind === "ANULACION").map((t) => t.area))].map((area) => {
      const ultima = trabajos.filter((t) => t.orderId === f.id && t.kind === "ANULACION" && t.area === area).at(-1)!;
      const e = estadoDe([ultima]);
      return { area: area as AreaDeComanda | null, estado: e, error: e === "NO_SALIO" ? (ultima.lastError ?? "No salió") : null };
    });
    const estadoAnulacion = anulaciones.length > 0 ? (estadoDelPedido(anulaciones.map((a) => a.estado)) as EstadoDeComanda) : null;
    const anulacion = anulaciones.find((a) => a.estado === estadoAnulacion) ?? null;
    return PedidoSchema.parse({
      id: f.id,
      numero: f.number,
      tableId: f.tableId,
      mesa: f.tableLabel,
      nombreCuenta: f.accountLabel,
      cuentaId: f.accountId,
      lineas: (f.items as unknown as LineaGuardada[]).map((l, i) => ({ ...l, servido: iso(servidos.get(f.id)![i] ?? null) })),
      enviadoEn: f.createdAt.toISOString(),
      enviadoPor: f.createdByName,
      comandas,
      comanda: {
        estado,
        impresora: peor?.impresora ?? null,
        error: peor?.error ?? null,
        reimpresiones: comandas.reduce((n, c) => n + c.reimpresiones, 0),
      },
      anulacion: anulacion ? { estado: anulacion.estado, error: anulacion.error } : null,
      anulaciones,
      servido: iso(servidoDelPedido(servidos.get(f.id)!)),
    });
  });
}

/** ¿Tiene quien opera alguna de estas acciones? */
async function puedeAlguna(tx: Transaccion, ctx: Contexto, acciones: readonly Action[]): Promise<boolean> {
  for (const a of acciones) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") return true;
  return false;
}
