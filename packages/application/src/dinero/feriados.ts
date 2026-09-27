/**
 * Los feriados bancarios en el servidor — B2-4, D-FER.
 *
 * Los carga administración por año desde el calendario de SUDEBAN; deciden qué tasa cubre qué día
 * (`@l2/domain-rates`: un feriado no es día hábil, y lo cubre la tasa del día hábil anterior). Por
 * eso son de `catalogo.modificar` con elevación, y cada alta y cada retiro quedan en la auditoría.
 * No se borran: uno registrado por error se retira (la tabla lo impone).
 */
import {
  FeriadoSchema,
  FeriadosSchema,
  RegistrarFeriadoCommandSchema,
  RetirarFeriadoCommandSchema,
  problemasDe,
  type FeriadoDto,
  type FeriadosDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { holidayProblem, type Holidays } from "@l2/domain-rates";
import { errorDeBase, type Base, type BankHoliday, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";

export interface CasosFeriados {
  /** Los feriados vigentes del local. No exige persona: la tasa de toda estación depende de ellos. */
  listar(ctx: Contexto): Promise<FeriadosDto>;
  registrar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FeriadoDto>>;
  retirar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FeriadoDto>>;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Los días feriados vigentes, para las reglas de la tasa, dentro de una transacción abierta. */
export async function diasFeriados(tx: Transaccion): Promise<Holidays> {
  const filas = await tx.bankHoliday.findMany({ where: { retiredAt: null }, select: { day: true } });
  return filas.map((f) => dia(f.day));
}

export function casosFeriados(base: Base): CasosFeriados {
  return {
    async listar(ctx) {
      const filas = await base.conTenant(ctx.tenantId, (tx) =>
        tx.bankHoliday.findMany({ where: { retiredAt: null }, orderBy: { day: "asc" } }),
      );
      return FeriadosSchema.parse({ feriados: filas.map(dto) });
    },

    async registrar(ctx, entrada, ahora = Date.now()) {
      const v = RegistrarFeriadoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El feriado no se registró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const problema = holidayProblem(v.data.dia);
      if (problema) {
        return {
          ok: false,
          motivo: "INVALIDO",
          mensaje: problema === "FIN_DE_SEMANA" ? "Un sábado o un domingo ya no es día hábil: no hace falta marcarlo." : "Ese día no existe.",
          problemas: [{ path: ["dia"], message: problema }],
        };
      }
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<BankHoliday | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const quien = await nombreDe(tx, ctx);
          const fila = await tx.bankHoliday.create({
            data: {
              tenantId: ctx.tenantId,
              day: new Date(`${v.data.dia}T00:00:00.000Z`),
              name: v.data.nombre,
              createdAt: new Date(ahora),
              createdBy: ctx.quien?.userId ?? null,
              createdByName: quien.nombre,
            },
          });
          await auditar(tx, ctx, { action: "feriado.registrar", entityType: "bank_holiday", entityId: fila.id, after: { dia: v.data.dia, nombre: fila.name } });
          return fila;
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "feriado.registrar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: dto(r) };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Ese día ya está registrado como feriado.", problemas: [{ path: ["dia"], message: "Ya registrado" }] };
        }
        throw e;
      }
    },

    async retirar(ctx, entrada, ahora = Date.now()) {
      const v = RetirarFeriadoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El feriado no se retiró: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<BankHoliday | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
        if (rechazo) return rechazo;
        const fila = await tx.bankHoliday.findUnique({ where: { id: v.data.feriadoId } });
        if (!fila || fila.retiredAt) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese feriado no está registrado." };
        const quien = await nombreDe(tx, ctx);
        const retirado = await tx.bankHoliday.update({
          where: { id: fila.id },
          data: { retiredAt: new Date(ahora), retiredBy: ctx.quien?.userId ?? null, retiredByName: quien.nombre },
        });
        await auditar(tx, ctx, {
          action: "feriado.retirar",
          entityType: "bank_holiday",
          entityId: fila.id,
          before: { dia: dia(fila.day), nombre: fila.name },
          after: { retirado: true },
        });
        return retirado;
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "feriado.retirar", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: dto(r) };
    },
  };
}

function dto(f: BankHoliday): FeriadoDto {
  return FeriadoSchema.parse({ id: f.id, dia: dia(f.day), nombre: f.name, registradoPor: f.createdByName, registradoEl: f.createdAt.toISOString() });
}
