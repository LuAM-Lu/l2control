/**
 * El parque en el servidor — B4-1, B4-2, B4-3, F5-02, F5-05 a F5-08, F5-14, ADR-010, DEC-21.
 *
 * Hasta aquí las estancias vivían en el navegador: la sala de otro equipo no veía a nadie, el
 * cronómetro era el reloj de la tablet y el precio del paquete y del excedente los ponía la pantalla.
 * Ahora cada cosa la decide quien debe:
 *
 *  · **La entrada** abre, en UNA transacción, las estancias con la hora del servidor, el paquete y sus
 *    condiciones copiados del tarifario vigente, y la cuenta de la familia con el precio de ese
 *    tarifario (en prepago, ya en la cola de la caja). El aforo se comprueba con un candado por
 *    sucursal: dos entradas a la vez no cuelan un niño de más. Una pulsera tiene una estancia activa.
 *  · **La salida** calcula el excedente con el reloj del servidor y las condiciones de la entrada
 *    (`settleAtExit`), lo añade a la cuenta (`registerExit`) y cierra las estancias.
 *  · **La sala** es la foto de los niños dentro con la hora del servidor, de la que la pantalla solo
 *    interpola (ADR-010).
 *
 * La entrada y la salida llevan su clave: un reintento devuelve lo que ya se hizo, no lo repite.
 */
import { randomUUID } from "node:crypto";
import {
  CheckInCommandSchema,
  CheckoutCommandSchema,
  EstanciaSchema,
  FamilyAccountSchema,
  MonitorSnapshotSchema,
  NombrarEstanciaCommandSchema,
  ParkTermsSchema,
  TarifarioSchema,
  problemasDe,
  type CheckInResult,
  type CheckoutResult,
  type EstanciaDto,
  type FamilyAccountDto,
  type MonitorSnapshotDto,
  type ParkTermsDto,
  type PricePackageDto,
  type Rechazo,
  type Resultado,
  type SettlementLineDto,
  type TarifarioDto,
} from "@l2/contracts";
import { registerExit } from "@l2/domain-cash";
import { add, money } from "@l2/domain-money";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import { admits, epochMs, fixed, openEnded, parkPolicy, settleAtExit, type ParkPolicy, type ParkSession as SesionDelDominio } from "@l2/domain-park";
import type { Action } from "@l2/domain-identity";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import { ZONA_DEL_LOCAL } from "../dinero/tasas.ts";
import { guardarVersion, siguienteNumero, vigenteDe } from "../caja/cuentas.ts";
import { claveDeNombre, representanteDeLaEntrada } from "./representantes.ts";

export interface CasosParque {
  /** Los niños en sala, con la hora del servidor y la política vigente (aforo, avisos). */
  sala(ctx: Contexto, ahora?: number): Promise<Resultado<MonitorSnapshotDto>>;
  /** Registra una entrada (`CheckInCommandSchema`): estancias y cuenta de la familia, juntas. */
  entrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CheckInResult>>;
  /** Registra la salida de niños de UNA familia (`CheckoutCommandSchema`) y liquida su tiempo de más. */
  salir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CheckoutResult>>;
  /** Pone o corrige el nombre del niño de una estancia en sala (`NombrarEstanciaCommandSchema`, DEC-28). */
  nombrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstanciaDto>>;
  /** Niños que entraron hoy y el mismo día de la semana pasada, en el día del local (Inicio). */
  atendidos(ctx: Contexto, ahora?: number): Promise<Resultado<{ hoy: number; semanaPasada: number }>>;
}

/** Quién ve la sala: quien trabaja con el parque o con sus cuentas (entrada, salida, salón y caja). */
const VEN_LA_SALA: readonly Action[] = ["parque.checkIn", "parque.checkOut", "parque.vincularMesa", "documento.emitir"];

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});
const sinTarifario: Rechazo = {
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: "Esta sucursal no tiene tarifario publicado: publícalo en Ajustes → Tarifas y paquetes.",
};

