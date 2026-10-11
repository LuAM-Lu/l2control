/**
 * El turno de caja en el servidor — B3-1, F4-01, I-06, ADR-009.
 *
 * Un equipo, un turno sin corte Z (la base lo impone). Abrirlo declara el fondo de la gaveta por
 * moneda; el equipo, quién, la hora y el día de negocio los pone el servidor desde la sesión
 * (ADR-017). Sin turno abierto en el equipo no se cobra: el libro de pagos lo exige (`turnoParaCobrar`).
 *
 * El día de negocio es el del local al abrir el turno (ADR-009): lo que se cobre en él cuenta en
 * ese día aunque sea a la 1:30 am. Los cortes X y Z y el arqueo guardado llegan con B3-5.
 *
 * Un día que no se cerró (B3-24, M-38): el día de negocio termina a la hora de los ajustes (4:00 am de fábrica). Desde
 * ahí la caja que siga abierta es de un día anterior: solo resuelve lo de su día (cobra las cuentas abiertas antes de que
 * terminara, carga su papel, corrige lo que ella cobró) y pide cerrarse para todo lo demás. Lo de hoy nunca cuenta en el
 * día de ayer: el 9 de octubre una venta del 10 entró en el día 9 porque nadie cerró la caja.
 *
 * El punto de cobro (B3-9, M-31): en un equipo marcado el turno se abre como siempre. En otro (la laptop de caja no
 * enciende), abrirlo pide el PIN de administración y un motivo; el turno los guarda, la auditoría dice quién autorizó e
 * Inicio lo avisa mientras siga abierto.
 */
