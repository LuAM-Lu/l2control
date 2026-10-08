/**
 * Las deudas de clientes en el servidor — B3-11, M-33.
 *
 * Quien se sienta y se va sin pagar deja una deuda a su nombre:
 *  · **Marcarla** («Se fue sin pagar»): la cuenta pasa a INCOBRABLE —un estado que ya existía, así que sale de la cola y
 *    del cierre y libera la mesa también para una versión anterior de la app (ADR-028)— y la deuda guarda al cliente
 *    (nombre, cédula y teléfono como se dieron), lo que debe en dólares, quién lo sentó, quién la marcó y quién lo
 *    autorizó con su PIN (supervisión; la caja y el mesero, con la suya).
 *  · **Cobrarla** cuando vuelve: una cuenta del mostrador con lo que consumió (sin el producto, para no sacarlo otra vez
 *    del estante; con su descuento y su reparto, para que sea exactamente lo que debía), a su nombre. La caja la cobra
 *    como cualquier otra, en el turno y con la tasa de hoy; cobrada entera, la deuda queda COBRADA (`saldar.ts`).
 *  · **Darla por perdida**: administración, con su PIN y un motivo (`cuenta.incobrable`).
 * Nada se borra: la deuda, su cobro y su desenlace son de solo agregar.
 */
