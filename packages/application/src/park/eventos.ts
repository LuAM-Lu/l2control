/**
 * Cumpleaños en el servidor: los paquetes y las reservas — B10-1, V-10, D-EVT.
 *
 * Quién decide qué:
 *  · el contrato (`CatalogoEventosSchema`, `ReservarEventoCommandSchema`): la forma de un paquete y de
 *    una reserva (precio en dólares, mínimo ≤ máximo, horario que empieza antes de terminar);
 *  · el dominio (`anticipoDe`, `reservaProblem`, `cancelReservationProblem`): cuánto es el anticipo y
 *    el saldo, si la reserva cabe (fecha, invitados, aforo del horario) y si se puede cancelar;
 *  · este archivo: la versión optimista del catálogo, los nombres de lo que incluye cada paquete (del
 *    catálogo de productos, no de la pantalla), el aforo del tarifario vigente y la **cuenta del
 *    evento**, que nace con el anticipo en la cola de la caja en la misma transacción que la reserva.
 *
 * En qué va una reserva lo dice su cuenta: en la cola, el anticipo está por cobrar; cobrada, la reserva
 * está confirmada; sin consumo, se canceló. Devolver un anticipo cobrado es anular su cobro en la caja
 * (DEC-24): la cuenta vuelve a la cola y entonces la reserva se puede cancelar.
 */
