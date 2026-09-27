/**
 * Las alícuotas en el servidor — B2-2, F3-06, F3-07, §5.3.
 *
 * Programar añade una fila; ninguna se reescribe (regla 5, la tabla lo impone). Quién decide qué:
 *  · el dominio (`@l2/domain-tax`): el calendario de lo programado (`taxTimeline`), qué se puede
 *    programar (`scheduleProblem`) y con qué se cobra en un instante;
 *  · la matriz: programar es `catalogo.modificar` (administración, con elevación), porque mueve
 *    lo que cobra el negocio;
 *  · este archivo: que el día que manda el navegador se convierta en un instante del local, en una
 *    transacción, con su asiento.
 */
import {
  ImpuestosSchema,
  ProgramarImpuestoCommandSchema,
  problemasDe,
  type ImpuestosDto,
  type Rechazo,
  type Resultado,
  type VigenciaImpuestoDto,
} from "@l2/contracts";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import { scheduleProblem, taxTimeline, type ScheduledTaxRate, type TaxPeriod } from "@l2/domain-tax";
import { errorDeBase, type Base, type TaxRate } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { ZONA_DEL_LOCAL } from "./tasas.ts";

/** Hasta cuántos días por delante se programa: una gaceta llega con semanas, no con años. */
export const DIAS_POR_ADELANTADO_IMPUESTOS = 366;

export interface CasosImpuestos {
  /**
   * El calendario de los impuestos del local: lo que rigió, lo que rige y lo programado. No exige
   * persona: la caja de toda estación calcula con él.
   */
  leer(ctx: Contexto): Promise<ImpuestosDto>;
  /**
   * Programa una alícuota desde un día: hoy rige desde este instante; otro día, desde su
   * medianoche en el local. Nunca hacia atrás (F3-06).
   */
  programar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<VigenciaImpuestoDto>>;
}