/** Una estancia con lo que hace falta para contarla: su familia y su niño, si tiene nombre. */
const CON_FAMILIA = { guardian: { select: { fullName: true } }, kid: { select: { id: true, name: true, nickname: true } } } as const;

export function casosParque(base: Base): CasosParque {
  return {
    async sala(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<MonitorSnapshotDto | Rechazo> => {
        let ve = false;
        for (const a of VEN_LA_SALA) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") ve = true;
        if (!ve) return rechazoDePermiso("DENEGADO");
        const vigente = await tarifarioDe(tx, ctx);
        if (!vigente) return sinTarifario;
        const filas = await tx.parkSession.findMany({
          where: { branchId: ctx.branchId, status: "ACTIVA" },
          include: CON_FAMILIA,
          orderBy: { startedAt: "asc" },
        });
        return MonitorSnapshotSchema.parse({
          serverNow: new Date(ahora).toISOString(),
          policy: vigente.tarifario.policy,
          rate: null,
          shiftLabel: "",
          sessions: filas.map(estanciaDe),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async entrar(ctx, entrada, ahora = Date.now()) {
      const v = CheckInCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La entrada no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CheckInResult | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
          if (rechazo) return rechazo;
          // Un reintento de la misma entrada devuelve la que ya se hizo.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.cause === "ENTRADA" ? entradaHecha(tx, cmd.idempotencyKey, previa.accountId) : conflictoDeClave;

          const vigente = await tarifarioDe(tx, ctx);
          if (!vigente) return sinTarifario;
          const paquetes: PricePackageDto[] = [];
          for (const [i, e] of cmd.entries.entries()) {
            const p = vigente.tarifario.packages.find((x) => x.id === e.packageId && x.active);
            if (!p) return invalido("Ese paquete ya no está a la venta: elige otro.", ["entries", i, "packageId"], "PAQUETE_QUE_NO_SE_VENDE");
            paquetes.push(p);
          }
          const repetida = cmd.entries.findIndex((e, i) => cmd.entries.findIndex((x) => x.wristbandCode === e.wristbandCode) !== i);
          if (repetida >= 0) {
            return invalido(`La pulsera ${cmd.entries[repetida]!.wristbandCode} está dos veces en esta entrada.`, ["entries", repetida, "wristbandCode"], "PULSERA_REPETIDA");
          }

          // El candado ordena dos entradas a la vez: el aforo y las pulseras se miran y se ocupan juntos.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`parque:${ctx.branchId}`}, 0))::text AS candado`;
          const activas = await tx.parkSession.findMany({ where: { branchId: ctx.branchId, status: "ACTIVA" }, select: { wristbandCode: true } });
          const ocupadas = new Set(activas.map((a) => a.wristbandCode));
          const ocupada = cmd.entries.findIndex((e) => ocupadas.has(e.wristbandCode));
          if (ocupada >= 0) {
            // I-04: una pulsera, una estancia activa.
            return invalido(`La pulsera ${cmd.entries[ocupada]!.wristbandCode} ya está activa en sala.`, ["entries", ocupada, "wristbandCode"], "PULSERA_ACTIVA");
          }
          const aforo = vigente.tarifario.policy.capacityLimit;
          if (!admits(activas.length, cmd.entries.length, aforo)) {
            const libres = Math.max(0, aforo - activas.length);
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: libres === 0 ? `Aforo completo (${aforo}): no entra nadie más.` : `Aforo: quedan ${libres} ${libres === 1 ? "plaza" : "plazas"} y esta entrada trae ${cmd.entries.length}.`,
            };
          }

          const familia = await representanteDeLaEntrada(tx, ctx, cmd, ahora);
          if ("ok" in familia) return familia;
          const ninos: (string | null)[] = [];
          for (const [i, e] of cmd.entries.entries()) {
            const k = await ninoDeLaEntrada(tx, ctx, familia.id, e.kid, ahora);
            if (k === "AJENO") return invalido("Ese niño no es de esta familia.", ["entries", i, "kid", "id"], "NINO_DE_OTRA_FAMILIA");
            ninos.push(k);
          }

          const quien = await nombreDe(tx, ctx);
          const instante = new Date(ahora).toISOString();
          const accountId = randomUUID();
          const sesiones = cmd.entries.map(() => randomUUID());
          const orderNumber = await siguienteNumero(tx, ctx);
          const status = cmd.paymentMode === "PREPAGO" ? "POR_COBRAR" : "ABIERTA";
          const cuenta = FamilyAccountSchema.parse({
            id: accountId,
            kind: "FAMILIA",
            version: 1,
            family: familia.fullName,
            mode: cmd.paymentMode,
            status,
            orderNumber,
            openedAt: instante,
            ...(status === "POR_COBRAR" ? { pendingSince: instante } : {}),
            sessionIds: sesiones,
            closedSessionIds: [],
            // El precio es el del tarifario vigente, no el que enseñaba la pantalla.
            lines: cmd.entries.map((e, i) => ({
              id: `paq-${sesiones[i]}`,
              concept: `Paquete ${paquetes[i]!.name} · ${e.wristbandCode}`.slice(0, 80),
              kind: "PAQUETE",
              amount: paquetes[i]!.price,
              paid: false,
              sessionId: sesiones[i],
            })),
          });
          await tx.account.create({
            data: {
              id: accountId,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              kind: "FAMILIA",
              orderNumber,
              openedAt: new Date(ahora),
              openedBy: ctx.quien?.userId ?? null,
              openedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
            },
          });
          await guardarVersion(tx, ctx, cuenta, { cause: "ENTRADA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          const terms: ParkTermsDto = ParkTermsSchema.parse(vigente.tarifario.policy);
          await tx.parkSession.createMany({
            data: cmd.entries.map((e, i) => ({
              id: sesiones[i]!,
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              accountId,
              guardianId: familia.id,
              kidId: ninos[i]!,
              wristbandCode: e.wristbandCode,
              packageId: paquetes[i]!.id,
              packageName: paquetes[i]!.name,
              mode: paquetes[i]!.mode,
              durationMinutes: paquetes[i]!.duration.kind === "fixed" ? paquetes[i]!.duration.minutes : null,
              priceMinor: BigInt(paquetes[i]!.price.minor),
              currency: "USD",
              terms,
              tariffVersion: vigente.version,
              startedAt: new Date(ahora),
              openedBy: ctx.quien?.userId ?? null,
              openedByName: quien.nombre,
              deviceId: ctx.quien?.deviceId ?? null,
              checkInKey: cmd.idempotencyKey,
              status: "ACTIVA",
            })),
          });
          const total = paquetes.reduce((acc, p) => add(acc, money(BigInt(p.price.minor), "USD")), money(0n, "USD"));
          await auditar(tx, ctx, {
            action: "parque.entrada",
            entityType: "account",
            entityId: accountId,
            after: {
              orderNumber,
              modo: cmd.paymentMode,
              ninos: cmd.entries.length,
              pulseras: cmd.entries.map((e) => e.wristbandCode),
              tarifario: vigente.version,
              total: { minor: String(total.amount), currency: "USD" },
            },
          });
          return entradaHecha(tx, cmd.idempotencyKey, accountId);
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.entrada", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos entradas a la vez con la misma clave (un doble toque que llegó por dos vías) o con una
        // pulsera que acaba de ocuparse: se vuelve a mirar con lo que ya quedó.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async salir(ctx, entrada, ahora = Date.now()) {
      const v = CheckoutCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La salida no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      if (cmd.disposition.kind === "MESA") {
        return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Cargar el parque a una mesa llega con el restaurante. Por ahora, envíalo a caja." };
      }

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<CheckoutResult | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.checkOut");
          if (rechazo) return rechazo;
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.cause === "SALIDA" ? salidaHecha(tx, cmd.idempotencyKey, previa.accountId) : conflictoDeClave;

          const filas = await tx.parkSession.findMany({ where: { id: { in: cmd.sessionIds }, branchId: ctx.branchId }, include: CON_FAMILIA });
          if (filas.length !== cmd.sessionIds.length) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Una de esas estancias no está en esta sucursal." };
          }
          const porId = new Map(filas.map((f) => [f.id, f]));
          const enOrden = cmd.sessionIds.map((id) => porId.get(id)!);
          const salida = enOrden.find((f) => f.status !== "ACTIVA");
          if (salida) return { ok: false, motivo: "CONFLICTO", mensaje: `${nombreDeFila(salida)} ya salió.` };
          if (new Set(enOrden.map((f) => f.accountId)).size > 1) {
            return invalido("Cada familia sale por separado: registra primero una y luego la otra.", ["sessionIds"], "VARIAS_FAMILIAS");
          }
          const accountId = enOrden[0]!.accountId;
          const actual = (await vigenteDe(tx, accountId))!;
          if (actual.cuenta.status === "INCOBRABLE") {
            return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta de esta familia se dio por incobrable: la salida la resuelve supervisión." };
          }

          const lineas = enOrden.map((f) => liquidacionDe(f, ahora));
          const despues = registerExit(
            actual.cuenta,
            cmd.sessionIds,
            lineas.map((l, i) => ({
              sessionId: l.sessionId,
              concept: `Tiempo de más · ${nombreDeFila(enOrden[i]!)} (${l.penaltyBlocks === 1 ? "1 bloque" : `${l.penaltyBlocks} bloques`})`,
              amountMinor: BigInt(l.overdue.minor),
            })),
          );
          const instante = new Date(ahora).toISOString();
          const { pendingSince: _, ...sinEspera } = despues;
          const nueva = FamilyAccountSchema.parse({
            ...sinEspera,
            version: actual.version + 1,
            ...(despues.status === "POR_COBRAR"
              ? { pendingSince: actual.cuenta.status === "POR_COBRAR" ? (actual.cuenta.pendingSince ?? instante) : instante }
              : {}),
          });
          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, nueva, { cause: "SALIDA", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await tx.parkSession.updateMany({
            where: { id: { in: cmd.sessionIds }, status: "ACTIVA" },
            data: {
              status: "CERRADA",
              endedAt: new Date(ahora),
              closedBy: ctx.quien?.userId ?? null,
              closedByName: quien.nombre,
              checkOutKey: cmd.idempotencyKey,
            },
          });
          const excedente = lineas.reduce((acc, l) => add(acc, money(BigInt(l.overdue.minor), "USD")), money(0n, "USD"));
          await auditar(tx, ctx, {
            action: "parque.salida",
            entityType: "account",
            entityId: accountId,
            before: { version: actual.version, status: actual.cuenta.status },
            after: {
              version: nueva.version,
              status: nueva.status,
              pulseras: enOrden.map((f) => f.wristbandCode),
              excedente: { minor: String(excedente.amount), currency: "USD" },
            },
          });
          return { lines: lineas, account: nueva };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "parque.salida", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Otra operación cambió la cuenta a la vez (la caja la cobró, otra salida de un hermano): se
        // vuelve a mirar con su versión nueva.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

    async atendidos(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<{ hoy: number; semanaPasada: number } | Rechazo> => {
        let ve = false;
        for (const a of VEN_LA_SALA) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") ve = true;
        if (!ve) return rechazoDePermiso("DENEGADO");
        const dia = calendarDay(new Date(ahora).toISOString(), ZONA_DEL_LOCAL);
        const desde = startOfDay(dia, ZONA_DEL_LOCAL);
        const hace7 = startOfDay(calendarDay(new Date(desde - 7 * 86_400_000 + 12 * 3_600_000).toISOString(), ZONA_DEL_LOCAL), ZONA_DEL_LOCAL);
        const cuantos = (de: number, a: number) =>
          tx.parkSession.count({ where: { branchId: ctx.branchId, startedAt: { gte: new Date(de), lt: new Date(a) } } });
        return { hoy: await cuantos(desde, ahora + 1), semanaPasada: await cuantos(hace7, hace7 + (ahora + 1 - desde)) };
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async nombrar(ctx, entrada, ahora = Date.now()) {
      const v = NombrarEstanciaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El nombre no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstanciaDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
        if (rechazo) return rechazo;
        const f = await tx.parkSession.findFirst({ where: { id: cmd.sessionId, branchId: ctx.branchId } });
        if (!f) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa estancia no está en esta sucursal." };
        if (f.status !== "ACTIVA") return { ok: false, motivo: "CONFLICTO", mensaje: "Ese niño ya salió." };
        const datos = { name: cmd.name, nickname: cmd.nickname ?? null };
        let kidId = f.kidId;
        if (kidId) {
          // Ya tenía nombre: se corrige el del niño, y el directorio lo ve igual.
          await tx.kid.update({ where: { id: kidId }, data: datos });
        } else {
          // Si la familia ya tiene un niño con ese nombre, es él; si no, nace en el directorio.
          const suyos = await tx.kid.findMany({ where: { guardianId: f.guardianId }, select: { id: true, name: true } });
          const mismo = suyos.find((k) => claveDeNombre(k.name) === claveDeNombre(cmd.name));
          if (mismo) await tx.kid.update({ where: { id: mismo.id }, data: datos });
          kidId =
            mismo?.id ??
            (await tx.kid.create({ data: { tenantId: ctx.tenantId, guardianId: f.guardianId, ...datos, createdAt: new Date(ahora) }, select: { id: true } })).id;
          await tx.parkSession.update({ where: { id: f.id }, data: { kidId } });
        }
        await auditar(tx, ctx, { action: "parque.nombrar", entityType: "park_session", entityId: f.id, after: { kidId } });
        return estanciaDe(await tx.parkSession.findUniqueOrThrow({ where: { id: f.id }, include: CON_FAMILIA }));
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}

/* ─────────────────────────────────────────────────────────────── de la base */

type FilaDeEstancia = Awaited<ReturnType<Transaccion["parkSession"]["findFirstOrThrow"]>> & {
  guardian: { fullName: string };
  kid: { id: string; name: string; nickname: string | null } | null;
};

/** El tarifario vigente de la sucursal, revalidado; `null` si nunca se publicó (o ya no se entiende). */
async function tarifarioDe(tx: Transaccion, ctx: Contexto): Promise<{ version: number; tarifario: TarifarioDto } | null> {
  const fila = await tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId }, orderBy: { version: "desc" } });
  const t = fila ? TarifarioSchema.safeParse(fila.content) : null;
  return fila && t?.success ? { version: fila.version, tarifario: t.data } : null;
}

/** La estancia como viaja, validada con el contrato al salir (fail-closed). */
function estanciaDe(f: FilaDeEstancia): EstanciaDto {
  return EstanciaSchema.parse({
    id: f.id,
    wristbandCode: f.wristbandCode,
    kid: f.kid ? { id: f.kid.id, name: f.kid.name, ...(f.kid.nickname ? { nickname: f.kid.nickname } : {}) } : {},
    mode: f.mode,
    duration: f.durationMinutes === null ? { kind: "openEnded" } : { kind: "fixed", minutes: f.durationMinutes },
    startedAt: f.startedAt.toISOString(),
    packageId: f.packageId,
    packagePrice: { minor: String(f.priceMinor), currency: "USD" },
    accountId: f.accountId,
    guardianId: f.guardianId,
    guardianName: f.guardian.fullName,
    packageName: f.packageName,
    terms: f.terms,
  });
}

/** Cómo se nombra a un niño en la cuenta y en los avisos: su apodo, su nombre o su pulsera (DEC-28). */
function nombreDeFila(f: FilaDeEstancia): string {
  return f.kid?.nickname ?? f.kid?.name ?? f.wristbandCode;
}

/** La estancia y sus condiciones en la forma del dominio, para medirla. */
function paraMedir(f: FilaDeEstancia): { sesion: SesionDelDominio; politica: ParkPolicy } {
  const t = ParkTermsSchema.parse(f.terms);
  return {
    sesion: {
      id: f.id,
      wristbandCode: f.wristbandCode,
      mode: f.mode as "PREPAGO" | "POSTPAGO",
      duration: f.durationMinutes === null ? openEnded : fixed(f.durationMinutes),
      startedAt: epochMs(f.startedAt.getTime()),
    },
    politica: parkPolicy({
      graceMinutes: t.graceMinutes,
      penaltyBlockMinutes: t.penaltyBlockMinutes,
      penaltyPricePerBlock: money(BigInt(t.penaltyPricePerBlock.minor), "USD"),
      warnBeforeMinutes: t.warnBeforeMinutes,
    }),
  };
}

/** El desglose de la salida de una estancia en `hasta` (el instante del servidor, ADR-010). */
function liquidacionDe(f: FilaDeEstancia, hasta: number): SettlementLineDto {
  const { sesion, politica } = paraMedir(f);
  const s = settleAtExit(sesion, politica, epochMs(hasta));
  const paquete = money(f.priceMinor, "USD");
  return {
    sessionId: f.id,
    wristbandCode: f.wristbandCode,
    kid: f.kid ? { id: f.kid.id, name: f.kid.name, ...(f.kid.nickname ? { nickname: f.kid.nickname } : {}) } : {},
    startedAt: f.startedAt.toISOString(),
    endedAt: new Date(hasta).toISOString(),
    consumedMinutes: s.consumedMinutes,
    billableOverdueMinutes: s.billableOverdueMinutes,
    penaltyBlocks: s.penaltyBlocks,
    packagePrice: { minor: String(paquete.amount), currency: "USD" },
    overdue: { minor: String(s.overdue.amount), currency: "USD" },
    total: { minor: String(add(paquete, s.overdue).amount), currency: "USD" },
  };
}

/** Lo que dejó una entrada: sus estancias y la cuenta de la familia como está ahora. */
async function entradaHecha(tx: Transaccion, clave: string, accountId: string): Promise<CheckInResult> {
  const filas = await tx.parkSession.findMany({ where: { checkInKey: clave }, include: CON_FAMILIA, orderBy: { wristbandCode: "asc" } });
  const cuenta: FamilyAccountDto = (await vigenteDe(tx, accountId))!.cuenta;
  const orden = new Map(cuenta.sessionIds.map((id, i) => [id, i]));
  filas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
  return { sessions: filas.map(estanciaDe), account: cuenta };
}

/** Lo que dejó una salida: su desglose (con la hora en que se cerró) y la cuenta como está ahora. */
async function salidaHecha(tx: Transaccion, clave: string, accountId: string): Promise<CheckoutResult> {
  const filas = await tx.parkSession.findMany({ where: { checkOutKey: clave }, include: CON_FAMILIA });
  return {
    lines: filas.map((f) => liquidacionDe(f, f.endedAt!.getTime())),
    account: (await vigenteDe(tx, accountId))!.cuenta,
  };
}

/**
 * El niño de una entrada: uno del directorio de la familia (`kid.id`), uno nuevo con nombre, o nadie
 * todavía (DEC-28: en la puerta no se pide el nombre). `"AJENO"` si el que cita es de otra familia.
 */
async function ninoDeLaEntrada(
  tx: Transaccion,
  ctx: Contexto,
  guardianId: string,
  kid: { id?: string | undefined; name?: string | undefined; nickname?: string | undefined },
  ahora: number,
): Promise<string | null | "AJENO"> {
  if (kid.id) {
    const k = await tx.kid.findUnique({ where: { id: kid.id }, select: { guardianId: true } });
    return k && k.guardianId === guardianId ? kid.id : "AJENO";
  }
  if (!kid.name) return null;
  const suyos = await tx.kid.findMany({ where: { guardianId }, select: { id: true, name: true } });
  const mismo = suyos.find((k) => claveDeNombre(k.name) === claveDeNombre(kid.name!));
  if (mismo) return mismo.id;
  const nuevo = await tx.kid.create({
    data: { tenantId: ctx.tenantId, guardianId, name: kid.name, nickname: kid.nickname ?? null, createdAt: new Date(ahora) },
    select: { id: true },
  });
  return nuevo.id;
}