import { randomUUID } from "node:crypto";
import {
  AgendaEventosQuerySchema,
  AgendaEventosSchema,
  CancelarReservaCommandSchema,
  CatalogoEventosPublicadoSchema,
  CatalogoEventosSchema,
  EmpezarEventoCommandSchema,
  EntradaEventoCommandSchema,
  FamilyAccountSchema,
  PaqueteEventoSchema,
  problemasDe,
  PublicarCatalogoEventosCommandSchema,
  ReservaEventoSchema,
  ReservarEventoCommandSchema,
  ParkTermsSchema,
  TarifarioSchema,
  type AccountLineDto,
  type AgendaEventosDto,
  type CatalogoEventosDto,
  type CatalogoEventosPublicadoDto,
  type CheckInResult,
  type EstadoReserva,
  type FamilyAccountDto,
  type ReservaEventoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { cancelReservation, cancelReservationProblem, type CancelReservationProblem } from "@l2/domain-cash";
import type { Action } from "@l2/domain-identity";
import { money, toMajor } from "@l2/domain-money";
import { anticipoDe, anticipoValido, paqueteSobreAforo, reservaProblem, type ProblemaDeReserva } from "@l2/domain-park";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import { percentFromBasisPoints } from "@l2/domain-tax";
import { errorDeBase, type Base, type EventCatalogVersion, type Prisma, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { catalogoEn, claveSecundaria, guardarVersion, siguienteNumero, vigenteDe } from "../caja/cuentas.ts";
import { asentarExistencias, comprobarExistencias } from "../inventario/existencias.ts";
import { comprobarPulserasYAforo, entradaHecha, tarifarioDe } from "./parque.ts";
import { zonaDe } from "../sucursal/ajustes.ts";
import { representanteDeLaEntrada } from "./representantes.ts";

export interface CasosEventos {
  /**
   * Los paquetes de cumpleaños vigentes y el anticipo, con el aforo del tarifario; `catalogo: null` si
   * nunca se publicaron. No exige persona: es lo que ofrece la reserva y lo que enseña Ajustes.
   */
  leerCatalogo(ctx: Contexto): Promise<CatalogoEventosPublicadoDto>;
  /** Publica el catálogo como versión nueva (`PublicarCatalogoEventosCommandSchema`): `catalogo.modificar`. */
  publicarCatalogo(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CatalogoEventosPublicadoDto>>;
  /** Las reservas entre dos días (`AgendaEventosQuerySchema`), con el día de hoy del local. */
  agenda(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<AgendaEventosDto>>;
  /** Los cumpleaños de hoy que siguen en pie: el aviso de Inicio y de la apertura del turno. */
  deHoy(ctx: Contexto, ahora?: number): Promise<Resultado<AgendaEventosDto>>;
  /** Reserva un cumpleaños (`ReservarEventoCommandSchema`) y abre su cuenta con el anticipo en la cola. */
  reservar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReservaEventoDto>>;
  /** Cancela una reserva cuyo anticipo no se ha cobrado (`CancelarReservaCommandSchema`). */
  cancelar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReservaEventoDto>>;
  /**
   * Empieza el día del evento (`EmpezarEventoCommandSchema`, B10-2): con el anticipo cobrado y en su día, abre
   * la cuenta del día con el saldo y lo que incluye el paquete, que sale del estante (ADR-023).
   */
  empezar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReservaEventoDto>>;
  /**
   * Entran invitados con sus pulseras (`EntradaEventoCommandSchema`, B10-2): a la cuenta del día (si no había
   * empezado, empieza), sin paquete ni cobro, hasta los invitados reservados y dentro del aforo.
   */
  entrarInvitados(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CheckInResult>>;
}

/** Quién ve la agenda: quien reserva, quien cobra, quien lleva el parque y la dirección del local. */
const VEN_AGENDA: readonly Action[] = ["evento.reservar", "documento.emitir", "parque.checkIn", "reportes.verSucursal"];

const MENSAJE_RESERVA: Record<ProblemaDeReserva, string> = {
  FECHA_PASADA: "Esa fecha ya pasó: un cumpleaños se reserva para hoy o más adelante.",
  HORARIO_INVALIDO: "El horario no es válido: el evento empieza antes de terminar y dentro del día.",
  INVITADOS_FUERA_DEL_PAQUETE: "Los invitados no caben en ese paquete: mira su mínimo y su máximo.",
  AFORO_DEL_HORARIO: "Con los otros cumpleaños de ese horario se pasa del aforo: elige otra hora u otro día.",
};
const RUTA_RESERVA: Record<ProblemaDeReserva, string> = {
  FECHA_PASADA: "fecha",
  HORARIO_INVALIDO: "fin",
  INVITADOS_FUERA_DEL_PAQUETE: "invitados",
  AFORO_DEL_HORARIO: "inicio",
};

const MENSAJE_CANCELAR: Record<CancelReservationProblem, string> = {
  NO_ES_EVENTO: "Esa cuenta no es de un cumpleaños.",
  YA_CANCELADA: "Esa reserva ya está cancelada.",
  ANTICIPO_COBRADO: "El anticipo ya se cobró: para devolverlo, anula su cobro en la caja y después cancela la reserva.",
};

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas: [{ path, message }] });
const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa reserva no existe en esta sucursal." };
const sinCatalogo: Rechazo = {
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: "El local no tiene paquetes de cumpleaños: se cargan en Ajustes → Cumpleaños.",
};

type Vigente = Readonly<{ fila: EventCatalogVersion | null; catalogo: CatalogoEventosDto | null }>;

export function casosEventos(base: Base): CasosEventos {
  return {
    async leerCatalogo(ctx) {
      return base.conTenant(ctx.tenantId, async (tx) => publicado(await catalogoVigente(tx, ctx.branchId), await aforoDe(tx, ctx.branchId)));
    },

    async publicarCatalogo(ctx, entrada, ahora = Date.now()) {
      const v = PublicarCatalogoEventosCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "Los paquetes no se publicaron: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const { sobre } = v.data;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<(Vigente & { aforo: number | null }) | Rechazo> => {
          // Los precios del local son configuración: administración, con elevación (como el tarifario).
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          if (!ctx.quien?.userId) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Los paquetes los publica una persona, con su sesión." };
          await candadoDeEventos(tx, ctx.branchId);
          const antes = await catalogoVigente(tx, ctx.branchId);
          const version = antes.fila?.version ?? null;
          if (version !== sobre) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Alguien publicó otros paquetes mientras editabas. Revisa los vigentes antes de publicar." };
          }

          // Un paquete no se borra: se retira (las reservas lo nombran por su id).
          const nuevos = new Set(v.data.catalogo.paquetes.map((p) => p.id));
          const borrado = (antes.catalogo?.paquetes ?? []).find((p) => !nuevos.has(p.id));
          if (borrado) {
            return invalido(`«${borrado.name}» no se borra: se retira (las reservas hechas lo nombran).`, ["catalogo", "paquetes"], "PAQUETE_DESAPARECE");
          }

          // Lo que incluye cada paquete se nombra como lo nombra el catálogo de productos hoy.
          const productoEn = await catalogoEn(tx, ahora);
          const paquetes = [];
          for (const [i, p] of v.data.catalogo.paquetes.entries()) {
            const incluye = [];
            for (const [j, x] of p.incluye.entries()) {
              const producto = productoEn(x.productId);
              if (!producto) {
                return invalido(`«${p.name}» incluye un producto que ya no se vende: quítalo del paquete.`, ["catalogo", "paquetes", i, "incluye", j, "productId"], "PRODUCTO_QUE_NO_SE_VENDE");
              }
              incluye.push({ productId: x.productId, name: producto.name, quantity: x.quantity });
            }
            paquetes.push({ ...p, incluye });
          }
          const v2 = CatalogoEventosSchema.safeParse({ anticipoBps: v.data.catalogo.anticipoBps, paquetes });
          if (!v2.success) {
            return { ok: false, motivo: "INVALIDO", mensaje: "Los paquetes no se publicaron: hay datos que corregir.", problemas: problemasDe(v2.error).map((x) => ({ ...x, path: ["catalogo", ...x.path] })) };
          }
          const catalogo = v2.data;

          // Ningún paquete admite más invitados que el aforo del parque (D-EVT).
          const aforo = await aforoDe(tx, ctx.branchId);
          if (aforo === null) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El parque no tiene tarifario publicado: sin aforo no se cargan paquetes." };
          const grande = paqueteSobreAforo(catalogo.paquetes.filter((p) => p.active), aforo);
          if (grande) {
            const i = catalogo.paquetes.indexOf(grande);
            return invalido(`«${grande.name}» admite ${grande.maxInvitados} invitados y el aforo es de ${aforo}.`, ["catalogo", "paquetes", i, "maxInvitados"], "SOBRE_EL_AFORO");
          }

          // Publicar lo mismo no añade versión.
          if (antes.catalogo && JSON.stringify(antes.catalogo) === JSON.stringify(catalogo)) return { ...antes, aforo };

          const autor = await nombreDe(tx, ctx);
          const fila = await tx.eventCatalogVersion.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              version: (version ?? 0) + 1,
              content: catalogo,
              publishedAt: new Date(ahora),
              publishedBy: autor.id,
              publishedByName: autor.nombre,
            },
          });
          await auditar(tx, ctx, {
            action: "evento.catalogo",
            entityType: "event_catalog_version",
            entityId: fila.id,
            ...(antes.catalogo ? { before: resumenDeCatalogo(version, antes.catalogo) } : {}),
            after: resumenDeCatalogo(fila.version, catalogo),
          });
          return { fila, catalogo, aforo };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "evento.catalogo", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: publicado(r, r.aforo) };
      } catch (e) {
        switch (errorDeBase(e)?.motivo) {
          case "DUPLICADO":
            return { ok: false, motivo: "CONFLICTO", mensaje: "Alguien publicó otros paquetes al mismo tiempo. Revisa los vigentes antes de publicar." };
          case "REFERENCIA_INVALIDA":
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "La sucursal no existe en este local." };
          default:
            throw e;
        }
      }
    },

    async agenda(ctx, entrada, ahora = Date.now()) {
      const v = AgendaEventosQuerySchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La agenda no se pudo leer: revisa las fechas.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<AgendaEventosDto | Rechazo> => {
        if (!(await puedeAlguna(tx, ctx, VEN_AGENDA))) return rechazoDePermiso("DENEGADO");
        const zona = await zonaDe(tx, ctx.branchId);
        const hoy = calendarDay(new Date(ahora).toISOString(), zona);
        const reservas = await reservasDe(tx, { branchId: ctx.branchId, eventDate: { gte: new Date(v.data.desde), lte: new Date(v.data.hasta) } });
        return AgendaEventosSchema.parse({ hoy, ahora: minutoDelDia(ahora, hoy, zona), reservas });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async deHoy(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<AgendaEventosDto | Rechazo> => {
        if (!(await puedeAlguna(tx, ctx, VEN_AGENDA))) return rechazoDePermiso("DENEGADO");
        const zona = await zonaDe(tx, ctx.branchId);
        const hoy = calendarDay(new Date(ahora).toISOString(), zona);
        const reservas = await reservasDe(tx, { branchId: ctx.branchId, eventDate: new Date(hoy) });
        return AgendaEventosSchema.parse({ hoy, ahora: minutoDelDia(ahora, hoy, zona), reservas: reservas.filter((x) => x.estado !== "CANCELADA") });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async reservar(ctx, entrada, ahora = Date.now()) {
      const v = ReservarEventoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La reserva no se hizo: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<ReservaEventoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "evento.reservar");
          if (rechazo) return rechazo;
          // Un doble clic devuelve la reserva que ya se hizo con esta clave (I-11).
          const previa = await tx.eventReservation.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return (await reservasDe(tx, { id: previa.id }))[0]!;

          const { catalogo, fila: filaCatalogo } = await catalogoVigente(tx, ctx.branchId);
          if (!catalogo || !filaCatalogo) return sinCatalogo;
          const paquete = catalogo.paquetes.find((p) => p.id === cmd.paqueteId && p.active);
          if (!paquete) return invalido("Ese paquete no está a la venta: elige otro.", ["paqueteId"], "PAQUETE_RETIRADO");
          const aforo = await aforoDe(tx, ctx.branchId);
          if (aforo === null) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El parque no tiene tarifario publicado: sin aforo no se reserva." };

          // Dos reservas a la vez para el mismo horario se ordenan: la segunda ve a la primera.
          await candadoDeEventos(tx, ctx.branchId);
          const hoy = calendarDay(new Date(ahora).toISOString(), await zonaDe(tx, ctx.branchId));
          const otros = (await reservasDe(tx, { branchId: ctx.branchId, eventDate: new Date(cmd.fecha) })).filter((x) => x.estado !== "CANCELADA");
          const problema = reservaProblem({
            reserva: { fecha: cmd.fecha, inicio: cmd.inicio, fin: cmd.fin, invitados: cmd.invitados },
            hoy,
            paquete,
            otros: otros.map((o) => ({ fecha: o.fecha, inicio: o.inicio, fin: o.fin, invitados: o.invitados })),
            aforo,
          });
          if (problema) return invalido(MENSAJE_RESERVA[problema], [RUTA_RESERVA[problema]], problema);

          const precio = money(BigInt(paquete.price.minor), "USD");
          const { anticipo, saldo } = anticipoDe(precio, catalogo.anticipoBps);
          if (!anticipoValido(anticipo, precio)) return invalido("Con ese porcentaje el anticipo sale en cero: revisa el anticipo en Ajustes → Cumpleaños.", ["paqueteId"], "ANTICIPO_EN_CERO");

          const familia = await representanteDeLaEntrada(tx, ctx, cmd, ahora);
          if ("ok" in familia) return familia;

          const quien = await nombreDe(tx, ctx);
          const instante = new Date(ahora).toISOString();
          const reservaId = randomUUID();
          const accountId = randomUUID();
          const orderNumber = await siguienteNumero(tx, ctx);
          const cuenta = FamilyAccountSchema.parse({
            id: accountId,
            kind: "EVENTO",
            version: 1,
            family: familia.fullName,
            // El anticipo se paga al reservar.
            mode: "PREPAGO",
            status: "POR_COBRAR",
            orderNumber,
            openedAt: instante,
            pendingSince: instante,
            sessionIds: [],
            closedSessionIds: [],
            eventId: reservaId,
            lines: [
              {
                id: `anticipo-${reservaId}`,
                concept: `Anticipo ${porcentaje(catalogo.anticipoBps)} · Cumpleaños de ${cmd.cumpleanero} (${diaCorto(cmd.fecha)})`.slice(0, 80),
                kind: "EVENTO",
                amount: { minor: String(anticipo.amount), currency: "USD" },
                paid: false,
              },
            ],
          });
          await tx.account.create({
            data: {
              id: accountId,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              kind: "EVENTO",
              orderNumber,
              openedAt: new Date(ahora),
              openedBy: ctx.quien?.userId ?? null,
              openedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            },
          });
          await guardarVersion(tx, ctx, cuenta, { cause: "RESERVA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          const { active: _, ...copiado } = paquete;
          await tx.eventReservation.create({
            data: {
              id: reservaId,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId,
              guardianId: familia.id,
              eventDate: new Date(cmd.fecha),
              startsMinute: cmd.inicio,
              endsMinute: cmd.fin,
              guests: cmd.invitados,
              honoree: cmd.cumpleanero,
              honoreeAge: cmd.edad ?? null,
              package: copiado,
              catalogVersion: filaCatalogo.version,
              depositBps: catalogo.anticipoBps,
              depositMinor: anticipo.amount,
              balanceMinor: saldo.amount,
              currency: "USD",
              createdAt: new Date(ahora),
              createdBy: ctx.quien?.userId ?? null,
              createdByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              operationKey: cmd.idempotencyKey,
            },
          });
          await auditar(tx, ctx, {
            action: "evento.reservar",
            entityType: "event_reservation",
            entityId: reservaId,
            after: {
              orderNumber,
              fecha: cmd.fecha,
              horario: [cmd.inicio, cmd.fin],
              invitados: cmd.invitados,
              paquete: paquete.name,
              catalogo: filaCatalogo.version,
              anticipo: { minor: String(anticipo.amount), currency: "USD" },
              saldo: { minor: String(saldo.amount), currency: "USD" },
            },
          });
          return (await reservasDe(tx, { id: reservaId }))[0]!;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "evento.reservar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Un doble toque que llegó por dos vías: se vuelve a mirar con lo que ya quedó.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async cancelar(ctx, entrada, ahora = Date.now()) {
      const v = CancelarReservaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La reserva no se canceló: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<ReservaEventoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "evento.reservar");
          if (rechazo) return rechazo;
          const reserva = await tx.eventReservation.findFirst({ where: { id: cmd.reservaId, branchId: ctx.branchId } });
          if (!reserva) return noExiste;
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.accountId !== reserva.accountId || previa.cause !== "CANCELAR_RESERVA") {
              return { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otra operación." };
            }
            return (await reservasDe(tx, { id: reserva.id }))[0]!;
          }

          const actual = (await vigenteDe(tx, reserva.accountId))!;
          const problema = cancelReservationProblem(actual.cuenta);
          if (problema) return { ok: false, motivo: "CONFLICTO", mensaje: MENSAJE_CANCELAR[problema] };

          const { pendingSince: _, ...cerrada } = cancelReservation(actual.cuenta);
          const nueva = FamilyAccountSchema.parse({ ...cerrada, version: actual.version + 1 });
          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, nueva, { cause: "CANCELAR_RESERVA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: "evento.cancelar",
            entityType: "event_reservation",
            entityId: reserva.id,
            before: { estado: "ANTICIPO_POR_COBRAR", cuenta: actual.cuenta.orderNumber },
            after: { estado: "CANCELADA", cuenta: nueva.orderNumber, anticipo: actual.cuenta.lines[0]?.amount ?? null },
          });
          return (await reservasDe(tx, { id: reserva.id }))[0]!;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "evento.cancelar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // La caja cobró el anticipo a la vez (misma versión de la cuenta): se vuelve a mirar y lo dice.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },
    async empezar(ctx, entrada, ahora = Date.now()) {
      const v = EmpezarEventoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El cumpleaños no empezó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<ReservaEventoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "evento.reservar");
          if (rechazo) return rechazo;
          const reserva = await tx.eventReservation.findFirst({ where: { id: cmd.reservaId, branchId: ctx.branchId } });
          if (!reserva) return noExiste;
          const previo = await tx.eventDay.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previo && previo.reservationId !== reserva.id) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otra operación." };
          const dia = await diaDelEvento(tx, ctx, reserva, ahora, cmd.idempotencyKey);
          if ("ok" in dia) return dia;
          return (await reservasDe(tx, { id: reserva.id }))[0]!;
        });
      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "evento.empezar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos toques a la vez: el segundo encuentra el día ya empezado.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async entrarInvitados(ctx, entrada, ahora = Date.now()) {
      const v = EntradaEventoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La entrada no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CheckInResult | Rechazo> => {
          // Es una entrada al parque: la hace quien lleva la puerta, como la de cualquier familia.
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
          if (rechazo) return rechazo;
          // Un reintento de la misma entrada devuelve la que ya se hizo.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.cause === "ENTRADA" ? entradaHecha(tx, cmd.idempotencyKey, previa.accountId) : { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otra operación." };

          const reserva = await tx.eventReservation.findFirst({ where: { id: cmd.reservaId, branchId: ctx.branchId }, include: { guardian: { select: { fullName: true } } } });
          if (!reserva) return noExiste;
          const tarifario = await tarifarioDe(tx, ctx);
          if (!tarifario) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El parque no tiene tarifario publicado: sin aforo no entra nadie." };

          // Si el día no había empezado, empieza ahora: los invitados entran a su cuenta.
          const dia = await diaDelEvento(tx, ctx, reserva, ahora, claveSecundaria(cmd.idempotencyKey, reserva.id));
          if ("ok" in dia) return dia;
          if (ahora >= dia.terminaEn) return { ok: false, motivo: "CONFLICTO", mensaje: "El cumpleaños ya terminó: quien llegue ahora entra como visita normal." };
          // Con el saldo dado por incobrable, el evento no admite a nadie más.
          if ((await vigenteDe(tx, dia.accountId))!.cuenta.status === "INCOBRABLE") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "El saldo de este cumpleaños se dio por incobrable: no entran más invitados." };
          }

          // Entran los invitados reservados, no más: quien sobra entra como visita normal (y paga su paquete).
          const yaEntraron = await tx.parkSession.count({ where: { accountId: dia.accountId } });
          if (yaEntraron + cmd.pulseras.length > reserva.guests) {
            const quedan = Math.max(0, reserva.guests - yaEntraron);
            return invalido(
              quedan === 0
                ? `Ya entraron los ${reserva.guests} invitados reservados: quien llegue ahora entra como visita normal.`
                : `Se reservó para ${reserva.guests} invitados y ya entraron ${yaEntraron}: caben ${quedan} más. El resto entra como visita normal.`,
              ["pulseras"],
              "INVITADOS_COMPLETOS",
            );
          }
          const pulseras = await comprobarPulserasYAforo(tx, ctx, cmd.pulseras, tarifario.tarifario.policy.capacityLimit, ahora, (i) => ["pulseras", i]);
          if (pulseras) return pulseras;

          // Su tiempo es el del evento: hasta su hora de fin. No se cobra tiempo de más (lo paga el paquete); al
          // terminar, en sala pasan a «en gracia» como aviso, durante todo el día.
          const minutos = Math.max(1, Math.ceil((dia.terminaEn - ahora) / 60_000));
          const terms = ParkTermsSchema.parse({
            ...tarifario.tarifario.policy,
            graceMinutes: Math.max(tarifario.tarifario.policy.graceMinutes, 12 * 60),
            penaltyPricePerBlock: { minor: "0", currency: "USD" },
          });
          const quien = await nombreDe(tx, ctx);
          const sesiones = cmd.pulseras.map(() => randomUUID());
          const nombre = `Cumpleaños de ${reserva.honoree}`.slice(0, 40);
          const actual = (await vigenteDe(tx, dia.accountId))!;
          const cuenta = FamilyAccountSchema.parse({
            ...actual.cuenta,
            version: actual.version + 1,
            sessionIds: [...actual.cuenta.sessionIds, ...sesiones],
          });
          await guardarVersion(tx, ctx, cuenta, { cause: "ENTRADA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await tx.parkSession.createMany({
            data: cmd.pulseras.map((codigo, i) => ({
              id: sesiones[i]!,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId: dia.accountId,
              guardianId: reserva.guardianId,
              kidId: null,
              wristbandCode: codigo,
              packageId: `cumple-${reserva.id}`,
              eventReservationId: reserva.id,
              packageName: nombre,
              mode: "PREPAGO",
              durationMinutes: minutos,
              priceMinor: 0n,
              currency: "USD",
              terms,
              tariffVersion: tarifario.version,
              startedAt: new Date(ahora),
              openedBy: ctx.quien?.userId ?? null,
              openedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              checkInKey: cmd.idempotencyKey,
              status: "ACTIVA",
            })),
          });
          await auditar(tx, ctx, {
            action: "evento.entrada",
            entityType: "event_reservation",
            entityId: reserva.id,
            after: { cuenta: cuenta.orderNumber, invitados: cmd.pulseras.length, entraron: yaEntraron + cmd.pulseras.length, reservados: reserva.guests, pulseras: cmd.pulseras },
          });
          return entradaHecha(tx, cmd.idempotencyKey, dia.accountId);
        });
      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "evento.entrada", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos entradas a la vez con la misma clave o una pulsera que acaba de ocuparse: se vuelve a mirar.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },
  };
}


