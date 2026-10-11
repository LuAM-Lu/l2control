/**
 * Mover efectivo — B3-21 (M-38, W-8).
 *
 * El efectivo que entra o sale de la gaveta sin ser venta: la entrada (sencillo para la caja), la salida (compras para
 * el local, pago a proveedor, adelanto al personal) y el retiro a resguardo, en dólares o en bolívares, con su nota. Es
 * del turno abierto de este equipo y de hoy (una caja de un día anterior no mueve nada). Lo de bolívares se mide en
 * dólares a la tasa vigente (sin tasa no se mueven bolívares, ADR-005). Hasta el tope de Ajustes, con el permiso de la
 * caja; por encima, y todo retiro, con el PIN de supervisión (`efectivo.sobreTope`; quien puede, confirma con el suyo).
 * El adelanto lo firma la persona con su PIN y va a su quincena (`personal.vales`). Lo que sale no puede ser más de lo
 * que la gaveta tiene. Cada uno imprime su comprobante; sin impresora de recibos, el movimiento se hace igual y se dice.
 *
 * La gaveta (`gaveta.ts`) lo cuenta: el arqueo, el vuelto y las devoluciones lo ven; el corte lo lista aparte de las
 * ventas (`movimientosDelTurno`). Nada se corrige ni se borra (`cash_movement` es de solo agregar).
 */
