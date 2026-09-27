/**
 * Las tasas de cambio en el servidor — B2-1, F3-03 a F3-05, §5.2, ADR-005.
 *
 * Capturar añade una tasa sin confirmar; confirmar añade su confirmación. Ninguna de las dos
 * tablas se reescribe (regla 5): corregir una tasa mal tecleada es capturar otra.
 *
 * Quién decide qué:
 *  · el dominio (`@l2/domain-rates`): cuál es la del día, si el salto exige teclearla otra vez;
 *  · la matriz (`tasa.confirmar`): administración confirma; supervisión, con autorización (🔐);
 *    capturar lo puede quien puede confirmar, porque una tasa pendiente no cobra nada;
 *  · este archivo: que todo eso ocurra en una transacción, con su asiento.
 */
import {
  CapturarTasaCommandSchema,
  ConfirmarTasaCommandSchema,
  HistorialTasasSchema,
  problemasDe,
  type ExchangeRateDto,
  type HistorialTasasDto,
  type SincronizacionTasaDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import {
  addDays,
  calendarDay,
  coversDay,
  currentRate,
  frozenRateOf,
  needsDoubleCheck,
  variationBasisPoints,
  type RateRecord,
} from "@l2/domain-rates";
import type { Prisma } from "@l2/database";
import { errorDeBase, type Base, type ExchangeRate, type ExchangeRateConfirmation, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { autorizadoresPara, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { FUENTES_REALES, type Lector, type LecturaDeTasa } from "./fuentes.ts";

/**
 * Cuánto puede saltar una tasa respecto de la última confirmada antes de exigir que se teclee
 * otra vez (§5.2): 10 %. Fijo hasta que los ajustes del local sean de la base (B4-4).
 */
export const UMBRAL_VARIACION_BPS = 1000;

/** La zona que decide qué día es hoy. Venezuela: UTC−4 todo el año (ADR-009). */
export const ZONA_DEL_LOCAL = "America/Caracas";

/** Cuántos días por delante se puede capturar: el BCV publica el viernes la del lunes. */
export const DIAS_POR_ADELANTADO = 7;

/**
 * Cuánto pueden diferir dos fuentes que hablan del mismo día para darlas por iguales: 1 punto
 * básico (0,01 %). Cubre que una redondee a 4 decimales lo que la otra publica con 8; no cubre
 * un valor distinto.
 */
const TOLERANCIA_ENTRE_FUENTES_BPS = 1n;

/** Lo que se lee del historial: bastante para ver semanas, sin crecer para siempre. */
const TASAS_LEIDAS = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CasosTasas {
  /**
   * El historial del local con su política. No exige persona: la barra de toda estación enseña
   * con qué tasa se cobra (§5.2), también antes de entrar.
   */
  leer(ctx: Contexto): Promise<HistorialTasasDto>;
  /** Captura una tasa, siempre sin confirmar. */
  capturar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ExchangeRateDto>>;
  /**
   * Confirma una tasa para que se pueda cobrar con ella. `autorizacion` es la del 🔐 cuando
   * quien confirma es supervisión (id y PIN de quien autoriza, y el motivo).
   */
  confirmar(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<ExchangeRateDto>>;
  /** Quiénes pueden autorizar a quien opera a confirmar una tasa (vacío si no le hace falta). */
  autorizadores(ctx: Contexto): Promise<{ id: string; nombre: string }[]>;
  /**
   * Trae la tasa del BCV de sus fuentes y la deja capturada, PENDIENTE (F3-04). Lo pide una
   * persona con el botón de la pantalla o el propio servidor a su hora (`ctx.sistema`).
   */
  sincronizar(
    ctx: Contexto,
    opciones?: { fuentes?: readonly Lector[]; ahora?: number },
  ): Promise<Resultado<SincronizacionTasaDto>>;
}

type Fila = ExchangeRate & { confirmation: ExchangeRateConfirmation | null };

export function casosTasas(base: Base): CasosTasas {
  return {
    async leer(ctx) {
      const filas = await base.conTenant(ctx.tenantId, (tx) =>
        tx.exchangeRate.findMany({ include: { confirmation: true }, orderBy: { capturedAt: "desc" }, take: TASAS_LEIDAS }),
      );
      // Se revalida al salir: si lo guardado no cumple el contrato, se niega en vez de cobrar
      // con una tasa que el sistema no entiende (fail-closed).
      return HistorialTasasSchema.parse({
        tasas: filas.map(dto),
        umbralVariacionBasisPoints: UMBRAL_VARIACION_BPS,
        zonaHoraria: ZONA_DEL_LOCAL,
      });
    },

    async capturar(ctx, entrada, ahora = Date.now()) {
      const v = CapturarTasaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La tasa no se capturó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const hoy = calendarDay(new Date(ahora).toISOString(), ZONA_DEL_LOCAL);
      const dia = v.data.effectiveDate;
      // Hacia atrás solo si todavía rige hoy (el sábado se puede cargar la del viernes).
      if ((dia < hoy && !coversDay(dia, hoy)) || dia > addDays(hoy, DIAS_POR_ADELANTADO)) {
        return {
          ok: false,
          motivo: "INVALIDO",
          mensaje:
            dia < hoy
              ? "Esa fecha valor ya no rige: una tasa se captura para hoy o para un día que viene."
              : `Solo se captura con hasta ${DIAS_POR_ADELANTADO} días de adelanto.`,
          problemas: [{ path: ["effectiveDate"], message: "Día fuera de rango" }],
        };
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Fila | Rechazo> => {
          // Capturar es de quien puede confirmar (administración o supervisión): la separación
          // de funciones de §7.5 pide que quien cobra no mueva la tasa.
          const p = await permisoEn(tx, ctx, "tasa.confirmar");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          const quien = await nombreDe(tx, ctx);
          const fila = await tx.exchangeRate.create({
            data: {
              tenantId: ctx.tenantId,
              pair: v.data.pair,
              value: v.data.value,
              source: v.data.source,
              effectiveDate: new Date(`${dia}T00:00:00.000Z`),
              capturedAt: new Date(ahora),
              capturedBy: ctx.quien?.userId ?? null,
              capturedByName: quien.nombre,
            },
          });
          await auditar(tx, ctx, {
            action: "tasa.capturar",
            entityType: "exchange_rate",
            entityId: fila.id,
            after: { pair: fila.pair, value: fila.value, source: fila.source, effectiveDate: dia },
          });
          return { ...fila, confirmation: null };
        });
        if ("ok" in r) {
          await auditarRechazo(base, ctx, { action: "tasa.capturar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: dto(r) };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Se capturó otra tasa en el mismo instante. Vuelve a intentarlo." };
        }
        throw e;
      }
    },

    async confirmar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = ConfirmarTasaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La tasa no se confirmó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa tasa no existe en este local." };
      if (!UUID.test(v.data.rateId)) return noExiste;
      const instante = new Date(ahora).toISOString();
      const hoy = calendarDay(instante, ZONA_DEL_LOCAL);

      // Lo que se niega por el estado de la tasa se anota fuera de la transacción: la
      // operación no llegó a existir. El PIN fallido de un autorizador, en cambio, lo registra
      // `exigirPermisoOAutorizacion` dentro, y esa transacción sí se confirma.
      let negada = null as string | null;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Fila | Rechazo> => {
          const tasa = await tx.exchangeRate.findUnique({ where: { id: v.data.rateId }, include: { confirmation: true } });
          if (!tasa) return noExiste;
          if (tasa.confirmation) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa tasa ya estaba confirmada." };
          }
          const dia = diaDe(tasa.effectiveDate);
          if (dia < hoy && !coversDay(dia, hoy)) {
            negada = "Tasa de un día que ya pasó";
            return { ok: false, motivo: "INVALIDO", mensaje: "Esa tasa era para un día que ya no rige. Captura la de hoy." };
          }

          // El límite de cordura se mide contra la última confirmada del par, de cualquier día.
          const anterior = await ultimaConfirmada(tx, tasa.pair, instante);
          const requiere = needsDoubleCheck(anterior, registro({ ...tasa, confirmation: null }), UMBRAL_VARIACION_BPS);
          const tecleado = v.data.valorVerificado;
          if (requiere && tecleado === undefined) {
            return {
              ok: false,
              motivo: "INVALIDO",
              mensaje: "Esta tasa se aparta mucho de la anterior, o es la primera: teclea el valor otra vez.",
              problemas: [{ path: ["valorVerificado"], message: "Hace falta teclearlo de nuevo" }],
            };
          }
          if (tecleado !== undefined && !mismoValor(tasa.pair, tasa.value, tecleado)) {
            negada = "El valor tecleado de nuevo no coincide";
            return {
              ok: false,
              motivo: "INVALIDO",
              mensaje: "El valor tecleado no coincide con el capturado. Si el capturado está mal, captura otra tasa.",
              problemas: [{ path: ["valorVerificado"], message: "No coincide" }],
            };
          }

          // La autorización, si hace falta, se registra ANTES de confirmar (F2-08).
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "tasa.confirmar", autorizacion, ahora);
          if (!permiso.ok) return permiso;
          const quien = await nombreDe(tx, ctx);
          const autorizador = permiso.autorizadoPor
            ? await tx.staffUser.findUnique({ where: { id: permiso.autorizadoPor }, select: { fullName: true } })
            : null;

          const confirmacion = await tx.exchangeRateConfirmation.create({
            data: {
              tenantId: ctx.tenantId,
              rateId: tasa.id,
              confirmedAt: new Date(ahora),
              confirmedBy: ctx.quien?.userId ?? null,
              confirmedByName: quien.nombre,
              doubleChecked: requiere,
              authorizedBy: permiso.autorizadoPor,
              authorizedByName: autorizador?.fullName ?? null,
            },
          });
          await auditar(tx, ctx, {
            action: "tasa.confirmar",
            entityType: "exchange_rate",
            entityId: tasa.id,
            ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
            before: { confirmada: false, anterior: anterior ? { id: anterior.id, value: anterior.value } : null },
            after: { confirmada: true, pair: tasa.pair, value: tasa.value, effectiveDate: dia, doubleChecked: requiere },
          });
          return { ...tasa, confirmation: confirmacion };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO" || negada) {
            await auditarRechazo(base, ctx, {
              action: "tasa.confirmar",
              entityType: "exchange_rate",
              entityId: v.data.rateId,
              reason: negada ?? r.mensaje,
            });
          }
          return r;
        }
        return { ok: true, valor: dto(r) };
      } catch (e) {
        // Dos personas confirmaron la misma tasa a la vez: gana la primera.
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Otra persona confirmó esa tasa al mismo tiempo." };
        }
        throw e;
      }
    },

    async autorizadores(ctx) {
      return base.conTenant(ctx.tenantId, (tx) => autorizadoresPara(tx, ctx, "tasa.confirmar"));
    },

    async sincronizar(ctx, { fuentes = FUENTES_REALES, ahora = Date.now() } = {}) {
      // Traer una tasa es capturarla: lo puede quien captura (administración o supervisión).
      if (!ctx.sistema) {
        const p = await base.conTenant(ctx.tenantId, (tx) => permisoEn(tx, ctx, "tasa.confirmar"));
        if (p === "DENEGADO") {
          const r = rechazoDePermiso(p);
          await auditarRechazo(base, ctx, { action: "tasa.sincronizar", reason: r.mensaje });
          return r;
        }
      }

      // Cada fuente por su lado: una que falla o se cuelga no tumba a la otra.
      const lecturas = await Promise.all(
        fuentes.map((leer) =>
          leer().catch(() => ({ ok: false as const, fuente: "BCV" as const, error: "La fuente falló de forma inesperada." })),
        ),
      );
      const informe = lecturas.map((l) =>
        l.ok
          ? { fuente: l.lectura.fuente, ok: true, detalle: `${l.lectura.value} Bs/$ con fecha valor ${l.lectura.effectiveDate}` }
          : { fuente: l.fuente, ok: false, detalle: l.error },
      );
      const buenas = lecturas.flatMap((l) => (l.ok ? [l.lectura] : []));
      if (buenas.length === 0) {
        return {
          ok: false,
          motivo: "NO_DISPONIBLE",
          mensaje: `Ninguna fuente respondió (${informe.map((f) => f.detalle).join(" ")}). Carga la tasa a mano.`,
        };
      }

      // Solo interesa lo que rige hoy o lo que regirá en los próximos días.
      const hoy = calendarDay(new Date(ahora).toISOString(), ZONA_DEL_LOCAL);
      const hasta = addDays(hoy, DIAS_POR_ADELANTADO);
      const avisos: string[] = [];
      const porDia = new Map<string, LecturaDeTasa[]>();
      for (const l of buenas) {
        if (!coversDay(l.effectiveDate, hoy) && !(l.effectiveDate > hoy && l.effectiveDate <= hasta)) continue;
        porDia.set(l.effectiveDate, [...(porDia.get(l.effectiveDate) ?? []), l]);
      }

      // Dos fuentes que hablan del mismo día tienen que decir lo mismo; si no, algo anda mal
      // (una fuente manipulada, amenaza T6) y ese día no se captura.
      const elegidas: { lectura: LecturaDeTasa; confirmadaPor: LecturaDeTasa[] }[] = [];
      for (const [dia, delDia] of [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const oficial = delDia.find((l) => l.fuente === "BCV") ?? delDia[0]!;
        const discrepan = delDia.filter((l) => variationBasisPoints(oficial.value, l.value) > TOLERANCIA_ENTRE_FUENTES_BPS);
        if (discrepan.length > 0) {
          avisos.push(
            `Las fuentes no coinciden para el ${dia} (${delDia.map((l) => `${l.fuente}: ${l.value}`).join(", ")}): no se capturó. Revísala y cárgala a mano.`,
          );
          continue;
        }
        elegidas.push({ lectura: oficial, confirmadaPor: delDia });
      }

      const r = await base.conTenant(ctx.tenantId, async (tx) => {
        const capturadas: Fila[] = [];
        const yaEstaban: { effectiveDate: string; value: string }[] = [];
        for (const [i, { lectura, confirmadaPor }] of elegidas.entries()) {
          const existentes = await tx.exchangeRate.findMany({
            where: { pair: lectura.pair, effectiveDate: new Date(`${lectura.effectiveDate}T00:00:00.000Z`) },
          });
          if (existentes.some((e) => mismoValor(lectura.pair, e.value, lectura.value))) {
            yaEstaban.push({ effectiveDate: lectura.effectiveDate, value: lectura.value });
            continue;
          }
          const canal =
            confirmadaPor.length > 1 ? "Sincronización BCV (2 fuentes)" : `Sincronización ${lectura.fuente === "BCV" ? "BCV" : "DolarApi"}`;
          const fila = await tx.exchangeRate.create({
            data: {
              tenantId: ctx.tenantId,
              pair: lectura.pair,
              value: lectura.value,
              // El valor es el oficial del BCV, lo traiga su web o quien la republica.
              source: "BCV",
              effectiveDate: new Date(`${lectura.effectiveDate}T00:00:00.000Z`),
              // Un milisegundo por tasa: dos del mismo par no comparten instante de captura.
              capturedAt: new Date(ahora + i),
              capturedBy: null,
              capturedByName: canal,
              rawPayload: { lecturas: confirmadaPor.map((l) => ({ fuente: l.fuente, ...l.crudo })) } as Prisma.InputJsonValue,
            },
          });
          capturadas.push({ ...fila, confirmation: null });
        }
        await auditar(tx, ctx, {
          action: "tasa.sincronizar",
          entityType: "exchange_rate",
          after: {
            capturadas: capturadas.map((c) => ({ id: c.id, value: c.value, effectiveDate: diaDe(c.effectiveDate) })),
            yaEstaban,
            fuentes: informe,
            avisos,
          },
        });
        return { capturadas, yaEstaban };
      });

      return {
        ok: true,
        valor: { capturadas: r.capturadas.map(dto), yaEstaban: r.yaEstaban, fuentes: informe, avisos },
      };
    },
  };
}