type FilaDeReserva = NonNullable<Awaited<ReturnType<Transaccion["eventReservation"]["findFirst"]>>>;

/**
 * El día del evento de una reserva: el que ya empezó o el que empieza ahora (B10-2). Empieza solo en su día,
 * con el anticipo cobrado y antes de su hora de fin. Nace la cuenta del día con el saldo y lo que incluye el
 * paquete, una línea por unidad a $ 0 (lo paga el paquete), que sale del estante (ADR-023): si algo no alcanza,
 * no empieza. `clave` es la de la operación que lo empieza (la versión de la cuenta y el día la llevan).
 */
async function diaDelEvento(
  tx: Transaccion,
  ctx: Contexto,
  reserva: FilaDeReserva,
  ahora: number,
  clave: string,
): Promise<Readonly<{ accountId: string; terminaEn: number }> | Rechazo> {
  const zona = await zonaDe(tx, ctx.branchId);
  const fecha = reserva.eventDate.toISOString().slice(0, 10);
  const terminaEn = startOfDay(fecha, zona) + reserva.endsMinute * 60_000;
  const yaEmpezo = await tx.eventDay.findFirst({ where: { reservationId: reserva.id } });
  if (yaEmpezo) return { accountId: yaEmpezo.accountId, terminaEn };

  const hoy = calendarDay(new Date(ahora).toISOString(), zona);
  if (fecha !== hoy) return { ok: false, motivo: "CONFLICTO", mensaje: `Ese cumpleaños es el ${fecha.split("-").reverse().join("/")}: empieza ese día.` };
  const anticipo = (await vigenteDe(tx, reserva.accountId))!.cuenta;
  if (anticipo.status === "SIN_CONSUMO") return { ok: false, motivo: "CONFLICTO", mensaje: "Esa reserva está cancelada." };
  if (anticipo.status !== "COBRADA") {
    return { ok: false, motivo: "CONFLICTO", mensaje: `Primero se cobra el anticipo en la caja (cuenta #${String(anticipo.orderNumber).padStart(4, "0")}): sin él, el cumpleaños no empieza.` };
  }
  if (ahora >= terminaEn) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese cumpleaños ya terminó." };

  const paquete = PaqueteEventoSchema.omit({ active: true }).parse(reserva.package);
  const lines: AccountLineDto[] = [
    ...(reserva.balanceMinor > 0n
      ? [
          {
            id: `saldo-${reserva.id}`,
            concept: `Saldo · Cumpleaños de ${reserva.honoree} (${paquete.name})`.slice(0, 80),
            kind: "EVENTO" as const,
            amount: { minor: String(reserva.balanceMinor), currency: "USD" as const },
            paid: false,
          },
        ]
      : []),
    ...paquete.incluye.flatMap((x) =>
      Array.from({ length: x.quantity }, (_, n) => ({
        id: `inc-${x.productId}-${n + 1}`,
        concept: `${x.name} · incluido`.slice(0, 80),
        kind: "EVENTO" as const,
        amount: { minor: "0", currency: "USD" as const },
        paid: false,
        productId: x.productId,
      })),
    ),
  ];
  // Lo incluido sale del estante al entrar en la cuenta (ADR-023): sin existencia, el día no empieza.
  const movimientos = await comprobarExistencias(tx, ctx, null, null, lines, () => ["reservaId"]);
  if ("ok" in movimientos) return { ...movimientos, mensaje: `${movimientos.mensaje} El cumpleaños no empieza hasta que haya lo que incluye.` };

  const quien = await nombreDe(tx, ctx);
  const accountId = randomUUID();
  const orderNumber = await siguienteNumero(tx, ctx);
  const instante = new Date(ahora).toISOString();
  const familia = await tx.guardian.findUniqueOrThrow({ where: { id: reserva.guardianId }, select: { fullName: true } });
  const cuenta = FamilyAccountSchema.parse({
    id: accountId,
    kind: "EVENTO",
    eventId: reserva.id,
    eventDay: true,
    version: 1,
    family: familia.fullName,
    mode: "PREPAGO",
    // Con algo que cobrar va a la caja desde ya, como una mesa; sin nada (anticipo del 100 % y sin productos), cobrada.
    status: lines.length > 0 ? "POR_COBRAR" : "COBRADA",
    orderNumber,
    openedAt: instante,
    ...(lines.length > 0 ? { pendingSince: instante } : {}),
    sessionIds: [],
    closedSessionIds: [],
    lines,
  });
  await tx.account.create({
    data: {
      id: accountId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      kind: "EVENTO",
      orderNumber,
      openedAt: new Date(ahora),
      openedBy: ctx.quien?.userId ?? null,
      openedByName: quien.nombre,
      deviceId: ctx.quien?.deviceId ?? null,
    },
  });
  await guardarVersion(tx, ctx, cuenta, { cause: "EMPEZAR_EVENTO", operationKey: clave, ahora, quien: quien.nombre });
  await asentarExistencias(tx, ctx, movimientos, { accountId, version: 1, ahora, quien: quien.nombre });
  await tx.eventDay.create({
    data: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      reservationId: reserva.id,
      accountId,
      startedAt: new Date(ahora),
      startedBy: ctx.quien?.userId ?? null,
      startedByName: quien.nombre,
      deviceId: ctx.quien?.deviceId ?? null,
      operationKey: clave,
    },
  });
  await auditar(tx, ctx, {
    action: "evento.empezar",
    entityType: "event_reservation",
    entityId: reserva.id,
    after: {
      cuenta: orderNumber,
      saldo: { minor: String(reserva.balanceMinor), currency: "USD" },
      incluido: paquete.incluye.map((x) => `${x.quantity} × ${x.name}`),
    },
  });
  return { accountId, terminaEn };
}

