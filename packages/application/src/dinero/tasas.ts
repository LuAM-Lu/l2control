/**
 * Las tasas de cambio en el servidor — B2-1, B2-1c, F3-03 a F3-05, §5.2, ADR-005 y ADR-019.
 *
 * Capturar añade una tasa; confirmar (o aplicarla) añade su confirmación. Ninguna de las dos
 * tablas se reescribe (regla 5): corregir una tasa mal tecleada es capturar otra.
 *
 * Quién decide qué:
 *  · el dominio (`@l2/domain-rates`): cuál es la del día, si el salto exige teclearla otra vez y
 *    si una traída automáticamente se aplica sola (`autoApplyDecision`);
 *  · la matriz (`tasa.confirmar`): administración aplica lo que teclea al guardarlo; supervisión
 *    captura y confirma con autorización (🔐); quien cobra no toca la tasa;
 *  · este archivo: que todo eso ocurra en una transacción, con su asiento.
 */
import {
  CapturarTasaCommandSchema,
  ConfirmarTasaCommandSchema,
  HistorialTasasSchema,
  PaginaDeTasasSchema,
  TasasQuerySchema,
  problemasDe,
  type ExchangeRateDto,
  type FiltroTasas,
  type PaginaDeTasasDto,
  type HistorialTasasDto,
  type SincronizacionTasaDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import {
  addDays,
  autoApplyDecision,
  calendarDay,
  coversDay,
  currentRate,
  frozenRateOf,
  heldRates,
  missingNextBusinessDayRate,
  needsDoubleCheck,
  variationBasisPoints,
  type HeldReason,
  type Holidays,
  type RateRecord,
} from "@l2/domain-rates";
import type { Prisma } from "@l2/database";
import { errorDeBase, type Base, type ExchangeRate, type ExchangeRateConfirmation, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { autorizadoresPara, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { FUENTES_REALES, type Lector, type LecturaDeTasa } from "./fuentes.ts";
import { diasFeriados } from "./feriados.ts";
import { zonaDe } from "../sucursal/ajustes.ts";

/**
 * Cuánto puede saltar una tasa respecto de la última confirmada antes de exigir que se teclee
 * otra vez (§5.2): 10 %. Solo para lo que teclea una persona: la que trae el BCV se aplica sin
 * mirar el salto (V-14, ADR-024). Fijo: el cliente no lo ha pedido como ajuste del local.
 */
export const UMBRAL_VARIACION_BPS = 1000;

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

/**
 * A partir de qué hora (local, 24 h) se avisa de que el BCV no publicó la del siguiente día hábil
 * (ADR-019 §8). Suele publicarla entre las 3:00 y las 5:00 pm; a las 6:00 pm ya es tarde.
 */
export const HORA_AVISO_SIGUIENTE = 18;

/** A nombre de quién queda una tasa aplicada sola (ADR-019 §4). La bandera es `automatic`. */
export const APLICADA_AUTOMATICAMENTE = "Aplicada automáticamente (BCV)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CasosTasas {
  /**
   * El historial del local con su política y sus alertas en `ahora`. No exige persona: la barra
   * de toda estación enseña con qué tasa se cobra (§5.2), también antes de entrar.
   */
  leer(ctx: Contexto, ahora?: number): Promise<HistorialTasasDto>;
  /**
   * Una página del historial completo (T-7, `TasasQuerySchema`), lo más reciente primero, con lo que
   * cuenta cada filtro. Lo lee cualquiera, como `leer`: la tasa no es un dato sensible.
   */
  pagina(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PaginaDeTasasDto>>;
  /**
   * Captura una tasa. La de administración se aplica al guardarla (ADR-019 §5), tecleada dos
   * veces si salta o es la primera; la de supervisión queda pendiente de confirmar con 🔐.
   */
  capturar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ExchangeRateDto>>;
  /**
   * Confirma una tasa para que se pueda cobrar con ella. `autorizacion` es la del 🔐 cuando
   * quien confirma es supervisión (id y PIN de quien autoriza, y el motivo).
   */
  confirmar(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<ExchangeRateDto>>;
  /** Quiénes pueden autorizar a quien opera a confirmar una tasa (vacío si no le hace falta). */
  autorizadores(ctx: Contexto): Promise<{ id: string; nombre: string }[]>;
  /**
   * Trae la tasa del BCV de sus fuentes (F3-04) y la aplica sola si nada indica un problema
   * (ADR-019): la dio la web oficial, hay vigente y no salta más del umbral. Si no, queda
   * pendiente con su motivo. Lo pide una persona con el botón o el servidor a su hora.
   */
  sincronizar(
    ctx: Contexto,
    opciones?: { fuentes?: readonly Lector[]; ahora?: number },
  ): Promise<Resultado<SincronizacionTasaDto>>;
}

type Fila = ExchangeRate & { confirmation: ExchangeRateConfirmation | null };

export function casosTasas(base: Base): CasosTasas {
  return {
    async leer(ctx, ahora = Date.now()) {
      const [filas, feriados, zona] = await base.conTenant(ctx.tenantId, async (tx) => [
        await tx.exchangeRate.findMany({ include: { confirmation: true }, orderBy: { capturedAt: "desc" }, take: TASAS_LEIDAS }),
        await diasFeriados(tx),
        await zonaDe(tx, ctx.branchId),
      ] as const);
      // Se revalida al salir: si lo guardado no cumple el contrato, se niega en vez de cobrar
      // con una tasa que el sistema no entiende (fail-closed).
      return HistorialTasasSchema.parse({
        tasas: filas.map(dto),
        umbralVariacionBasisPoints: UMBRAL_VARIACION_BPS,
        zonaHoraria: zona,
        feriados,
        alertas: alertasDe(filas.map(registro), ahora, feriados, zona),
      });
    },

    async pagina(ctx, entrada, ahora = Date.now()) {
      const v = TasasQuerySchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La consulta no es válida.", problemas: problemasDe(v.error) };
      const q = v.data;
      const [filas, feriados, zona] = await base.conTenant(ctx.tenantId, async (tx) => [
        await tx.exchangeRate.findMany({ where: q.par ? { pair: q.par } : {}, include: { confirmation: true }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }] }),
        await diasFeriados(tx),
        await zonaDe(tx, ctx.branchId),
      ] as const);
      const hoy = calendarDay(new Date(ahora).toISOString(), zona);
      // Sin confirmar: por confirmar mientras su día rija (o esté por venir); si su día pasó, no se usó.
      const enQueQuedo = (f: (typeof filas)[number]): Exclude<FiltroTasas, "TODAS"> => {
        if (f.confirmation) return "APLICADAS";
        const dia = f.effectiveDate.toISOString().slice(0, 10);
        return dia >= hoy || coversDay(dia, hoy, feriados) ? "POR_CONFIRMAR" : "NO_USADAS";
      };
      const conteos: Record<FiltroTasas, number> = { TODAS: filas.length, APLICADAS: 0, POR_CONFIRMAR: 0, NO_USADAS: 0 };
      for (const f of filas) conteos[enQueQuedo(f)] += 1;
      const elegidas = q.filtro === "TODAS" ? filas : filas.filter((f) => enQueQuedo(f) === q.filtro);
      const paginas = Math.max(1, Math.ceil(elegidas.length / q.porPagina));
      const pagina = Math.min(q.pagina, paginas);
      return {
        ok: true,
        valor: PaginaDeTasasSchema.parse({
          tasas: elegidas.slice((pagina - 1) * q.porPagina, pagina * q.porPagina).map(dto),
          total: elegidas.length,
          pagina,
          conteos,
        }),
      };
    },

    async capturar(ctx, entrada, ahora = Date.now()) {
      const v = CapturarTasaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La tasa no se capturó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const { feriados, zona } = await base.conTenant(ctx.tenantId, (tx) => calendarioDe(tx, ctx.branchId));
      const hoy = calendarDay(new Date(ahora).toISOString(), zona);
      const dia = v.data.effectiveDate;
      let negada = null as string | null;
      // Hacia atrás solo si todavía rige hoy (el sábado se puede cargar la del viernes; en un
      // feriado, la del día hábil anterior).
      if ((dia < hoy && !coversDay(dia, hoy, feriados)) || dia > addDays(hoy, DIAS_POR_ADELANTADO)) {
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

          // Quien confirma sin autorización (administración) la aplica al guardarla (ADR-019 §5):
          // el límite de cordura se cumple en el mismo formulario, tecleándola dos veces.
          const aplica = p === "PERMITIDO";
          const anterior = aplica ? await ultimaConfirmada(tx, v.data.pair, new Date(ahora).toISOString()) : null;
          const requiere = aplica && needsDoubleCheck(anterior, { value: v.data.value }, UMBRAL_VARIACION_BPS);
          const tecleado = v.data.valorVerificado;
          if (requiere && tecleado === undefined) {
            return {
              ok: false,
              motivo: "INVALIDO",
              mensaje: "Esta tasa se aparta mucho de la vigente, o es la primera: teclea el valor otra vez.",
              problemas: [{ path: ["valorVerificado"], message: "Hace falta teclearlo de nuevo" }],
            };
          }
          if (aplica && tecleado !== undefined && !mismoValor(v.data.pair, v.data.value, tecleado)) {
            negada = "El valor tecleado de nuevo no coincide";
            return {
              ok: false,
              motivo: "INVALIDO",
              mensaje: "Los dos valores no coinciden. Escríbelos otra vez.",
              problemas: [{ path: ["valorVerificado"], message: "No coincide" }],
            };
          }

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
          if (!aplica) return { ...fila, confirmation: null };

          const confirmacion = await tx.exchangeRateConfirmation.create({
            data: {
              tenantId: ctx.tenantId,
              rateId: fila.id,
              confirmedAt: new Date(ahora),
              confirmedBy: ctx.quien?.userId ?? null,
              confirmedByName: quien.nombre,
              doubleChecked: requiere,
            },
          });
          await auditar(tx, ctx, {
            action: "tasa.confirmar",
            entityType: "exchange_rate",
            entityId: fila.id,
            before: { confirmada: false, anterior: anterior ? { id: anterior.id, value: anterior.value } : null },
            after: { confirmada: true, alGuardar: true, pair: fila.pair, value: fila.value, effectiveDate: dia, doubleChecked: requiere },
          });
          return { ...fila, confirmation: confirmacion };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO" || negada) {
            await auditarRechazo(base, ctx, { action: "tasa.capturar", reason: negada ?? r.mensaje });
          }
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
          const hoy = calendarDay(instante, await zonaDe(tx, ctx.branchId));
          if (dia < hoy && !coversDay(dia, hoy, await diasFeriados(tx))) {
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
      // lint-permitido: transaccion-sin-consultas-a-la-vez — son peticiones de red a las fuentes, fuera de la transacción
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
      const { feriados, zona } = await base.conTenant(ctx.tenantId, (tx) => calendarioDe(tx, ctx.branchId));
      const hoy = calendarDay(new Date(ahora).toISOString(), zona);
      const hasta = addDays(hoy, DIAS_POR_ADELANTADO);
      const avisos: string[] = [];
      const porDia = new Map<string, LecturaDeTasa[]>();
      for (const l of buenas) {
        if (!coversDay(l.effectiveDate, hoy, feriados) && !(l.effectiveDate > hoy && l.effectiveDate <= hasta)) continue;
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
        const aplicadas: Fila[] = [];
        const yaEstaban: { effectiveDate: string; value: string }[] = [];
        for (const [i, { lectura, confirmadaPor }] of elegidas.entries()) {
          // Un milisegundo por tasa: dos del mismo par no comparten instante de captura, y cada
          // una se compara con lo que ya estaba confirmado en su instante (también la anterior
          // de esta misma consulta: la del lunes contra la del viernes).
          const instante = new Date(ahora + i);
          // ADR-019 §1: solo se aplica sola la que dio la web oficial del BCV.
          const oficial = confirmadaPor.some((l) => l.fuente === "BCV");
          const existentes = await tx.exchangeRate.findMany({
            where: { pair: lectura.pair, effectiveDate: new Date(`${lectura.effectiveDate}T00:00:00.000Z`) },
            include: { confirmation: true },
            orderBy: { capturedAt: "desc" },
          });
          const igual = existentes.find((e) => mismoValor(lectura.pair, e.value, lectura.value));
          if (igual) {
            yaEstaban.push({ effectiveDate: lectura.effectiveDate, value: lectura.value });
            // La trajo antes un proceso y quedó retenida (p. ej. solo respondía DolarApi, o era la
            // primera y ya hay vigente): se vuelve a mirar con lo que se sabe ahora. Una pendiente
            // tecleada por alguien no se toca: espera su confirmación con 🔐.
            const otraConfirmada = existentes.some((e) => e.confirmation && e.capturedAt >= igual.capturedAt);
            if (!igual.confirmation && igual.capturedBy === null && !otraConfirmada) {
              const anterior = await ultimaConfirmada(tx, lectura.pair, instante.toISOString());
              const decision = autoApplyDecision({ previous: anterior, candidate: lectura, official: oficial });
              if (decision.apply) aplicadas.push(await aplicarSola(tx, ctx, igual, anterior, instante));
            }
            continue;
          }

          const anterior = await ultimaConfirmada(tx, lectura.pair, instante.toISOString());
          const decision = autoApplyDecision({ previous: anterior, candidate: lectura, official: oficial });
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
              capturedAt: instante,
              capturedBy: null,
              capturedByName: canal,
              rawPayload: { lecturas: confirmadaPor.map((l) => ({ fuente: l.fuente, ...l.crudo })) } as Prisma.InputJsonValue,
              heldBack: decision.apply ? null : decision.reason,
            },
          });
          capturadas.push(decision.apply ? await aplicarSola(tx, ctx, { ...fila, confirmation: null }, anterior, instante) : { ...fila, confirmation: null });
        }
        await auditar(tx, ctx, {
          action: "tasa.sincronizar",
          entityType: "exchange_rate",
          after: {
            capturadas: capturadas.map((c) => ({
              id: c.id,
              value: c.value,
              effectiveDate: diaDe(c.effectiveDate),
              aplicada: c.confirmation !== null,
              ...(c.heldBack ? { retenida: c.heldBack } : {}),
            })),
            aplicadas: aplicadas.map((c) => ({ id: c.id, value: c.value, effectiveDate: diaDe(c.effectiveDate) })),
            yaEstaban,
            fuentes: informe,
            avisos,
          },
        });
        return { capturadas, aplicadas, yaEstaban };
      });

      return {
        ok: true,
        valor: {
          capturadas: r.capturadas.map(dto),
          aplicadas: r.aplicadas.map(dto),
          yaEstaban: r.yaEstaban,
          fuentes: informe,
          avisos,
        },
      };
    },
  };
}