import { randomUUID } from "node:crypto";
import {
  CobrarDeudaCommandSchema,
  DevolverDeudaCommandSchema,
  DeudasSchema,
  FamilyAccountSchema,
  MarcarDeudaCommandSchema,
  PerderDeudaCommandSchema,
  problemasDe,
  type DeudaDto,
  type DeudasDto,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { chargeableLines, markUncollectible, uncollectibleProblem } from "@l2/domain-cash";
import { contactKey, documentKey } from "@l2/domain-park";
import { errorDeBase, type Base } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { guardarVersion, pendienteDe, periodosDeImpuestos, siguienteNumero, vigenteDe } from "../caja/cuentas.ts";
import { categoriasDe } from "../caja/reglas-de-descuento.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { anotarCliente, resolverCliente, type ClienteResuelto } from "../clientes/clientes.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import { abiertaEnCaja, deudasDonde } from "./lectura.ts";
export { avisosDeDeuda } from "./lectura.ts";

/** Quien la marca o la da por perdida confirma con su PIN aunque pueda por sí mismo: no se hace con una sesión abierta. */
const CON_PIN = { confirmarConPin: true } as const;
/** Quién ve las deudas: quien cobra, y quien ve los reportes de la sucursal. */
const VEN_DEUDAS: readonly Action[] = ["documento.emitir", "reportes.verSucursal"];

const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
const deudaNoExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa deuda no está en esta sucursal." };
const cuentaCambiada: Rechazo = {
  ok: false,
  motivo: "CONFLICTO",
  mensaje: "Otro equipo cambió esta cuenta mientras la tenías abierta. Revísala y vuelve a intentarlo.",
};

export interface CasosDeudas {
  /** Las deudas de la sucursal: las pendientes y las que terminaron en los últimos `dias` (90 si no se dice). */
  leer(ctx: Contexto, ahora?: number, dias?: number): Promise<Resultado<DeudasDto>>;
  /**
   * «Se fue sin pagar» (`MarcarDeudaCommandSchema`): la cuenta queda INCOBRABLE y la deuda, a nombre de su cliente. Con
   * el PIN de supervisión. Reenviar la misma clave devuelve lo que ya quedó.
   */
  marcar(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<{ cuenta: FamilyAccountDto; deuda: DeudaDto }>>;
  /** Cobrar una deuda cuando vuelve (`CobrarDeudaCommandSchema`): la cuenta del mostrador con lo que consumió. */
  cobrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
  /**
   * Devolverla a las deudas (`DevolverDeudaCommandSchema`): el cliente vino pero no pagó. Su cuenta de cobro sale de la
   * caja (queda como una venta descartada, sin líneas) y la deuda sigue pendiente.
   */
  devolver(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<DeudaDto>>;
  /** Darla por perdida (`PerderDeudaCommandSchema`): administración, con su PIN y un motivo. */
  perder(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<DeudaDto>>;
}

export function casosDeudas(base: Base): CasosDeudas {
  /** El reintento de un mando que chocó con otro equipo (dos altas a la vez): se vuelve a mirar. */
  async function conReintento<T>(intentar: () => Promise<T | Rechazo>, accion: Parameters<typeof auditarRechazo>[2]["action"], ctx: Contexto): Promise<Resultado<T>> {
    const devolver = async (r: T | Rechazo): Promise<Resultado<T>> => {
      if (r !== null && typeof r === "object" && "ok" in r && (r as Rechazo).ok === false) {
        const rechazo = r as Rechazo;
        if (rechazo.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: rechazo.mensaje });
        return rechazo;
      }
      return { ok: true, valor: r as T };
    };
    try {
      return await devolver(await intentar());
    } catch (e) {
      if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
      return devolver(await intentar());
    }
  }

  return {
    async leer(ctx, ahora = Date.now(), dias = 90) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<DeudasDto | Rechazo> => {
        let puede = false;
        for (const a of VEN_DEUDAS) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") puede = true;
        if (!puede) return rechazoDePermiso("DENEGADO");
        const desde = new Date(ahora - dias * 24 * 3_600_000);
        const deudas = await deudasDonde(tx, { branchId: ctx.branchId, OR: [{ outcome: null }, { outcome: { at: { gte: desde } } }] });
        return DeudasSchema.parse({ deudas });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async marcar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = MarcarDeudaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La deuda no se anotó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return conReintento(
        () =>
          base.conTenant(ctx.tenantId, async (tx): Promise<{ cuenta: FamilyAccountDto; deuda: DeudaDto } | Rechazo> => {
            const p = await permisoEn(tx, ctx, "cuenta.deuda");
            if (p === "DENEGADO") return rechazoDePermiso(p);
            // El reintento (se cortó la red) devuelve lo que ya quedó.
            const previa = await tx.customerDebt.findFirst({ where: { operationKey: cmd.idempotencyKey }, select: { id: true, accountId: true } });
            if (previa) {
              if (previa.accountId !== cmd.accountId) return conflictoDeClave;
              const [deuda] = await deudasDonde(tx, { id: previa.id });
              return { cuenta: (await vigenteDe(tx, previa.accountId))!.cuenta, deuda: deuda! };
            }
            const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true, openedBy: true, openedByName: true } });
            if (!fila || fila.branchId !== ctx.branchId) return noExiste;
            const actual = (await vigenteDe(tx, cmd.accountId))!;
            if (actual.version !== cmd.version) return cuentaCambiada;
            const c = actual.cuenta;
            // La cuenta de una familia es de su representante y la de un cumpleaños, de su reserva: se marcan incobrables.
            if (c.kind !== "MESA" && c.kind !== "MOSTRADOR") {
              return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta de una familia del parque o de un cumpleaños no queda en deuda aquí: se marca incobrable." };
            }
            if (uncollectibleProblem(c) !== null) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta no debe nada: no hay deuda que dejar." };
            // La deuda es a nombre de alguien: el cliente de la cuenta, o el que se escribe ahora.
            if (!c.cliente && !cmd.cliente) {
              return {
                ok: false,
                motivo: "INVALIDO",
                mensaje: "La deuda es a nombre de alguien: escribe su cédula, su teléfono y su nombre.",
                problemas: [{ path: ["cliente"], message: "CLIENTE_OBLIGATORIO" }],
              };
            }
            // La autorización se comprueba y se registra antes de tocar la cuenta (§7.3).
            const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cuenta.deuda", autorizacion, ahora, CON_PIN);
            if (!permiso.ok) return permiso;
            let nuevo: ClienteResuelto | null = null;
            if (!c.cliente) {
              const r = await resolverCliente(tx, ctx, cmd.cliente!, ahora);
              if ("ok" in r) return r;
              nuevo = r;
            }
            const autorizador = permiso.autorizadoPor
              ? (await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor }, select: { fullName: true } })).fullName
              : null;
            const quien = await nombreDe(tx, ctx);
            const cliente = nuevo ? await anotarCliente(tx, ctx, c.id, nuevo, ahora, quien.nombre) : c.cliente!;
            const debe = pendienteDe(c, await periodosDeImpuestos(tx), ahora, c.descuento ? await categoriasDe(tx) : () => null, (await ajustesDe(tx, ctx.branchId)).preciosConIva);
            if (debe.amount <= 0n) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta no debe nada: no hay deuda que dejar." };

            const { pendingSince: _, ...sinEspera } = markUncollectible(c);
            const nueva = FamilyAccountSchema.parse({
              ...sinEspera,
              // Una venta del mostrador se llama como su cliente; una mesa o de pie ya se llamaban así.
              ...(c.kind === "MOSTRADOR" && !c.dePie ? { family: cliente.nombre } : {}),
              cliente,
              version: actual.version + 1,
            });
            await guardarVersion(tx, ctx, nueva, { cause: "INCOBRABLE", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
            const deuda = await tx.customerDebt.create({
              data: {
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                accountId: c.id,
                guardianId: cliente.clienteId ?? null,
                fullName: cliente.nombre,
                document: cliente.cedula,
                documentKey: documentKey(cliente.cedula)!,
                phone: cliente.telefono,
                phoneKey: contactKey(cliente.telefono)!,
                amountMinor: debe.amount,
                currency: debe.currency,
                seatedBy: fila.openedBy,
                seatedByName: fila.openedByName,
                markedAt: new Date(ahora),
                markedBy: ctx.quien?.userId ?? null,
                markedByName: quien.nombre,
                authorizedBy: permiso.autorizadoPor,
                authorizedByName: autorizador,
                detail: cmd.detalle ?? null,
                operationKey: cmd.idempotencyKey,
                deviceId: ctx.quien?.deviceId ?? null,
              },
            });
            // El mismo asiento que una incobrable (el turno lo lista en sus excepciones), con la deuda que queda.
            await auditar(tx, ctx, {
              action: "cuenta.deuda",
              entityType: "account",
              entityId: c.id,
              ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
              reason: "SE_FUE_SIN_PAGAR",
              after: {
                orderNumber: c.orderNumber ?? null,
                family: nueva.family,
                pendiente: { minor: String(debe.amount), currency: debe.currency },
                detalle: cmd.detalle ?? null,
                autorizadoPor: autorizador,
                deudaId: deuda.id,
                clienteId: cliente.clienteId ?? null,
                sentadoPor: fila.openedByName,
              },
            });
            const [dto] = await deudasDonde(tx, { id: deuda.id });
            return { cuenta: nueva, deuda: dto! };
          }),
        "cuenta.deuda",
        ctx,
      );
    },

    async cobrar(ctx, entrada, ahora = Date.now()) {
      const v = CobrarDeudaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La deuda no se pasó a la caja: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return conReintento(
        () =>
          base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
            const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
            if (rechazo) return rechazo;
            const d = await tx.customerDebt.findFirst({ where: { id: cmd.deudaId, branchId: ctx.branchId }, include: { outcome: true, collections: true } });
            if (!d) return deudaNoExiste;
            if (d.outcome) return { ok: false, motivo: "CONFLICTO", mensaje: d.outcome.kind === "COBRADA" ? "Esa deuda ya se cobró." : "Esa deuda se dio por perdida." };
            // Si ya está en la caja (se pidió dos veces, o desde dos equipos), es esa: no se abren dos.
            for (const col of d.collections) {
              const v2 = await vigenteDe(tx, col.accountId);
              if (v2 && abiertaEnCaja(v2.cuenta)) return v2.cuenta;
            }
            const original = (await vigenteDe(tx, d.accountId))!.cuenta;
            // Lo que consumió, sin el producto (ya salió del estante) ni el pedido o la estancia de donde vino.
            const lines = chargeableLines(original).map((l) => ({
              id: randomUUID(),
              concept: l.concept,
              kind: l.kind === "EVENTO" ? ("RESTAURANTE" as const) : l.kind,
              amount: l.amount,
              paid: false,
              ...(l.taxCode ? { taxCode: l.taxCode } : {}),
            }));
            const quien = await nombreDe(tx, ctx);
            const orderNumber = await siguienteNumero(tx, ctx);
            const id = randomUUID();
            const instante = new Date(ahora).toISOString();
            const cuenta = FamilyAccountSchema.parse({
              id,
              kind: "MOSTRADOR",
              family: d.fullName,
              mode: "PREPAGO",
              status: "POR_COBRAR",
              openedAt: instante,
              pendingSince: instante,
              sessionIds: [],
              closedSessionIds: [],
              lines,
              // Su descuento y su reparto, para que se cobre exactamente lo que debía.
              ...(original.descuento ? { descuento: original.descuento } : {}),
              ...(original.split && original.split.paid > 0 ? { split: original.split } : {}),
              version: 1,
              orderNumber,
            });
            await tx.account.create({
              data: {
                id,
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                kind: "MOSTRADOR",
                orderNumber,
                openedAt: new Date(ahora),
                openedBy: ctx.quien?.userId ?? null,
                openedByName: quien.nombre,
                deviceId: ctx.quien?.deviceId ?? null,
              },
            });
            await guardarVersion(tx, ctx, cuenta, { cause: "GUARDAR", operationKey: null, ahora, quien: quien.nombre });
            const cliente = await anotarCliente(
              tx,
              ctx,
              id,
              {
                guardianId: d.guardianId,
                nombre: d.fullName,
                cedula: d.document,
                cedulaKey: d.documentKey,
                telefono: d.phone,
                telefonoKey: d.phoneKey,
                nuevo: false,
                completado: false,
              },
              ahora,
              quien.nombre,
            );
            await tx.customerDebtCollection.create({
              data: { tenantId: ctx.tenantId, debtId: d.id, accountId: id, createdAt: new Date(ahora), createdBy: ctx.quien?.userId ?? null, createdByName: quien.nombre },
            });
            await auditar(tx, ctx, { action: "deuda.cobrar", entityType: "customer_debt", entityId: d.id, after: { cuentaCobro: id, orden: orderNumber } });
            return { ...cuenta, cliente };
          }),
        "deuda.cobrar",
        ctx,
      );
    },

    async devolver(ctx, entrada, ahora = Date.now()) {
      const v = DevolverDeudaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La deuda no se devolvió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return conReintento(
        () =>
          base.conTenant(ctx.tenantId, async (tx): Promise<DeudaDto | Rechazo> => {
            const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
            if (rechazo) return rechazo;
            const d = await tx.customerDebt.findFirst({ where: { id: cmd.deudaId, branchId: ctx.branchId }, include: { outcome: true, collections: true } });
            if (!d) return deudaNoExiste;
            if (d.outcome) return { ok: false, motivo: "CONFLICTO", mensaje: d.outcome.kind === "COBRADA" ? "Esa deuda ya se cobró." : "Esa deuda se dio por perdida." };
            const quien = await nombreDe(tx, ctx);
            for (const col of d.collections) {
              const v2 = await vigenteDe(tx, col.accountId);
              if (!v2 || !abiertaEnCaja(v2.cuenta)) continue;
              // Con un pago a medias (una parte cobrada) no se devuelve: se cobra lo que falta.
              if (v2.cuenta.lines.some((x) => x.paid)) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese cobro ya tiene una parte pagada: cobra lo que falta." };
              // Como una venta descartada: sin líneas y fuera de la cola. Lo consumido sigue en la cuenta de la deuda.
              const { pendingSince: _, ...sinEspera } = v2.cuenta;
              const vacia = FamilyAccountSchema.parse({ ...sinEspera, lines: [], status: "ABIERTA", version: v2.version + 1 });
              await guardarVersion(tx, ctx, vacia, { cause: "GUARDAR", operationKey: null, ahora, quien: quien.nombre });
              await auditar(tx, ctx, { action: "deuda.devolver", entityType: "customer_debt", entityId: d.id, after: { cuentaCobro: col.accountId } });
            }
            return (await deudasDonde(tx, { id: d.id }))[0]!;
          }),
        "deuda.devolver",
        ctx,
      );
    },

    async perder(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = PerderDeudaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La deuda no se dio por perdida: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return conReintento(
        () =>
          base.conTenant(ctx.tenantId, async (tx): Promise<DeudaDto | Rechazo> => {
            const p = await permisoEn(tx, ctx, "cuenta.incobrable");
            if (p === "DENEGADO") return rechazoDePermiso(p);
            const previa = await tx.customerDebtOutcome.findFirst({ where: { operationKey: cmd.idempotencyKey }, select: { debtId: true } });
            if (previa) {
              if (previa.debtId !== cmd.deudaId) return conflictoDeClave;
              return (await deudasDonde(tx, { id: previa.debtId }))[0]!;
            }
            const d = await tx.customerDebt.findFirst({ where: { id: cmd.deudaId, branchId: ctx.branchId }, include: { outcome: true, collections: true } });
            if (!d) return deudaNoExiste;
            if (d.outcome) return { ok: false, motivo: "CONFLICTO", mensaje: d.outcome.kind === "COBRADA" ? "Esa deuda ya se cobró." : "Esa deuda ya se dio por perdida." };
            for (const col of d.collections) {
              const v2 = await vigenteDe(tx, col.accountId);
              if (v2 && abiertaEnCaja(v2.cuenta)) {
                return { ok: false, motivo: "CONFLICTO", mensaje: "Esa deuda tiene un cobro abierto en la caja: cóbralo o descártalo antes de darla por perdida." };
              }
            }
            const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cuenta.incobrable", autorizacion, ahora, CON_PIN);
            if (!permiso.ok) return permiso;
            const autorizador = permiso.autorizadoPor
              ? (await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor }, select: { fullName: true } })).fullName
              : null;
            const quien = await nombreDe(tx, ctx);
            await tx.customerDebtOutcome.create({
              data: {
                tenantId: ctx.tenantId,
                debtId: d.id,
                kind: "PERDIDA",
                at: new Date(ahora),
                byUser: ctx.quien?.userId ?? null,
                byName: quien.nombre,
                authorizedBy: permiso.autorizadoPor,
                authorizedByName: autorizador,
                reason: cmd.motivo,
                operationKey: cmd.idempotencyKey,
              },
            });
            await auditar(tx, ctx, {
              action: "deuda.perder",
              entityType: "customer_debt",
              entityId: d.id,
              ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
              reason: cmd.motivo,
              after: { monto: { minor: String(d.amountMinor), currency: d.currency }, cuenta: d.accountId },
            });
            return (await deudasDonde(tx, { id: d.id }))[0]!;
          }),
        "deuda.perder",
        ctx,
      );
    },
  };
}