import { AbrirTurnoCommandSchema, TurnoSchema, problemasDe, type Rechazo, type Resultado, type TurnoDto } from "@l2/contracts";
import { businessDayAt, businessDayEnd, chargeProblem, openingFloatProblem, type ShiftStatus } from "@l2/domain-cash";
import { money, type CurrencyCode } from "@l2/domain-money";
import { errorDeBase, type Base, type CashShift, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { esSoporte, exigirPermiso, nombreDe, permisoEn } from "../identidad/actor.ts";
import { AutorizacionSchema, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { diaDeNegocioDe } from "../sucursal/ajustes.ts";

export interface CasosTurnos {
  /**
   * Abre el turno del equipo de la sesión con su fondo por moneda. Fuera del punto de cobro, con la autorización de
   * administración (`Autorizacion`: quién, su PIN y el motivo).
   */
  abrir(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<TurnoDto>>;
  /** El turno sin corte Z del equipo de la sesión, o `null`. No exige permiso: la barra lo enseña. */
  delEquipo(ctx: Contexto): Promise<TurnoDto | null>;
  /** Los turnos sin corte Z de la sucursal, para Inicio. Vacío para quien no ve la sucursal. */
  abiertos(ctx: Contexto): Promise<TurnoDto[]>;
}

export type ConFondos = CashShift & { floats: { currency: string; amountMinor: bigint }[] };

/** El turno sin corte Z de un equipo, dentro de una transacción ya abierta. */
export function turnoSinCorteDe(tx: Transaccion, deviceId: string) {
  return tx.cashShift.findFirst({ where: { deviceId, status: { not: "CERRADO_Z" } }, include: { floats: true } });
}

/**
 * B3-15 (M-35): la cortesía y el descuento cambian lo que se cobra, y sin ninguna caja abierta en el local nadie va a
 * cobrar esa cuenta. Se dan con alguna abierta (no en el equipo: la cortesía desde la sala la da supervisión en su
 * teléfono, que no es una caja, M-27). Cobrar, anular, devolver y revertir piden el turno de ESE equipo.
 */
export async function sinCajaAbiertaEnElLocal(tx: Transaccion, ctx: Contexto, que: string): Promise<Rechazo | null> {
  const abiertas = await tx.cashShift.count({ where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" } } });
  return abiertas > 0 ? null : { ok: false, motivo: "NO_DISPONIBLE", mensaje: `Con todas las cajas cerradas no se dan ${que}: abre un turno.` };
}

/**
 * Para qué se pide el turno (B3-24): una caja de un día anterior solo resuelve lo de su día.
 * - `COBRO`: cobrar una cuenta abierta en `abiertaEn` (`null`, un asiento sin cuenta: es de ahora). Lo cargado desde
 *   papel (`desdePapel`) es del corte de su carga, que ya está en este turno.
 * - `CORRECCION`: anular o revertir lo que se cobró en el turno `turnoId`.
 * - `SALIDA`: dinero que sale ahora de la gaveta (una devolución): es de hoy.
 * - `LECTURA`: solo mirar la gaveta.
 */
export type UsoDelTurno =
  | Readonly<{ kind: "COBRO"; abiertaEn: Date | null; desdePapel?: boolean }>
  | Readonly<{ kind: "CORRECCION"; turnoId: string }>
  | Readonly<{ kind: "SALIDA" }>
  | Readonly<{ kind: "LECTURA" }>;

/** Cuándo termina el día de negocio de un turno, con la hora de los ajustes de su sucursal (B3-24). */
export async function finDelTurno(tx: Transaccion, t: Pick<CashShift, "branchId" | "businessDate">): Promise<number> {
  const { zona, finMin } = await diaDeNegocioDe(tx, t.branchId);
  return businessDayEnd(t.businessDate.toISOString().slice(0, 10), zona, finMin);
}

const DIA_EN_PALABRAS = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", timeZone: "UTC" });
/** «9 de octubre»: el día de negocio de un turno, como se dice. */
export const diaEnPalabras = (t: Pick<CashShift, "businessDate">) => DIA_EN_PALABRAS.format(t.businessDate);

/** El rechazo de una caja de un día anterior (B3-24): se dice de qué día es y que se cierre; la caja lleva al cierre. */
export function cajaDeOtroDia(t: Pick<CashShift, "businessDate">): Rechazo {
  return {
    ok: false,
    motivo: "CONFLICTO",
    mensaje: `Esta caja es del ${diaEnPalabras(t)}: ciérrala antes de cobrar.`,
    problemas: [{ path: ["turno"], message: "CAJA_DE_OTRO_DIA" }],
  };
}

/**
 * El turno en el que puede cobrar el equipo de `ctx`, o el rechazo (F4-01, I-14): sin turno abierto no se cobra, con
 * corte Z tampoco, y en una caja de un día anterior solo lo de su día (B3-24, `UsoDelTurno`).
 */
export async function turnoParaCobrar(tx: Transaccion, ctx: Contexto, ahora: number, uso: UsoDelTurno): Promise<CashShift | Rechazo> {
  const turno = ctx.quien?.deviceId ? await turnoSinCorteDe(tx, ctx.quien.deviceId) : null;
  const problema = chargeProblem(turno ? { status: turno.status as ShiftStatus } : null);
  if (problema || !turno) {
    return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Este equipo no tiene turno abierto: sin turno no se cobra. Ábrelo en Turno." };
  }
  if (uso.kind === "LECTURA") return turno;
  const fin = await finDelTurno(tx, turno);
  if (ahora < fin) return turno;
  // Una caja de un día anterior (B3-24): lo de su día, sí; lo de hoy, no, ni nada que salga hoy de la gaveta.
  const deSuDia =
    (uso.kind === "COBRO" && (uso.desdePapel === true || (uso.abiertaEn !== null && uso.abiertaEn.getTime() < fin))) ||
    (uso.kind === "CORRECCION" && uso.turnoId === turno.id);
  return deSuDia ? turno : cajaDeOtroDia(turno);
}

/**
 * `soporteOpera`: si la cuenta de soporte (T-17) abre turnos. En producción no (el turno es del personal del local); en
 * staging sí, para reproducir un error con una copia de la base (M-29). Sin decirlo, no (fail-closed).
 */
export function casosTurnos(base: Base, soporteOpera = false): CasosTurnos {
  return {
    async abrir(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AbrirTurnoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El turno no se abrió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const fondos = v.data.fondos.map((f) => money(BigInt(f.amount.minor), f.currency as CurrencyCode));
      const problema = openingFloatProblem(fondos);
      if (problema) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El turno no se abrió: revisa el fondo.", problemas: [{ path: ["fondos"], message: problema }] };
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<(ConFondos & { fin: number }) | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "turno.abrir");
          if (rechazo) return rechazo;
          if (!soporteOpera && (await esSoporte(tx, ctx))) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "La cuenta de soporte no abre turnos aquí: el turno es del personal del local." };
          }
          // El turno es del equipo (I-06): sin equipo aprobado no hay dónde abrirlo.
          const deviceId = ctx.quien?.deviceId;
          const equipo = deviceId ? await tx.device.findUnique({ where: { id: deviceId } }) : null;
          if (!equipo || equipo.status !== "APROBADO" || !ctx.quien?.userId) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "El turno se abre desde un equipo aprobado, con tu sesión." };
          }
          const abierto = await turnoSinCorteDe(tx, equipo.id);
          if (abierto) {
            // La de un día anterior se dice con su día (B3-24): se cierra esa antes de abrir la de hoy.
            const deAntes = ahora >= (await finDelTurno(tx, abierto));
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: deAntes ? `Este equipo tiene abierta la caja del ${diaEnPalabras(abierto)}: ciérrala antes de abrir la de hoy.` : "Este equipo ya tiene un turno abierto.",
            };
          }
          // Fuera del punto de cobro, el PIN de administración y un motivo (M-31). Administración confirma con el suyo.
          let fuera: { por: string; nombre: string; motivo: string } | null = null;
          if (!equipo.cashPoint) {
            if (autorizacion === undefined) return FUERA_DEL_PUNTO;
            // La cuenta de soporte no abre turnos en producción (T-17): tampoco los autoriza.
            const quiere = AutorizacionSchema.safeParse(autorizacion);
            if (!soporteOpera && quiere.success) {
              const de = await tx.staffUser.findUnique({ where: { id: quiere.data.autorizadorId }, select: { supportLogin: true } });
              if (de?.supportLogin) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "La cuenta de soporte no autoriza turnos aquí: lo autoriza administración del local." };
            }
            const permiso = await exigirPermisoOAutorizacion(tx, ctx, "turno.abrirFueraDelPunto", autorizacion, ahora, { confirmarConPin: true });
            if (!permiso.ok) return permiso;
            const aut = AutorizacionSchema.parse(autorizacion);
            const u = await tx.staffUser.findUniqueOrThrow({ where: { id: aut.autorizadorId }, select: { fullName: true, supportLogin: true } });
            fuera = { por: aut.autorizadorId, nombre: u.supportLogin ? `${u.fullName} (soporte)` : u.fullName, motivo: aut.motivo.trim() };
          }
          const quien = await nombreDe(tx, ctx);
          // El día de negocio lo fijan la zona de la sucursal y la hora en que termina (ADR-009, B4-4, B3-24): a la 1:30 am
          // con el fin a las 4:00 am, el turno es todavía del día anterior.
          const { zona, finMin } = await diaDeNegocioDe(tx, ctx.branchId);
          const dia = businessDayAt(ahora, zona, finMin);
          const turno = await tx.cashShift.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              deviceId: equipo.id,
              pointLabel: equipo.label,
              businessDate: new Date(`${dia}T00:00:00.000Z`),
              status: "ABIERTO",
              openedAt: new Date(ahora),
              openedBy: ctx.quien.userId,
              openedByName: quien.nombre,
              ...(fuera ? { outsidePointBy: fuera.por, outsidePointByName: fuera.nombre, outsidePointReason: fuera.motivo } : {}),
            },
          });
          const floats = [];
          for (const f of fondos) {
            floats.push(await tx.cashShiftFloat.create({ data: { tenantId: ctx.tenantId, shiftId: turno.id, currency: f.currency, amountMinor: f.amount } }));
          }
          await auditar(tx, ctx, {
            action: "turno.abrir",
            entityType: "cash_shift",
            entityId: turno.id,
            ...(fuera ? { authorizedBy: fuera.por, reason: fuera.motivo } : {}),
            after: {
              punto: turno.pointLabel,
              businessDate: dia,
              fondos: floats.map((f) => ({ currency: f.currency, amountMinor: String(f.amountMinor) })),
              ...(fuera ? { fueraDelPunto: { autorizadoPor: fuera.nombre, motivo: fuera.motivo } } : {}),
            },
          });
          return { ...turno, floats, fin: businessDayEnd(dia, zona, finMin) };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "turno.abrir", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: turnoDto(r, r.fin) };
      } catch (e) {
        // Dos aperturas a la vez en el mismo equipo: la base deja una (I-06).
        if (errorDeBase(e)?.motivo === "DUPLICADO") return { ok: false, motivo: "CONFLICTO", mensaje: "Este equipo ya tiene un turno abierto." };
        throw e;
      }
    },

    async abiertos(ctx) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        if ((await permisoEn(tx, ctx, "reportes.verSucursal")) === "DENEGADO") return [];
        const filas = await tx.cashShift.findMany({
          where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" } },
          include: { floats: true },
          orderBy: { openedAt: "asc" },
        });
        const turnos: TurnoDto[] = [];
        for (const t of filas) turnos.push(turnoDto(t, await finDelTurno(tx, t)));
        return turnos;
      });
    },

    async delEquipo(ctx) {
      const deviceId = ctx.quien?.deviceId;
      if (!deviceId) return null;
      return base.conTenant(ctx.tenantId, async (tx) => {
        const t = await turnoSinCorteDe(tx, deviceId);
        return t ? turnoDto(t, await finDelTurno(tx, t)) : null;
      });
    },
  };
}