/**
 * Aplica sola una tasa traída del BCV (ADR-019): añade su confirmación automática, sin persona
 * detrás, y su asiento. Solo la llama `sincronizar` después de que `autoApplyDecision` lo permita.
 */
async function aplicarSola(tx: Transaccion, ctx: Contexto, tasa: Fila, anterior: RateRecord | null, instante: Date): Promise<Fila> {
  const confirmacion = await tx.exchangeRateConfirmation.create({
    data: {
      tenantId: ctx.tenantId,
      rateId: tasa.id,
      confirmedAt: instante,
      confirmedBy: null,
      confirmedByName: APLICADA_AUTOMATICAMENTE,
      doubleChecked: false,
      automatic: true,
    },
  });
  await auditar(tx, ctx, {
    action: "tasa.aplicar",
    entityType: "exchange_rate",
    entityId: tasa.id,
    before: { confirmada: false, anterior: anterior ? { id: anterior.id, value: anterior.value } : null },
    after: { confirmada: true, automatica: true, pair: tasa.pair, value: tasa.value, effectiveDate: diaDe(tasa.effectiveDate) },
  });
  return { ...tasa, confirmation: confirmacion };
}

const MOTIVO_RETENIDA: Readonly<Record<HeldReason, string>> = {
  PRIMERA: "es la primera del local y no hay otra con la que compararla",
  SALTO: `se aparta más del ${UMBRAL_VARIACION_BPS / 100} % de la vigente`,
  SOLO_TERCERO: "solo la dio DolarApi, no la web del BCV",
};

