/**
 * Vincular pulseras a una mesa, en el servidor — F6-05, D2, B6-3.
 *
 * Vincular mueve a la cuenta de la mesa lo que todavía se debe del parque de esas estancias (el
 * paquete y el excedente pendientes), para que la familia pague todo de una vez (la «cuenta
 * maestra»). Puede juntar niños de más de una familia en la misma mesa: cada estancia se vincula una
 * sola vez, ni a esta mesa ni a otra (R3), y lo mueve `@l2/domain-cash` (`moveSessionLines`) con un id
 * propio para la línea que nace en la mesa.
 *
 * Quién decide qué:
 *  · el dominio (`@l2/domain-cash`): qué línea se mueve y cómo queda cada cuenta;
 *  · este archivo: el permiso, que la estancia esté activa y sin vincular, la mesa (con el candado de
 *    las mesas, el mismo del plano) y que todo —la mesa y cada familia tocada— se guarde junto.
 */
import { randomUUID } from "node:crypto";
import {
  FamilyAccountSchema,
  VincularPulserasCommandSchema,
  problemasDe,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
  type VincularPulserasResultDto,
} from "@l2/contracts";
import { moveSessionLines, type AccountLineDoc } from "@l2/domain-cash";
import { add, money } from "@l2/domain-money";
import { errorDeBase, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { claveSecundaria, crearCuentaDeMesa, guardarVersion, vigenteDe } from "../caja/cuentas.ts";
import { candadoDeMesas, mesaParaCuentaNueva, mesasOcupadasEn, sessionsVinculadas } from "./plano.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";

export interface CasosMesas {
  /**
   * Vincula pulseras a una mesa (`VincularPulserasCommandSchema`). Reenviar la misma `idempotencyKey`
   * devuelve lo que ya quedó, sin volver a mover nada.
   */
  vincular(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<VincularPulserasResultDto>>;
}

export function casosMesas(base: Base): CasosMesas {
  return {
    async vincular(ctx, entrada, ahora = Date.now()) {
      const v = VincularPulserasCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "No se vinculó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<VincularPulserasResultDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.vincularMesa");
          if (rechazo) return rechazo;

          // El reintento (se cortó la red) devuelve lo que ya quedó: la mesa, con la clave del mando, y
          // cada familia que tocó, que se encuentran desde sus estancias.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.cause !== "VINCULAR") return conflictoDeClave;
            const mesaVigente = await vigenteDe(tx, previa.accountId);
            if (!mesaVigente) return conflictoDeClave;
            const deLasEstancias = await tx.parkSession.findMany({ where: { id: { in: cmd.sessionIds }, branchId: ctx.branchId }, select: { accountId: true } });
            const familiaIds = [...new Set(deLasEstancias.map((s) => s.accountId))];
            const familias: FamilyAccountDto[] = [];
            for (const id of familiaIds) familias.push((await vigenteDe(tx, id))!.cuenta);
            return { mesa: mesaVigente.cuenta, familias };
          }

          const sesiones = await tx.parkSession.findMany({ where: { id: { in: cmd.sessionIds }, branchId: ctx.branchId } });
          if (sesiones.length !== cmd.sessionIds.length) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Una de esas pulseras no está en esta sucursal." };
          }
          const noActiva = sesiones.find((s) => s.status !== "ACTIVA");
          if (noActiva) return { ok: false, motivo: "CONFLICTO", mensaje: "Una de esas estancias ya salió del parque." };

          // La mesa: su cuenta abierta, o una nueva si está en el salón (I-05, con el candado de las mesas).
          await candadoDeMesas(tx, ctx.branchId);

          // R3: un niño vinculado no se ofrece para otra mesa, ni se vincula dos veces a la misma.
          const vinculadas = await sessionsVinculadas(tx, ctx.branchId);
          const yaVinculada = cmd.sessionIds.find((id) => vinculadas.has(id));
          if (yaVinculada) {
            const otra = vinculadas.get(yaVinculada)!;
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: otra.tableId === cmd.tableId ? "Esa pulsera ya está vinculada a esta mesa." : `Esa pulsera ya está vinculada a la mesa ${otra.label}.`,
            };
          }

          const abierta = (await mesasOcupadasEn(tx, ctx.branchId)).get(cmd.tableId);
          const mesaVigente = abierta ? await vigenteDe(tx, abierta) : null;
          let label: string;
          if (mesaVigente) {
            label = mesaVigente.cuenta.tableLabel ?? "?";
          } else {
            const r = await mesaParaCuentaNueva(tx, ctx.branchId, cmd.tableId);
            if ("ok" in r) return { ...r, ...(r.problemas ? { problemas: r.problemas.map((p) => ({ ...p, path: ["tableId"] })) } : {}) };
            label = r.label;
          }
          const mesaAccountId = abierta ?? randomUUID();

          // Por cuenta de familia: cada estancia mueve lo pendiente de su propia cuenta.
          const porCuenta = new Map<string, string[]>();
          for (const s of sesiones) porCuenta.set(s.accountId, [...(porCuenta.get(s.accountId) ?? []), s.id]);

          const quien = await nombreDe(tx, ctx);
          const familias: FamilyAccountDto[] = [];
          const lineasParaLaMesa: AccountLineDoc[] = [];
          for (const [accountId, ids] of porCuenta) {
            const actual = (await vigenteDe(tx, accountId))!;
            const { familia, lineasNuevas } = moveSessionLines(actual.cuenta, ids, mesaAccountId, () => randomUUID());
            lineasParaLaMesa.push(...lineasNuevas);
            const nuevaFamilia = FamilyAccountSchema.parse({ ...familia, version: actual.version + 1 });
            await guardarVersion(tx, ctx, nuevaFamilia, { cause: "VINCULAR", operationKey: claveSecundaria(cmd.idempotencyKey, accountId), ahora, quien: quien.nombre });
            familias.push(nuevaFamilia);
          }

          const mesa: FamilyAccountDto = mesaVigente
            ? FamilyAccountSchema.parse({
                ...mesaVigente.cuenta,
                sessionIds: [...new Set([...mesaVigente.cuenta.sessionIds, ...cmd.sessionIds])],
                lines: [...mesaVigente.cuenta.lines, ...lineasParaLaMesa],
                version: mesaVigente.version + 1,
              })
            : await crearCuentaDeMesa(tx, ctx, {
                id: mesaAccountId,
                tableId: cmd.tableId,
                label,
                lines: lineasParaLaMesa,
                sessionIds: cmd.sessionIds,
                ahora,
                quien: quien.nombre,
              });
          await guardarVersion(tx, ctx, mesa, { cause: "VINCULAR", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });

          const movido = lineasParaLaMesa.reduce((acc, l) => add(acc, money(BigInt(l.amount.minor), "USD")), money(0n, "USD"));
          await auditar(tx, ctx, {
            action: "mesa.vincular",
            entityType: "account",
            entityId: mesaAccountId,
            after: {
              mesa: label,
              pulseras: sesiones.map((s) => s.wristbandCode),
              movido: { minor: String(movido.amount), currency: movido.currency },
              version: mesa.version ?? null,
            },
          });
          return { mesa, familias };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "mesa.vincular", reason: r.mensaje });
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
