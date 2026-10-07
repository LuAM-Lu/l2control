/**
 * Las cuentas del salón en el servidor: sentar a una familia (B6-7) y vincular pulseras a una mesa (F6-05,
 * D2, B6-3).
 *
 * Sentar abre la cuenta de la familia en su mesa —una más, si la mesa es compartida (M-27, P-3)— o una
 * cuenta de pie para quien pide sin mesa (P-2). Desde entonces el plano sabe que la mesa está ocupada,
 * cuántas personas hay y desde cuándo: lo dice la base, no el bus del salón.
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
  AbrirCuentaDelSalonCommandSchema,
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
import { claveSecundaria, crearCuentaDeMesa, crearCuentaDePie, guardarVersion, vigenteDe } from "../caja/cuentas.ts";
import { candadoDeMesas, cuentaDeMesaPara, cuentasDePieEn, mesaParaCuentaNueva, sessionsVinculadas } from "./plano.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";

export interface CasosMesas {
  /**
   * Sienta a una familia (`AbrirCuentaDelSalonCommandSchema`, B6-7): abre su cuenta en una mesa —una más si
   * la mesa es compartida— o una cuenta de pie. Reenviar el mismo `cuentaId` devuelve la que ya se abrió.
   */
  abrir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
  /**
   * Vincula pulseras a una mesa (`VincularPulserasCommandSchema`). Reenviar la misma `idempotencyKey`
   * devuelve lo que ya quedó, sin volver a mover nada.
   */
  vincular(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<VincularPulserasResultDto>>;
}

export function casosMesas(base: Base): CasosMesas {
  return {
    async abrir(ctx, entrada, ahora = Date.now()) {
      const v = AbrirCuentaDelSalonCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La cuenta no se abrió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
          // Sentar a alguien es parte de atender el salón: lo hace quien toma pedidos.
          const rechazo = await exigirPermiso(tx, ctx, "pedido.tomar");
          if (rechazo) return rechazo;

          // El reintento (se cortó la red) devuelve la cuenta que ya se abrió con ese id.
          const previa = await tx.account.findUnique({ where: { id: cmd.cuentaId }, select: { branchId: true } });
          if (previa) {
            const vigente = previa.branchId === ctx.branchId ? await vigenteDe(tx, cmd.cuentaId) : null;
            const misma = vigente !== null && (cmd.tableId === undefined ? vigente.cuenta.dePie === true : vigente.cuenta.tableId === cmd.tableId);
            return misma ? vigente.cuenta : { ok: false, motivo: "CONFLICTO", mensaje: "Ese identificador de cuenta ya existe." };
          }

          await candadoDeMesas(tx, ctx.branchId);
          const quien = await nombreDe(tx, ctx);
          let cuenta: FamilyAccountDto;
          if (cmd.tableId !== undefined) {
            const r = await mesaParaCuentaNueva(tx, ctx.branchId, cmd.tableId, { ...(cmd.nombre ? { nombre: cmd.nombre } : {}), vistas: cmd.vistas });
            if ("ok" in r) return { ...r, ...(r.problemas ? { problemas: r.problemas.map((p) => ({ ...p, path: p.path[0] === "cuenta" ? ["tableId"] : p.path })) } : {}) };
            cuenta = await crearCuentaDeMesa(tx, ctx, {
              id: cmd.cuentaId,
              tableId: cmd.tableId,
              label: r.label,
              ...(cmd.nombre ? { nombre: cmd.nombre } : {}),
              comensales: cmd.comensales,
              lines: [],
              ahora,
              quien: quien.nombre,
            });
          } else {
            // Dos cuentas de pie con el mismo nombre se confunden al llamarlas: la segunda lleva otro.
            const nombre = cmd.nombre!;
            const dePie = await cuentasDePieEn(tx, ctx.branchId);
            if (dePie.some((c) => c.nombre.localeCompare(nombre, "es", { sensitivity: "base" }) === 0)) {
              return { ok: false, motivo: "CONFLICTO", mensaje: `Ya hay una cuenta de pie «${nombre}»: usa otro nombre o una seña.`, problemas: [{ path: ["nombre"], message: "NOMBRE_REPETIDO" }] };
            }
            cuenta = await crearCuentaDePie(tx, ctx, { id: cmd.cuentaId, nombre, comensales: cmd.comensales, lines: [], ahora, quien: quien.nombre });
          }
          await guardarVersion(tx, ctx, cuenta, { cause: "GUARDAR", operationKey: null, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: "cuenta.abrir",
            entityType: "account",
            entityId: cuenta.id,
            after: {
              salon: cuenta.kind === "MESA" ? `Mesa ${cuenta.tableLabel}` : "De pie",
              nombre: cuenta.family,
              comensales: cmd.comensales,
              orden: cuenta.orderNumber ?? null,
            },
          });
          return cuenta;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.abrir", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos tablets con el mismo id a la vez: se vuelve a mirar y se devuelve la que quedó.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },

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

          // A cuál de las cuentas de la mesa (B6-7): la que diga la tablet, o la única.
          const destino = await cuentaDeMesaPara(tx, ctx.branchId, cmd.tableId, cmd.cuentaId);
          if ("ok" in destino) return destino;
          const abierta = destino.abierta;
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
            // Los invitados de un cumpleaños los paga el evento (B10-2): no hay parque que llevar a la mesa.
            if (actual.cuenta.kind === "EVENTO") {
              return { ok: false, motivo: "CONFLICTO", mensaje: "Son invitados de un cumpleaños: su parque lo paga el evento y no se vinculan a una mesa." };
            }
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