const DIA_LEGIBLE = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const diaLegible = (dia: string) => DIA_LEGIBLE.format(new Date(`${dia}T12:00:00.000Z`));

/**
 * Lo que alguien tiene que mirar (ADR-019), en el instante `ahora`: cada tasa del BCV que no se
 * aplicó sola y todavía importa (crítica) y, a la hora habitual, la del siguiente día hábil que
 * no ha llegado (aviso). La decisión es del dominio; aquí solo se pone en palabras.
 */
function alertasDe(tasas: readonly RateRecord[], ahora: number, feriados: Holidays, zona: string): HistorialTasasDto["alertas"] {
  const instante = new Date(ahora).toISOString();
  const hoy = calendarDay(instante, zona);
  const alertas: HistorialTasasDto["alertas"] = heldRates(tasas, "USD/VES", hoy, feriados).map((t) => ({
    tipo: "RETENIDA",
    tono: "crit",
    rateId: t.id,
    mensaje: `La tasa del BCV del ${diaLegible(t.effectiveDate)} no se aplicó sola: ${MOTIVO_RETENIDA[t.heldBack!]}. Revísala y confírmala.`,
  }));
  const falta = missingNextBusinessDayRate(tasas, "USD/VES", instante, zona, HORA_AVISO_SIGUIENTE, feriados);
  if (falta) {
    alertas.push({
      tipo: "FALTA_SIGUIENTE",
      tono: "warn",
      mensaje: `El BCV no ha publicado la tasa del ${diaLegible(falta)}. Si no llega, cárgala a mano.`,
    });
  }
  return alertas;
}