/** El catálogo vigente de la sucursal, revalidado (fail-closed: uno que ya no cumple el contrato no se usa). */
async function catalogoVigente(tx: Transaccion, branchId: string): Promise<Vigente> {
  const fila = await tx.eventCatalogVersion.findFirst({ where: { branchId }, orderBy: { version: "desc" } });
  if (!fila) return { fila: null, catalogo: null };
  const r = CatalogoEventosSchema.safeParse(fila.content);
  if (!r.success) throw new Error(`Los paquetes de cumpleaños v${fila.version} guardados no cumplen el contrato actual; hay que publicar otros.`);
  return { fila, catalogo: r.data };
}

/** El aforo del tarifario vigente, o `null` si el parque no tiene tarifario. */
async function aforoDe(tx: Transaccion, branchId: string): Promise<number | null> {
  const fila = await tx.parkTariffVersion.findFirst({ where: { branchId }, orderBy: { version: "desc" } });
  const t = fila ? TarifarioSchema.safeParse(fila.content) : null;
  return t?.success ? t.data.policy.capacityLimit : null;
}

/** La hora de `ahora` en el local, en minutos desde la medianoche de `hoy` (su día en el calendario del local). */
function minutoDelDia(ahora: number, hoy: string, zona: string): number {
  return Math.min(24 * 60, Math.max(0, Math.floor((ahora - startOfDay(hoy, zona)) / 60_000)));
}

