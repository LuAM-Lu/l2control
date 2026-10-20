/**
 * Pedir una anulación — B3-30 (M-40).
 *
 * Sin administración en el local, la cajera no podía anular un cobro hecho dos veces: hacía falta el PIN de administración
 * en la caja (B3-18, D-AUT). Ahora la caja lo pide con su motivo y lo que se hará con la cuenta, la venta queda «Anulación
 * pedida» y la caja sigue. Administración responde desde Inicio, también en su teléfono: aprueba con su PIN (es la
 * autorización de `cobro.anular`) o rechaza con su motivo. Aprobada, la caja hace la anulación sin PIN (`cuentas.anular`
 * con `{ aprobacion }`): el dinero se devuelve donde está, en la gaveta o en el punto. La Z no se hace con un pedido sin
 * resolver (`cortes`).
 *
 * El pedido y su respuesta son de solo agregar. Su estado se deduce: RECHAZADA si se rechazó; HECHA si la venta ya tiene su
 * anulación (por este pedido o porque administración la anuló en la caja); APROBADA si se aprobó; si no, PEDIDA.
 */
import {
  AnulacionPedidaSchema,
  AnulacionesPedidasSchema,
  PedirAnulacionCommandSchema,
  ResponderAnulacionCommandSchema,
  problemasDe,
  type AnulacionPedidaDto,
  type AnulacionesPedidasDto,
  type EstadoDeAnulacionPedida,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";

export interface CasosAnulaciones {
  /** La caja pide anular un cobro (`PedirAnulacionCommandSchema`). La pide quien cobra. */
  pedir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<AnulacionPedidaDto>>;
  /** Los pedidos de la sucursal: los que esperan y los de los últimos días. Los ven quien cobra y administración. */
  leer(ctx: Contexto, ahora?: number): Promise<Resultado<AnulacionesPedidasDto>>;
  /** Administración aprueba (con su PIN, en `autorizacion`) o rechaza con su motivo. */
  responder(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<AnulacionPedidaDto>>;
}

const DIA = 86_400_000;
/** Cuánto tiempo siguen a la vista los pedidos ya resueltos. */
const RESUELTOS_A_LA_VISTA = 3 * DIA;

type FilaDePedido = NonNullable<Awaited<ReturnType<typeof filaDe>>>;

function filaDe(tx: Transaccion, where: { id: string } | { operationKey: string }) {
  return tx.annulmentRequest.findFirst({ where, include: { outcome: true, sale: { include: { voids: { select: { id: true } } } } } });
}

/** El estado de un pedido, de sus filas (ver arriba). */
export function estadoDe(f: Readonly<{ outcome: { kind: string } | null; sale: { voids: readonly unknown[] } }>): EstadoDeAnulacionPedida {
  if (f.outcome?.kind === "RECHAZADA") return "RECHAZADA";
  if (f.sale.voids.length > 0) return "HECHA";
  if (f.outcome?.kind === "APROBADA") return "APROBADA";
  return "PEDIDA";
}

function dtoDe(f: FilaDePedido): AnulacionPedidaDto {
  // De la venta basta de quién es: su contenido es la foto de lo cobrado (C12).
  const cuenta = (f.sale.content as { cuenta?: { family?: unknown } } | null)?.cuenta?.family;
  return AnulacionPedidaSchema.parse({
    id: f.id,
    ventaId: f.sale.id,
    cobroKey: f.cobroKey,
    accountId: f.accountId,
    turnoId: f.sale.shiftId,
    orden: f.sale.orderNumber,
    cuenta: typeof cuenta === "string" ? cuenta : `Orden ${f.sale.orderNumber}`,
    total: { minor: String(f.sale.totalMinor), currency: f.sale.currency },
    cobradaEl: f.sale.closedAt.toISOString(),
    cobradaPor: f.sale.cashierName,
    motivo: f.reason,
    detalle: f.note,
    camino: f.path,
    inventario: f.stock,
    pedidaPor: f.requestedByName,
    pedidaEl: f.requestedAt.toISOString(),
    estado: estadoDe(f),
    respuesta: f.outcome ? { por: f.outcome.byName, el: f.outcome.at.toISOString(), motivo: f.outcome.reason } : null,
  });
}

/** ¿Hay un pedido sin resolver (PEDIDA o APROBADA sin hacer) de las ventas de este turno? Lo usa el corte Z. */
export async function pedidosSinResolverDelTurno(tx: Transaccion, turnoId: string): Promise<number> {
  const filas = await tx.annulmentRequest.findMany({ where: { sale: { shiftId: turnoId } }, include: { outcome: true, sale: { include: { voids: { select: { id: true } } } } } });
  return filas.filter((f) => {
    const e = estadoDe(f);
    return e === "PEDIDA" || e === "APROBADA";
  }).length;
}

/** Los pedidos sin resolver de la sucursal, para el cierre. */
export async function pedidosSinResolverDe(tx: Transaccion, branchId: string): Promise<AnulacionPedidaDto[]> {
  const filas = await tx.annulmentRequest.findMany({
    where: { branchId, OR: [{ outcome: null }, { outcome: { kind: "APROBADA" } }] },
    include: { outcome: true, sale: { include: { voids: { select: { id: true } } } } },
    orderBy: { requestedAt: "asc" },
  });
  return filas.map(dtoDe).filter((p) => p.estado === "PEDIDA" || p.estado === "APROBADA");
}

/**
 * La aprobación de un pedido como autorización de la anulación (`cuentas.anular`): el mismo cobro, el mismo motivo y el
 * mismo camino que se aprobaron, aprobado y sin hacer. Devuelve quién aprobó (la autorización) o el rechazo.
 */
export async function aprobacionPara(
  tx: Transaccion,
  ctx: Contexto,
  pedidoId: string,
  cmd: Readonly<{ accountId: string; cobroKey: string; motivo: string; camino: string; inventario: string }>,
): Promise<{ ok: true; autorizadoPor: string; pedidoId: string } | Rechazo> {
  const f = await filaDe(tx, { id: pedidoId });
  if (!f || f.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese pedido de anulación no es de esta sucursal." };
  const estado = estadoDe(f);
  if (estado !== "APROBADA") {
    return {
      ok: false,
      motivo: "CONFLICTO",
      mensaje: estado === "PEDIDA" ? "Administración todavía no la aprobó." : estado === "HECHA" ? "Esa venta ya está anulada." : "Administración la rechazó.",
    };
  }
  if (f.cobroKey !== cmd.cobroKey || f.accountId !== cmd.accountId) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa aprobación es de otro cobro." };
  if (f.reason !== cmd.motivo || f.path !== cmd.camino || (f.path === "ANULAR_VENTA" && f.stock !== cmd.inventario)) {
    return { ok: false, motivo: "CONFLICTO", mensaje: "Se aprobó con otro motivo o con otro camino: pide la anulación otra vez." };
  }
  if (!f.outcome?.byUser) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa aprobación no dice quién la dio." };
  // Quien la hace es quien cobra: la caja.
  const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
  if (rechazo) return rechazo;
  return { ok: true, autorizadoPor: f.outcome.byUser, pedidoId: f.id };
}

export function casosAnulaciones(base: Base): CasosAnulaciones {
  return {
    async pedir(ctx, entrada, ahora = Date.now()) {
      const v = PedirAnulacionCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La anulación no se pidió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<AnulacionPedidaDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
          if (rechazo) return rechazo;
          // Un reintento (se cortó la red) devuelve el mismo pedido.
          const previa = await filaDe(tx, { operationKey: cmd.idempotencyKey });
          if (previa) return previa.cobroKey === cmd.cobroKey ? dtoDe(previa) : { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otro pedido." };

          const venta = await tx.sale.findFirst({ where: { operationKey: cmd.cobroKey }, include: { voids: { select: { id: true } }, shift: { select: { status: true } } } });
          if (!venta || venta.branchId !== ctx.branchId || venta.accountId !== cmd.accountId) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese cobro no es de esta sucursal." };
          }
          if (venta.voids.length > 0) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese cobro ya se anuló." };
          if (venta.shift.status === "CERRADO_Z") return { ok: false, motivo: "CONFLICTO", mensaje: "Esa venta es de un turno con corte Z: ya no se anula." };
          const abiertas = await tx.annulmentRequest.findMany({ where: { saleId: venta.id }, include: { outcome: true, sale: { include: { voids: { select: { id: true } } } } } });
          const esperando = abiertas.find((f) => ["PEDIDA", "APROBADA"].includes(estadoDe(f)));
          if (esperando) {
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: estadoDe(esperando) === "APROBADA" ? "Administración ya aprobó anularla: hazla desde la venta." : "Ya se pidió anular esa venta: espera la respuesta de administración.",
            };
          }

          const quien = await nombreDe(tx, ctx);
          const fila = await tx.annulmentRequest.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              saleId: venta.id,
              accountId: venta.accountId,
              cobroKey: cmd.cobroKey,
              reason: cmd.motivo,
              note: cmd.detalle ?? null,
              path: cmd.camino,
              stock: cmd.inventario,
              operationKey: cmd.idempotencyKey,
              requestedAt: new Date(ahora),
              requestedBy: ctx.quien?.userId ?? null,
              requestedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            },
            select: { id: true },
          });
          await auditar(tx, ctx, {
            action: "cobro.pedir_anulacion",
            entityType: "sale",
            entityId: venta.id,
            reason: cmd.motivo,
            after: { pedido: fila.id, orden: venta.orderNumber, camino: cmd.camino },
          });
          return dtoDe((await filaDe(tx, { id: fila.id }))!);
        });
      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cobro.pedir_anulacion", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async leer(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<AnulacionesPedidasDto>> => {
        const cobra = await permisoEn(tx, ctx, "documento.emitir");
        const anula = cobra === "PERMITIDO" ? cobra : await permisoEn(tx, ctx, "cobro.anular");
        if (anula !== "PERMITIDO") return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Los pedidos de anulación los ven quien cobra y administración." };
        const filas = await tx.annulmentRequest.findMany({
          where: { branchId: ctx.branchId, OR: [{ requestedAt: { gte: new Date(ahora - RESUELTOS_A_LA_VISTA) } }, { outcome: null }, { outcome: { kind: "APROBADA" } }] },
          include: { outcome: true, sale: { include: { voids: { select: { id: true } } } } },
          orderBy: { requestedAt: "desc" },
          take: 50,
        });
        return { ok: true, valor: AnulacionesPedidasSchema.parse({ pedidas: filas.map(dtoDe) }) };
      });
    },

    async responder(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = ResponderAnulacionCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se respondió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const accion = cmd.respuesta === "APROBAR" ? "cobro.aprobar_anulacion" : "cobro.rechazar_anulacion";
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<AnulacionPedidaDto | Rechazo> => {
          const f = await filaDe(tx, { id: cmd.pedidoId });
          if (!f || f.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese pedido de anulación no es de esta sucursal." };
          // Un reintento con la misma clave devuelve la respuesta que ya se dio.
          if (f.outcome?.operationKey === cmd.idempotencyKey) return dtoDe(f);
          if (estadoDe(f) !== "PEDIDA") return { ok: false, motivo: "CONFLICTO", mensaje: "Ese pedido ya tiene respuesta." };

          // Aprobar es la autorización de anular (D-AUT): administración, con su PIN. Rechazar no mueve dinero: basta el
          // permiso.
          let por: string | null;
          if (cmd.respuesta === "APROBAR") {
            const p = await exigirPermisoOAutorizacion(tx, ctx, "cobro.anular", autorizacion, ahora, { confirmarConPin: true });
            if (!p.ok) return p;
            por = p.autorizadoPor ?? ctx.quien?.userId ?? null;
          } else {
            if ((await permisoEn(tx, ctx, "cobro.anular")) !== "PERMITIDO") {
              return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Rechazar una anulación es de administración." };
            }
            por = ctx.quien?.userId ?? null;
          }
          const nombre = por ? (await tx.staffUser.findUnique({ where: { id: por }, select: { fullName: true } }))?.fullName : null;
          await tx.annulmentRequestOutcome.create({
            data: {
              tenantId: ctx.tenantId,
              requestId: f.id,
              kind: cmd.respuesta === "APROBAR" ? "APROBADA" : "RECHAZADA",
              at: new Date(ahora),
              byUser: por,
              byName: nombre ?? (await nombreDe(tx, ctx)).nombre,
              reason: cmd.respuesta === "RECHAZAR" ? (cmd.motivo ?? null) : null,
              operationKey: cmd.idempotencyKey,
            },
          });
          await auditar(tx, ctx, {
            action: accion,
            entityType: "sale",
            entityId: f.saleId,
            ...(por ? { authorizedBy: por } : {}),
            ...(cmd.motivo ? { reason: cmd.motivo } : {}),
            after: { pedido: f.id, orden: f.sale.orderNumber },
          });
          return dtoDe((await filaDe(tx, { id: f.id }))!);
        });
      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },
  };
}