/** La última tasa confirmada del par capturada hasta `instante`, en la forma del dominio. */
async function ultimaConfirmada(tx: Transaccion, pair: string, instante: string): Promise<RateRecord | null> {
  const filas = await tx.exchangeRate.findMany({
    where: { pair, confirmation: { isNot: null }, capturedAt: { lte: new Date(instante) } },
    include: { confirmation: true },
    orderBy: { capturedAt: "desc" },
    take: 1,
  });
  return currentRate(filas.map(registro), pair === "USDT/VES" ? "USDT/VES" : "USD/VES", instante);
}

/** Dos valores son el mismo si dan la misma fracción: «228.41» y «228.410» lo son. */
function mismoValor(pair: string, a: string, b: string): boolean {
  const par = pair === "USDT/VES" ? "USDT/VES" : "USD/VES";
  try {
    const x = frozenRateOf({ pair: par, value: a });
    const y = frozenRateOf({ pair: par, value: b });
    return x.numerator === y.numerator && x.denominator === y.denominator;
  } catch {
    return false;
  }
}

const diaDe = (d: Date) => d.toISOString().slice(0, 10);

function registro(f: Fila): RateRecord {
  return {
    id: f.id,
    pair: f.pair === "USDT/VES" ? "USDT/VES" : "USD/VES",
    value: f.value,
    source: f.source === "BCV" || f.source === "COMERCIAL" ? f.source : "MANUAL",
    capturedAt: f.capturedAt.toISOString(),
    effectiveDate: diaDe(f.effectiveDate),
    confirmed: f.confirmation !== null,
  };
}

function dto(f: Fila): ExchangeRateDto {
  const c = f.confirmation;
  return {
    id: f.id,
    pair: f.pair as ExchangeRateDto["pair"],
    value: f.value,
    source: f.source as ExchangeRateDto["source"],
    capturedAt: f.capturedAt.toISOString(),
    effectiveDate: diaDe(f.effectiveDate),
    capturedBy: f.capturedByName,
    confirmed: c !== null,
    ...(c
      ? {
          confirmedBy: c.confirmedByName,
          confirmedAt: c.confirmedAt.toISOString(),
          ...(c.authorizedByName ? { authorizedBy: c.authorizedByName } : {}),
        }
      : {}),
  };
}