/**
 * Lo que decide con qué tasa se puede cerrar un cobro (B3-3): el historial reciente del local, en la
 * forma del dominio, y sus feriados bancarios. Lo usa `citedRateValid`.
 */
/** Lo que decide qué día es hoy y qué tasa lo cubre: los feriados bancarios y la zona de la sucursal. */
async function calendarioDe(tx: Transaccion, branchId: string): Promise<{ feriados: Holidays; zona: string }> {
  const feriados = await diasFeriados(tx);
  return { feriados, zona: await zonaDe(tx, branchId) };
}

export async function historialParaCobrar(tx: Transaccion): Promise<{ registros: RateRecord[]; feriados: Holidays }> {
  const filas = await tx.exchangeRate.findMany({ include: { confirmation: true }, orderBy: { capturedAt: "desc" }, take: TASAS_LEIDAS });
  const feriados = await diasFeriados(tx);
  return { registros: filas.map(registro), feriados };
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
    ...(esRetenida(f.heldBack) ? { heldBack: f.heldBack } : {}),
  };
}

const esRetenida = (v: string | null): v is HeldReason => v === "PRIMERA" || v === "SALTO" || v === "SOLO_TERCERO";

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
          ...(c.automatic ? { automatic: true } : {}),
        }
      : {}),
    ...(esRetenida(f.heldBack) ? { heldBack: f.heldBack } : {}),
  };
}