/** Sin la autorización de administración, un equipo que no es el punto de cobro no abre turno (M-31). */
const FUERA_DEL_PUNTO: Rechazo = {
  ok: false,
  motivo: "NO_PERMITIDO",
  mensaje: "Este equipo no es el punto de cobro: abrir el turno aquí pide el PIN de administración y un motivo.",
};

/** El turno en la forma del contrato, revalidado al salir (fail-closed). `terminaEl`: el fin de su día (B3-24). */
export function turnoDto(t: ConFondos, terminaEl?: number): TurnoDto {
  return TurnoSchema.parse({
    ...(terminaEl === undefined ? {} : { terminaEl: new Date(terminaEl).toISOString() }),
    id: t.id,
    deviceId: t.deviceId,
    punto: t.pointLabel,
    businessDate: t.businessDate.toISOString().slice(0, 10),
    estado: t.status,
    abiertoPor: { id: t.openedBy, name: t.openedByName },
    abiertoEn: t.openedAt.toISOString(),
    fondos: t.floats.map((f) => ({ currency: f.currency, amount: { minor: String(f.amountMinor), currency: f.currency } })),
    fueraDelPunto: t.outsidePointByName && t.outsidePointReason ? { autorizadoPor: t.outsidePointByName, motivo: t.outsidePointReason } : null,
    ...(t.closedAt && t.closedBy && t.closedByName
      ? { cerradoPor: { id: t.closedBy, name: t.closedByName }, cerradoEn: t.closedAt.toISOString() }
      : {}),
  });
}