export function casosImpuestos(base: Base): CasosImpuestos {
  return {
    async leer(ctx) {
      const filas = await base.conTenant(ctx.tenantId, (tx) => tx.taxRate.findMany({ orderBy: { scheduledAt: "asc" } }));
      // Se revalida al salir: si lo guardado no cumple el contrato, se niega en vez de cobrar con
      // un impuesto que el sistema no entiende (fail-closed).
      return ImpuestosSchema.parse({
        vigencias: vigenciasDe(filas),
        zonaHoraria: ZONA_DEL_LOCAL,
        diasPorAdelantado: DIAS_POR_ADELANTADO_IMPUESTOS,
      });
    },

    async programar(ctx, entrada, ahora = Date.now()) {
      const v = ProgramarImpuestoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El impuesto no se programó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const hoy = calendarDay(new Date(ahora).toISOString(), ZONA_DEL_LOCAL);
      const { impuesto, code, basisPoints, dia } = v.data;
      if (dia < hoy || dia > addDays(hoy, DIAS_POR_ADELANTADO_IMPUESTOS)) {
        return {
          ok: false,
          motivo: "INVALIDO",
          mensaje:
            dia < hoy
              ? "Un impuesto no se programa hacia atrás: lo ya vendido se queda con la alícuota que tenía."
              : `Solo se programa con hasta ${DIAS_POR_ADELANTADO_IMPUESTOS} días de adelanto.`,
          problemas: [{ path: ["dia"], message: "Día fuera de rango" }],
        };
      }
      // Hoy, desde ya: lo cobrado esta mañana se queda como se cobró. Otro día, desde su comienzo.
      const desde = dia === hoy ? ahora : startOfDay(dia, ZONA_DEL_LOCAL);
      const problema = scheduleProblem({ kind: impuesto, code, basisPoints, effectiveFrom: desde }, ahora);
      if (problema) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El impuesto no se programó: hay datos que corregir.", problemas: [{ path: ["dia"], message: problema }] };
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<{ fila: TaxRate; todas: TaxRate[] } | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const antes = await tx.taxRate.findMany({ where: { tax: impuesto } });
          // Lo que no cambia el calendario no se guarda: ya rige esa alícuota ese día.
          const calendario = (filas: ScheduledTaxRate[]) =>
            taxTimeline(filas)
              .filter((p) => p.code === code)
              .map((p) => `${p.basisPoints}@${p.effectiveFrom}-${p.effectiveTo ?? ""}`)
              .join("|");
          const nueva: ScheduledTaxRate = { id: "nueva", kind: impuesto, code, basisPoints, effectiveFrom: desde, scheduledAt: ahora };
          if (calendario(antes.map(programada)) === calendario([...antes.map(programada), nueva])) {
            return {
              ok: false,
              motivo: "INVALIDO",
              mensaje: "No cambia nada: ese día ya rige esa alícuota.",
              problemas: [{ path: ["basisPoints"], message: "Ese día ya rige esa alícuota" }],
            };
          }
          const quien = await nombreDe(tx, ctx);
          const fila = await tx.taxRate.create({
            data: {
              tenantId: ctx.tenantId,
              tax: impuesto,
              code,
              basisPoints,
              effectiveFrom: new Date(desde),
              scheduledAt: new Date(ahora),
              scheduledBy: ctx.quien?.userId ?? null,
              scheduledByName: quien.nombre,
            },
          });
          // §7.4: lo que regía en ese instante y lo que regirá.
          const previa = rigeEn(taxTimeline(antes.map(programada)), impuesto, code, desde);
          await auditar(tx, ctx, {
            action: "impuesto.programar",
            entityType: "tax_rate",
            entityId: fila.id,
            before: previa ? { impuesto, code, basisPoints: previa.basisPoints, desde: new Date(previa.effectiveFrom).toISOString() } : null,
            after: { impuesto, code, basisPoints, desde: new Date(desde).toISOString(), dia },
          });
          return { fila, todas: [...antes, fila] };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "impuesto.programar", reason: r.mensaje });
          return r;
        }
        // El tramo que rige desde ese día: el nuevo o, si cancela un cambio programado, el que sigue.
        const desdeIso = new Date(desde).toISOString();
        const vigencia = vigenciasDe(r.todas).find(
          (x) => x.impuesto === impuesto && x.code === code && x.desde <= desdeIso && (x.hasta === null || desdeIso < x.hasta),
        )!;
        return { ok: true, valor: vigencia };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Se programó otro cambio del mismo impuesto en el mismo instante. Vuelve a intentarlo." };
        }
        throw e;
      }
    },
  };
}

/** La fila, como la entiende el dominio. */
function programada(f: TaxRate): ScheduledTaxRate {
  return {
    id: f.id,
    kind: f.tax === "IGTF" ? "IGTF" : "IVA",
    code: f.code === "GENERAL" || f.code === "REDUCIDA" ? f.code : null,
    basisPoints: f.basisPoints,
    effectiveFrom: f.effectiveFrom.getTime(),
    scheduledAt: f.scheduledAt.getTime(),
  };
}

/** El tramo del impuesto (y trato) que rige en `at`, si hay alguno. */
function rigeEn(tramos: readonly TaxPeriod[], impuesto: string, code: string | null, at: number): TaxPeriod | undefined {
  return tramos.find((p) => p.kind === impuesto && p.code === code && p.effectiveFrom <= at && (p.effectiveTo === null || at < p.effectiveTo));
}

/** El calendario resuelto, en la forma del contrato, con quién programó cada tramo. */
function vigenciasDe(filas: readonly TaxRate[]): VigenciaImpuestoDto[] {
  const porId = new Map(filas.map((f) => [f.id, f]));
  return taxTimeline(filas.map(programada)).map((p) => {
    const f = porId.get(p.id)!;
    return {
      id: p.id,
      impuesto: p.kind,
      code: p.code,
      basisPoints: p.basisPoints,
      desde: new Date(p.effectiveFrom).toISOString(),
      hasta: p.effectiveTo === null ? null : new Date(p.effectiveTo).toISOString(),
      programadaEl: f.scheduledAt.toISOString(),
      programadaPor: f.scheduledByName,
    };
  });
}