/** Las reservas y los catálogos de una sucursal se escriben de uno en uno. */
async function candadoDeEventos(tx: Transaccion, branchId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`eventos:${branchId}`}, 0))::text AS candado`;
}

/** ¿Tiene quien opera alguna de estas acciones (sin DENEGADO)? */
async function puedeAlguna(tx: Transaccion, ctx: Contexto, acciones: readonly Action[]): Promise<boolean> {
  for (const a of acciones) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") return true;
  return false;
}

const ESTADO_DEL_ANTICIPO: Readonly<Partial<Record<FamilyAccountDto["status"], EstadoReserva>>> = {
  POR_COBRAR: "ANTICIPO_POR_COBRAR",
  COBRADA: "CONFIRMADA",
  SIN_CONSUMO: "CANCELADA",
};
/** Con el día empezado (B10-2), manda su cuenta: el saldo en la caja, cobrado o dado por incobrable. */
const ESTADO_DEL_DIA: Readonly<Partial<Record<FamilyAccountDto["status"], EstadoReserva>>> = {
  POR_COBRAR: "EN_CURSO",
  COBRADA: "SALDADA",
  INCOBRABLE: "SALDO_INCOBRABLE",
};

/**
 * Las reservas que cumplen `where`, en orden de día y de hora, con el estado que dicen sus cuentas (su última
 * versión): la del anticipo y, si el día empezó, la del día con cuántos invitados entraron y siguen dentro.
 */
async function reservasDe(tx: Transaccion, where: Prisma.EventReservationWhereInput): Promise<ReservaEventoDto[]> {
  const filas = await tx.eventReservation.findMany({
    where,
    include: {
      guardian: { select: { id: true, fullName: true } },
      account: { select: { orderNumber: true } },
      day: { select: { accountId: true, startedAt: true, account: { select: { orderNumber: true } } } },
    },
    orderBy: [{ eventDate: "asc" }, { startsMinute: "asc" }, { createdAt: "asc" }],
  });
  if (filas.length === 0) return [];
  const cuentas = filas.flatMap((f) => (f.day ? [f.accountId, f.day.accountId] : [f.accountId]));
  const versiones = await tx.accountVersion.findMany({
    where: { accountId: { in: cuentas } },
    orderBy: [{ accountId: "asc" }, { version: "desc" }],
    distinct: ["accountId"],
    select: { accountId: true, status: true, cause: true, savedAt: true, savedByName: true },
  });
  const ultima = new Map(versiones.map((x) => [x.accountId, x]));
  const dias = filas.flatMap((f) => (f.day ? [f.day.accountId] : []));
  const estancias =
    dias.length === 0
      ? []
      : await tx.parkSession.groupBy({ by: ["accountId", "status"], where: { accountId: { in: dias } }, _count: { _all: true } });
  const contar = (accountId: string, soloDentro: boolean) =>
    estancias.filter((e) => e.accountId === accountId && (!soloDentro || e.status === "ACTIVA")).reduce((n, e) => n + e._count._all, 0);

  return filas.map((f) => {
    const v = ultima.get(f.accountId)!;
    const status = v.status as FamilyAccountDto["status"];
    const vDia = f.day ? ultima.get(f.day.accountId)! : null;
    const statusDia = vDia ? (vDia.status as FamilyAccountDto["status"]) : null;
    // Un estado que la reserva no conoce (un cambio que no salió de aquí) no se disfraza de otro.
    const estado = statusDia ? ESTADO_DEL_DIA[statusDia] : ESTADO_DEL_ANTICIPO[status];
    if (!estado) throw new Error(`La cuenta del cumpleaños ${f.id} está ${statusDia ?? status}, un estado que la reserva no conoce.`);
    const paquete = PaqueteEventoSchema.omit({ active: true }).parse(f.package);
    return ReservaEventoSchema.parse({
      id: f.id,
      fecha: f.eventDate.toISOString().slice(0, 10),
      inicio: f.startsMinute,
      fin: f.endsMinute,
      invitados: f.guests,
      cumpleanero: f.honoree,
      edad: f.honoreeAge,
      representante: { id: f.guardian.id, fullName: f.guardian.fullName },
      paquete,
      anticipoBps: f.depositBps,
      anticipo: { minor: String(f.depositMinor), currency: "USD" },
      saldo: { minor: String(f.balanceMinor), currency: "USD" },
      estado,
      cuenta: { id: f.accountId, orderNumber: f.account.orderNumber, status },
      reservadaEn: f.createdAt.toISOString(),
      reservadaPor: f.createdByName,
      cancelada: estado === "CANCELADA" ? { en: v.savedAt.toISOString(), por: v.savedByName } : null,
      dia:
        f.day && statusDia
          ? {
              cuenta: { id: f.day.accountId, orderNumber: f.day.account.orderNumber, status: statusDia },
              empezadoEn: f.day.startedAt.toISOString(),
              entraron: contar(f.day.accountId, false),
              dentro: contar(f.day.accountId, true),
            }
          : null,
    });
  });
}

function publicado({ fila, catalogo }: Vigente, aforo: number | null): CatalogoEventosPublicadoDto {
  return CatalogoEventosPublicadoSchema.parse({
    catalogo,
    version: fila?.version ?? null,
    publicadoEn: fila?.publishedAt.toISOString() ?? null,
    publicadoPor: fila?.publishedByName ?? null,
    aforo,
  });
}

/** Lo que va a la auditoría de un catálogo: el anticipo y cada paquete a la venta con su precio. */
function resumenDeCatalogo(version: number | null, c: CatalogoEventosDto) {
  return {
    version,
    anticipo: porcentaje(c.anticipoBps),
    aLaVenta: c.paquetes.filter((p) => p.active).map((p) => `${p.name}: $ ${toMajor(money(BigInt(p.price.minor), "USD"))} (${p.minInvitados}-${p.maxInvitados})`),
    retirados: c.paquetes.filter((p) => !p.active).map((p) => p.name),
  };
}

/** «50 %», «33,33 %»: el anticipo como se lee en el concepto de la cuenta. */
const porcentaje = (bps: number) => `${percentFromBasisPoints(bps)} %`;

/** «10/10»: el día del evento en el concepto, sin año (la reserva lo dice entero). */
function diaCorto(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}