import {
  MovimientoDeEfectivoSchema,
  MovimientoHechoSchema,
  MovimientosDelTurnoSchema,
  MoverEfectivoCommandSchema,
  ReimprimirMovimientoCommandSchema,
  problemasDe,
  type MovimientoDeEfectivoDto,
  type MovimientoHechoDto,
  type MovimientosDelTurnoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { NOMBRE_DEL_MOTIVO, enDolaresConSuTasa, pideAutorizacion, type TipoDeMovimiento } from "@l2/domain-cash";
import { money, type CurrencyCode, type Money } from "@l2/domain-money";
import { calendarDay, frozenRateOf, rateOfDay } from "@l2/domain-rates";
import { errorDeBase, type Base, type CashMovement, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { esSoporte, exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion, firmaDeLaPersona } from "../identidad/autorizacion.ts";
import { historialParaCobrar } from "../dinero/tasas.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeMovimiento } from "../impresion/plantillas.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { esperadoEnGaveta } from "./gaveta.ts";
import { turnoParaCobrar } from "./turnos.ts";

export interface CasosEfectivo {
  /**
   * Mueve efectivo de la gaveta (`MoverEfectivoCommandSchema`). `autorizacion`: el PIN de supervisión cuando lo pide (por
   * encima del tope, o un retiro); quien puede, confirma con el suyo.
   */
  mover(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<MovimientoHechoDto>>;
  /** Lo que se movió en el turno abierto de este equipo, con lo que entró y salió por moneda. */
  delTurno(ctx: Contexto, ahora?: number): Promise<Resultado<MovimientosDelTurnoDto>>;
  /** Reimprime el comprobante de un movimiento: sale como copia, en la impresora de recibos. */
  reimprimir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<MovimientoDeEfectivoDto>>;
}

const comprobante = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Un movimiento en la forma del contrato. */
export function movimientoDto(m: CashMovement): MovimientoDeEfectivoDto {
  return MovimientoDeEfectivoSchema.parse({
    id: m.id,
    numero: m.number,
    tipo: m.kind,
    motivo: m.reason,
    monto: { minor: String(m.amountMinor), currency: m.currency },
    enDolares: { minor: String(m.usdMinor), currency: "USD" },
    nota: m.note,
    persona: m.staffUserId && m.staffName ? { id: m.staffUserId, nombre: m.staffName } : null,
    recibe: m.receivedByName,
    en: m.recordedAt.toISOString(),
    dia: m.businessDate.toISOString().slice(0, 10),
    por: m.recordedByName,
    autorizo: m.authorizedByName,
    turnoId: m.shiftId,
  });
}

/** Lo que se movió en un turno, en orden, con lo que entró y lo que salió por moneda (para el corte y «La gaveta»). */
export async function movimientosDelTurno(tx: Transaccion, shiftId: string): Promise<MovimientosDelTurnoDto> {
  const filas = await tx.cashMovement.findMany({ where: { shiftId }, orderBy: [{ recordedAt: "asc" }, { number: "asc" }] });
  const suma = (tipos: readonly TipoDeMovimiento[]) =>
    (["USD", "VES"] as const).flatMap((currency) => {
      const total = filas.filter((f) => f.currency === currency && tipos.includes(f.kind as TipoDeMovimiento)).reduce((n, f) => n + f.amountMinor, 0n);
      return total > 0n ? [{ minor: String(total), currency }] : [];
    });
  return MovimientosDelTurnoSchema.parse({ movimientos: filas.map(movimientoDto), entradas: suma(["ENTRADA"]), salidas: suma(["SALIDA", "RETIRO"]) });
}

/** El comprobante de un movimiento, en la cola de la impresora de recibos (o por qué no salió). */
async function imprimirComprobante(tx: Transaccion, ctx: Contexto, m: CashMovement, copia: boolean, ahora: number) {
  const dto = movimientoDto(m);
  return encolarEn(
    tx,
    ctx,
    {
      tipo: "MOVIMIENTO",
      titulo: `${NOMBRE_DEL_MOTIVO[dto.motivo]} ${comprobante(m.number)}`,
      copia,
      cashMovementId: m.id,
      documento: documentoDeMovimiento(dto, await ajustesDe(tx, ctx.branchId), copia),
      para: "recibos",
    },
    ahora,
  );
}

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas: [{ path, message }] });

/** `soporteOpera`: si la cuenta de soporte (T-17) mueve efectivo; en producción no, en staging sí (como cobrar). */
export function casosEfectivo(base: Base, soporteOpera = false): CasosEfectivo {
  return {
    async mover(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = MoverEfectivoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: v.error.issues[0]?.message ?? "No se movió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<MovimientoHechoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "efectivo.mover");
          if (rechazo) return rechazo;
          if (!soporteOpera && (await esSoporte(tx, ctx))) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "La cuenta de soporte no mueve efectivo aquí: lo hace el personal del local." };
          }
          // Un reintento con la misma clave devuelve el que ya se hizo.
          const hecho = await tx.cashMovement.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (hecho) return MovimientoHechoSchema.parse({ movimiento: movimientoDto(hecho), comprobanteNoImpreso: null });

          // De la gaveta de HOY: hace falta el turno de este equipo (una caja de un día anterior no mueve nada).
          const turno = await turnoParaCobrar(tx, ctx, ahora, { kind: "SALIDA" });
          if ("ok" in turno) {
            const deOtroDia = turno.problemas?.some((p) => p.message === "CAJA_DE_OTRO_DIA");
            return deOtroDia ? { ...turno, mensaje: turno.mensaje.replace("antes de cobrar", "antes de mover efectivo") } : turno;
          }

          // Lo de bolívares, en dólares a la tasa vigente: sin ella no se mueve (fail-closed).
          const ajustes = await ajustesDe(tx, ctx.branchId);
          const monto = money(BigInt(cmd.monto.minor), cmd.monto.currency as CurrencyCode);
          let tasa: { id: string; value: string } | null = null;
          let enDolares: Money | null = monto;
          if (monto.currency === "VES") {
            const { registros, feriados } = await historialParaCobrar(tx);
            const instante = new Date(ahora).toISOString();
            const r = rateOfDay(registros, "USD/VES", calendarDay(instante, ajustes.zonaHoraria), instante, feriados);
            if (!r) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "No hay tasa del BCV vigente: sin ella no se mueven bolívares." };
            tasa = { id: r.id, value: r.value };
            enDolares = enDolaresConSuTasa(monto, frozenRateOf(r));
          }
          if (!enDolares || enDolares.amount <= 0n) return invalido("Es menos de un centavo de dólar.", ["monto"], "MUY_POCO");

          // Lo que sale no puede ser más de lo que la gaveta tiene.
          if (cmd.tipo !== "ENTRADA") {
            const hay = await esperadoEnGaveta(tx, turno.id);
            if ((hay.get(monto.currency as "USD" | "VES")?.amount ?? 0n) < monto.amount) {
              return { ok: false, motivo: "CONFLICTO", mensaje: `En la gaveta de este turno no hay ${monto.currency === "USD" ? "dólares" : "bolívares"} suficientes para sacarlo.`, problemas: [{ path: ["monto"], message: "GAVETA_SIN_EFECTIVO" }] };
            }
          }

          // Por encima del tope, y todo retiro, con el PIN de supervisión.
          let autorizo: { id: string; nombre: string } | null = null;
          const tope = money(BigInt(ajustes.topeMoverEfectivo.minor), ajustes.topeMoverEfectivo.currency as CurrencyCode);
          if (pideAutorizacion(cmd.tipo, enDolares, tope)) {
            const permiso = await exigirPermisoOAutorizacion(tx, ctx, "efectivo.sobreTope", autorizacion, ahora, { confirmarConPin: true });
            if (!permiso.ok) return permiso;
            if (permiso.autorizadoPor) {
              const u = await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor }, select: { fullName: true } });
              autorizo = { id: permiso.autorizadoPor, nombre: u.fullName };
            }
          }

          // El adelanto lo firma la persona con su PIN.
          let persona: { id: string; nombre: string } | null = null;
          if (cmd.persona) {
            const firmo = await firmaDeLaPersona(tx, ctx, "efectivo.mover", cmd.persona, "Adelanto", ahora);
            if (!firmo.ok) return firmo;
            persona = { id: firmo.id, nombre: firmo.nombre };
          }

          // El número del comprobante, continuo en la sucursal.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`efectivo:${ctx.branchId}`}, 0))::text AS candado`;
          const ultimo = await tx.cashMovement.aggregate({ where: { branchId: ctx.branchId }, _max: { number: true } });
          const quien = await nombreDe(tx, ctx);
          const m = await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              shiftId: turno.id,
              businessDate: turno.businessDate,
              number: (ultimo._max.number ?? 0) + 1,
              kind: cmd.tipo,
              reason: cmd.motivo,
              currency: monto.currency,
              amountMinor: monto.amount,
              usdMinor: enDolares.amount,
              rateId: tasa?.id ?? null,
              rateValue: tasa?.value ?? null,
              note: cmd.nota,
              staffUserId: persona?.id ?? null,
              staffName: persona?.nombre ?? null,
              receivedByName: cmd.recibe ?? null,
              operationKey: cmd.idempotencyKey,
              recordedAt: new Date(ahora),
              recordedBy: ctx.quien?.userId ?? null,
              recordedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              authorizedBy: autorizo?.id ?? null,
              authorizedByName: autorizo?.nombre ?? null,
            },
          });
          await auditar(tx, ctx, {
            action: "efectivo.mover",
            entityType: "cash_movement",
            entityId: m.id,
            ...(autorizo ? { authorizedBy: autorizo.id } : {}),
            reason: cmd.nota,
            after: {
              movimiento: cmd.tipo,
              numero: m.number,
              monto: cmd.monto,
              ...(monto.currency !== "USD" ? { enDolares: { minor: String(enDolares.amount), currency: "USD" } } : {}),
              ...(persona ? { persona: persona.nombre } : {}),
              ...(cmd.recibe ? { recibe: cmd.recibe } : {}),
              detalle: NOMBRE_DEL_MOTIVO[cmd.motivo],
            },
          });
          const trabajo = await imprimirComprobante(tx, ctx, m, false, ahora);
          return MovimientoHechoSchema.parse({ movimiento: movimientoDto(m), comprobanteNoImpreso: "ok" in trabajo ? trabajo.mensaje : null });
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "efectivo.mover", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos intentos a la vez con la misma clave: la base deja uno, y el segundo lo devuelve.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async delTurno(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<MovimientosDelTurnoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "efectivo.mover");
        if (rechazo) return rechazo;
        const turno = await turnoParaCobrar(tx, ctx, ahora, { kind: "LECTURA" });
        if ("ok" in turno) return turno;
        return movimientosDelTurno(tx, turno.id);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async reimprimir(ctx, entrada, ahora = Date.now()) {
      const v = ReimprimirMovimientoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se reimprimió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<MovimientoDeEfectivoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "efectivo.mover");
        if (rechazo) return rechazo;
        const m = await tx.cashMovement.findUnique({ where: { id: v.data.movimientoId } });
        if (!m || m.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese movimiento no existe en esta sucursal." };
        const trabajo = await imprimirComprobante(tx, ctx, m, true, ahora);
        if ("ok" in trabajo) return trabajo;
        await auditar(tx, ctx, { action: "efectivo.reimprimir", entityType: "cash_movement", entityId: m.id, after: { numero: m.number, detalle: NOMBRE_DEL_MOTIVO[m.reason as keyof typeof NOMBRE_DEL_MOTIVO] } });
        return movimientoDto(m);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "efectivo.reimprimir", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}
