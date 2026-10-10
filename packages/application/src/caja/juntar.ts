/**
 * Cobrar juntas — B3-16 (M-37, U-2, U-7).
 *
 * En la cola de la caja se eligen varias cuentas del mismo cliente (la de su familia, que salió sin vincular la
 * pulsera, y la de su mesa) y se cobran una vez, con un solo recibo. Lo pendiente de las otras pasa a la que queda como
 * al vincular: en cada una la línea se queda marcada `movedTo` y en la que queda nace su igual, con de dónde vino
 * (`vieneDe`). Las otras salen de la cola «juntadas en #N». Nada se borra.
 *
 * No se juntan: las de un cumpleaños, las cerradas, las que ya cobraron una parte de su división, las que llevan un
 * descuento, las que otra persona está cobrando (su cobro en curso, B3-13) ni, como otra, la que cobra una deuda (al
 * cobrarse entera la salda: puede ser la que queda). Cada cuenta, con la versión que vio la caja.
 *
 * Quién decide qué: el dominio (`joinProblem`, `joinInto`) qué se mueve y cómo queda cada cuenta; este archivo el
 * permiso de la caja, las versiones, el cobro en curso, la deuda y que todo se guarde junto, con su asiento.
 */
import { randomUUID } from "node:crypto";
import {
  FamilyAccountSchema,
  JuntarCuentasCommandSchema,
  problemasDe,
  type FamilyAccountDto,
  type JuntarCuentasResultDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { joinInto, joinProblem, type JoinProblem } from "@l2/domain-cash";
import { add, money, zero } from "@l2/domain-money";
import { errorDeBase, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import { borrarBorradorEn } from "./borrador.ts";
import { claveSecundaria, guardarVersion, vigenteDe } from "./cuentas.ts";

export interface CasosJuntar {
  /**
   * Junta varias cuentas en una para cobrarlas juntas (`JuntarCuentasCommandSchema`). Reenviar la misma
   * `idempotencyKey` devuelve lo que ya quedó, sin mover nada otra vez.
   */
  juntar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<JuntarCuentasResultDto>>;
}

/** Por qué no se junta una cuenta, dicho en la caja con su número de orden. */
const MOTIVO: Record<JoinProblem, (orden: string) => string> = {
  EVENTO: (o) => `${o} es de un cumpleaños: la cobra su reserva, sola.`,
  CERRADA: (o) => `${o} ya no está por cobrar.`,
  COBRO_EN_CURSO: (o) => `${o} ya cobró una parte de su división: termina de cobrarla primero.`,
  CON_DESCUENTO: (o) => `${o} lleva un descuento: quítalo, o cóbrala sola.`,
  SIN_PENDIENTE: (o) => `${o} no tiene nada que cobrar.`,
};

const cuentaCambiada = (orden: string): Rechazo => ({
  ok: false,
  motivo: "CONFLICTO",
  mensaje: `Otro equipo cambió ${orden} mientras la tenías a la vista. Revísala y vuelve a intentarlo.`,
});

/** «#0123», como lo dice la caja; «La cuenta» si todavía no tiene número. */
function numeroDeOrden(c: FamilyAccountDto): string {
  return c.orderNumber ? `#${String(c.orderNumber).padStart(4, "0")}` : "La cuenta";
}

export function casosJuntar(base: Base): CasosJuntar {
  return {
    async juntar(ctx, entrada, ahora = Date.now()) {
      const v = JuntarCuentasCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se juntaron: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<JuntarCuentasResultDto | Rechazo> => {
          // Lo hace la caja, que es quien cobra.
          const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
          if (rechazo) return rechazo;

          // El reintento (se cortó la red) devuelve lo que ya quedó.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.cause !== "JUNTAR" || previa.accountId !== cmd.destino.accountId) return conflictoDeClave;
            const otras: FamilyAccountDto[] = [];
            for (const o of cmd.otras) otras.push((await vigenteDe(tx, o.accountId))!.cuenta);
            return { destino: (await vigenteDe(tx, cmd.destino.accountId))!.cuenta, otras };
          }

          // Cada cuenta, de esta sucursal y en la versión que vio la caja.
          const pedidas = [cmd.destino, ...cmd.otras];
          const filas = await tx.account.findMany({ where: { id: { in: pedidas.map((p) => p.accountId) } }, select: { id: true, branchId: true } });
          if (filas.length !== pedidas.length || filas.some((f) => f.branchId !== ctx.branchId)) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Una de esas cuentas no existe en esta sucursal." };
          }
          const vigentes = [];
          for (const p of pedidas) {
            const vig = (await vigenteDe(tx, p.accountId))!;
            const orden = numeroDeOrden(vig.cuenta);
            if (vig.version !== p.version) return cuentaCambiada(orden);
            const problema = joinProblem(vig.cuenta);
            if (problema) return { ok: false, motivo: "CONFLICTO", mensaje: MOTIVO[problema](orden), problemas: [{ path: ["otras"], message: problema }] };
            vigentes.push(vig);
          }

          // El cobro en curso de otra persona (B3-13): no se le mueve la cuenta debajo.
          const ids = pedidas.map((p) => p.accountId);
          const borradores = await tx.chargeDraft.findMany({ where: { accountId: { in: ids } }, select: { accountId: true, updatedBy: true, updatedByName: true } });
          const ajeno = borradores.find((b) => b.updatedBy !== (ctx.quien?.userId ?? null));
          if (ajeno) {
            const orden = numeroDeOrden(vigentes.find((x) => x.cuenta.id === ajeno.accountId)!.cuenta);
            return { ok: false, motivo: "CONFLICTO", mensaje: `${ajeno.updatedByName} está cobrando ${orden}: que termine o la deje antes de juntarla.` };
          }
          // La que cobra una deuda la salda al cobrarse entera: puede quedar, pero no juntarse en otra.
          const deDeuda = await tx.customerDebtCollection.findFirst({ where: { accountId: { in: cmd.otras.map((o) => o.accountId) } }, select: { accountId: true } });
          if (deDeuda) {
            const orden = numeroDeOrden(vigentes.find((x) => x.cuenta.id === deDeuda.accountId)!.cuenta);
            return { ok: false, motivo: "CONFLICTO", mensaje: `${orden} cobra una deuda: elige que quede ella y junta las otras en ella.` };
          }

          const [destinoVig, ...otrasVig] = vigentes;
          const quedan = destinoVig!.cuenta;
          const juntadaEn = { cuentaId: quedan.id, ...(quedan.orderNumber ? { orderNumber: quedan.orderNumber } : {}) };
          let destino: FamilyAccountDto = quedan;
          const otras: FamilyAccountDto[] = [];
          let movido = zero("USD");
          for (const o of otrasVig) {
            const origen = {
              cuentaId: o.cuenta.id,
              ...(o.cuenta.orderNumber ? { orderNumber: o.cuenta.orderNumber } : {}),
              family: o.cuenta.family,
              kind: o.cuenta.kind,
              ...(o.cuenta.dePie ? { dePie: true as const } : {}),
            };
            const antes = destino.lines.length;
            const r = joinInto(destino, quedan.id, o.cuenta, origen, juntadaEn, () => randomUUID());
            destino = r.destino;
            for (const l of destino.lines.slice(antes)) movido = add(movido, money(BigInt(l.amount.minor), "USD"));
            const { pendingSince: _, ...sinEspera } = r.otra;
            otras.push(FamilyAccountSchema.parse({ ...sinEspera, version: o.version + 1 }));
          }
          // En la cola desde la que más lleva esperando de todas.
          const instante = new Date(ahora).toISOString();
          const desde = vigentes.map((x) => x.cuenta.pendingSince).filter((x): x is string => x !== undefined).sort()[0] ?? instante;
          const final = FamilyAccountSchema.parse({ ...destino, pendingSince: desde, version: destinoVig!.version + 1 });

          const quien = await nombreDe(tx, ctx);
          await guardarVersion(tx, ctx, final, { cause: "JUNTAR", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          for (const o of otras) {
            await guardarVersion(tx, ctx, o, { cause: "JUNTAR", operationKey: claveSecundaria(cmd.idempotencyKey, o.id), ahora, quien: quien.nombre });
            // Su cobro en curso, si lo había empezado esta misma persona, ya no tiene qué cobrar.
            await borrarBorradorEn(tx, o.id);
          }
          await auditar(tx, ctx, {
            action: "cuenta.juntar",
            entityType: "account",
            entityId: final.id,
            after: {
              orden: final.orderNumber ?? null,
              juntadas: otras.map((o) => o.orderNumber ?? null),
              movido: { minor: String(movido.amount), currency: movido.currency },
            },
          });
          return { destino: final, otras };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.juntar", reason: r.mensaje });
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
