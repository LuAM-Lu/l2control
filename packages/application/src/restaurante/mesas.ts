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
 *
 * Desvincular (B6-15, M-37) es lo contrario, de un niño a la vez: lo que se debe de él sale de la mesa a la cuenta de
 * su familia o a otra cuenta de mesa, y su salida del parque va ahí. Lo hace quien vincula, sin PIN; lo cobrado no se
 * mueve. Así una mesa con un niño vinculado ya no queda trabada.
 */
import { randomUUID } from "node:crypto";
import {
  AbrirCuentaDelSalonCommandSchema,
  DesvincularPulseraCommandSchema,
  FamilyAccountSchema,
  MarcarMesaLimpiaCommandSchema,
  MesasPorLimpiarSchema,
  VincularPulserasCommandSchema,
  type MesasPorLimpiarDto,
  problemasDe,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
  type VincularPulserasResultDto,
  type DesvincularPulseraResultDto,
} from "@l2/contracts";
import { moveSessionLines, receiveSession, unlinkProblem, unlinkSession, type AccountLineDoc, type UnlinkProblem } from "@l2/domain-cash";
import { add, money } from "@l2/domain-money";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Action } from "@l2/domain-identity";
import { calendarDay, startOfDay } from "@l2/domain-rates";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { zonaDe } from "../sucursal/ajustes.ts";
import { claveSecundaria, crearCuentaDeMesa, crearCuentaDePie, guardarVersion, vigenteDe } from "../caja/cuentas.ts";
import { anotarCliente, resolverCliente } from "../clientes/clientes.ts";
import { candadoDeMesas, cuentaDeMesaPara, cuentasDePieEn, mesaParaCuentaNueva, mesaSinCuenta, sessionsVinculadas } from "./plano.ts";
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
  /**
   * Desvincula un niño de la cuenta de su mesa (`DesvincularPulseraCommandSchema`, B6-15): lo que se debe de él pasa a
   * su familia o a otra cuenta de mesa. Reenviar la misma `idempotencyKey` devuelve lo que ya quedó.
   */
  desvincular(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<DesvincularPulseraResultDto>>;
  /**
   * Las mesas por limpiar (B6-14, M-35): sin cuentas abiertas y con su última cuenta de hoy cerrada después de la última
   * vez que se dejaron limpias. Se calcula: vale igual si se cobró, se liberó, quedó en deuda o se cerró sin cobrar.
   */
  porLimpiar(ctx: Contexto, ahora?: number): Promise<Resultado<MesasPorLimpiarDto>>;
  /** Deja limpia una mesa (`MarcarMesaLimpiaCommandSchema`, B6-14): el mesero, y la caja y supervisión de respaldo. */
  marcarLimpia(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<MesasPorLimpiarDto>>;
}

export function casosMesas(base: Base): CasosMesas {
  return {
    async porLimpiar(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<MesasPorLimpiarDto>> => {
        if (!(await puedeAlgunaDe(tx, ctx, VEN_EL_SALON))) return rechazoDePermiso("DENEGADO");
        return { ok: true, valor: await mesasPorLimpiar(tx, ctx.branchId, ahora) };
      });
    },

    async marcarLimpia(ctx, entrada, ahora = Date.now()) {
      const v = MarcarMesaLimpiaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se marcó: la mesa no es válida.", problemas: problemasDe(v.error) };
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<MesasPorLimpiarDto>> => {
        if (!(await puedeAlgunaDe(tx, ctx, VEN_EL_SALON))) return rechazoDePermiso("DENEGADO");
        const antes = await mesasPorLimpiar(tx, ctx.branchId, ahora);
        // Una mesa que no está por limpiar queda como estaba (otro equipo la marcó, o un doble toque).
        if (antes.mesas.some((m) => m.tableId === v.data.tableId)) {
          const quien = await nombreDe(tx, ctx);
          const fila = await tx.diningTableCleaned.create({
            data: { tenantId: ctx.tenantId, branchId: ctx.branchId, tableId: v.data.tableId, cleanedAt: new Date(ahora), by: ctx.quien?.userId ?? null, byName: quien.nombre, deviceId: ctx.quien?.deviceId ?? null },
          });
          await auditar(tx, ctx, { action: "mesa.limpia", entityType: "dining_table", entityId: fila.tableId, after: { mesa: fila.tableId } });
        }
        return { ok: true, valor: await mesasPorLimpiar(tx, ctx.branchId, ahora) };
      });
    },

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
          // La cuenta se llama como su cliente (B6-9): nombre, cédula y teléfono, reconocido en el directorio o dado de alta.
          const nombre = cmd.cliente.nombre;
          // Primero lo que puede negarse (la mesa, el nombre de pie); después, lo que escribe. Un rechazo no deshace la
          // transacción: nada se escribe antes de saber que se puede.
          let mesa: Readonly<{ tableId: string; label: string }> | null = null;
          if (cmd.tableId !== undefined) {
            const r = await mesaParaCuentaNueva(tx, ctx.branchId, cmd.tableId, { nombre, vistas: cmd.vistas });
            if ("ok" in r) return { ...r, ...(r.problemas ? { problemas: r.problemas.map((p) => ({ ...p, path: p.path[0] === "cuenta" ? ["tableId"] : p.path })) } : {}) };
            mesa = { tableId: cmd.tableId, label: r.label };
          } else {
            // Dos cuentas de pie con el mismo nombre se confunden al llamarlas: la segunda lleva otro.
            const dePie = await cuentasDePieEn(tx, ctx.branchId);
            if (dePie.some((c) => c.nombre.localeCompare(nombre, "es", { sensitivity: "base" }) === 0)) {
              return { ok: false, motivo: "CONFLICTO", mensaje: `Ya hay una cuenta de pie a nombre de «${nombre}».`, problemas: [{ path: ["cliente", "nombre"], message: "NOMBRE_REPETIDO" }] };
            }
          }
          const c = await resolverCliente(tx, ctx, cmd.cliente, ahora);
          if ("ok" in c) return c;
          const cuenta: FamilyAccountDto = mesa
            ? await crearCuentaDeMesa(tx, ctx, { id: cmd.cuentaId, ...mesa, nombre, comensales: cmd.comensales, lines: [], ahora, quien: quien.nombre })
            : await crearCuentaDePie(tx, ctx, { id: cmd.cuentaId, nombre, comensales: cmd.comensales, lines: [], ahora, quien: quien.nombre });
          await guardarVersion(tx, ctx, cuenta, { cause: "GUARDAR", operationKey: null, ahora, quien: quien.nombre });
          const cliente = await anotarCliente(tx, ctx, cuenta.id, c, ahora, quien.nombre);
          // El asiento nombra al cliente del directorio, no su cédula ni su teléfono (PLAN §7.6).
          await auditar(tx, ctx, {
            action: "cuenta.abrir",
            entityType: "account",
            entityId: cuenta.id,
            after: {
              salon: cuenta.kind === "MESA" ? `Mesa ${cuenta.tableLabel}` : "De pie",
              nombre: cuenta.family,
              comensales: cmd.comensales,
              orden: cuenta.orderNumber ?? null,
              clienteId: c.guardianId,
              clienteNuevo: c.nuevo,
            },
          });
          return { ...cuenta, cliente };
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
          // Una mesa sin cuenta no la abre una pulsera: se sienta primero a su cliente, con sus datos (B6-9, M-33). Antes,
          // si la mesa no está en el salón, se dice eso.
          if (!mesaVigente) {
            const r = await mesaParaCuentaNueva(tx, ctx.branchId, cmd.tableId);
            if ("ok" in r) return { ...r, ...(r.problemas ? { problemas: r.problemas.map((p) => ({ ...p, path: ["tableId"] })) } : {}) };
            return mesaSinCuenta(["tableId"]);
          }
          const label = mesaVigente.cuenta.tableLabel ?? "?";
          const mesaAccountId = mesaVigente.cuenta.id;

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

          const mesa: FamilyAccountDto = FamilyAccountSchema.parse({
            ...mesaVigente.cuenta,
            sessionIds: [...new Set([...mesaVigente.cuenta.sessionIds, ...cmd.sessionIds])],
            lines: [...mesaVigente.cuenta.lines, ...lineasParaLaMesa],
            version: mesaVigente.version + 1,
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

    async desvincular(ctx, entrada, ahora = Date.now()) {
      const v = DesvincularPulseraCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "No se desvinculó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<DesvincularPulseraResultDto | Rechazo> => {
          // Lo hace quien vincula (mesero, caja y supervisión), sin PIN.
          const rechazo = await exigirPermiso(tx, ctx, "parque.vincularMesa");
          if (rechazo) return rechazo;

          // El reintento (se cortó la red) devuelve lo que ya quedó: la mesa con la clave del mando y la que lo recibió.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.cause !== "DESVINCULAR" || previa.accountId !== cmd.desdeCuentaId) return conflictoDeClave;
            const recibio = await tx.accountVersion.findFirst({ where: { operationKey: claveSecundaria(cmd.idempotencyKey, "destino") } });
            if (!recibio) return conflictoDeClave;
            return { desde: (await vigenteDe(tx, previa.accountId))!.cuenta, destino: (await vigenteDe(tx, recibio.accountId))!.cuenta };
          }

          const s = await tx.parkSession.findUnique({ where: { id: cmd.sessionId }, select: { branchId: true, accountId: true, wristbandCode: true } });
          if (!s || s.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa pulsera no está en esta sucursal." };

          // Las mesas, con su candado (el mismo de vincular y del plano): nadie la vincula ni la mueve mientras tanto.
          await candadoDeMesas(tx, ctx.branchId);
          const fila = await tx.account.findUnique({ where: { id: cmd.desdeCuentaId }, select: { branchId: true } });
          const desde = fila?.branchId === ctx.branchId ? await vigenteDe(tx, cmd.desdeCuentaId) : null;
          if (!desde || desde.cuenta.kind !== "MESA" || (desde.cuenta.status !== "ABIERTA" && desde.cuenta.status !== "POR_COBRAR")) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Esa mesa ya no tiene su cuenta abierta: no hay nada que desvincular." };
          }
          const problema = unlinkProblem(desde.cuenta, cmd.sessionId);
          if (problema) return { ok: false, motivo: "CONFLICTO", mensaje: MENSAJE_DESVINCULAR[problema], problemas: [{ path: ["sessionId"], message: problema }] };

          // A dónde va: la cuenta de su familia, abierta; u otra cuenta de mesa abierta de esta sucursal.
          const destinoId = cmd.destino.kind === "FAMILIA" ? s.accountId : cmd.destino.cuentaId;
          if (destinoId === desde.cuenta.id) return { ok: false, motivo: "INVALIDO", mensaje: "Ya está en esa cuenta: elige otra." };
          const filaDestino = await tx.account.findUnique({ where: { id: destinoId }, select: { branchId: true } });
          const destino = filaDestino?.branchId === ctx.branchId ? await vigenteDe(tx, destinoId) : null;
          const abierta = destino !== null && (destino.cuenta.status === "ABIERTA" || destino.cuenta.status === "POR_COBRAR");
          if (cmd.destino.kind === "FAMILIA" && (!destino || !abierta)) {
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: "La cuenta de su familia ya se cerró: pásalo a otra mesa.",
              problemas: [{ path: ["destino"], message: "FAMILIA_CERRADA" }],
            };
          }
          if (cmd.destino.kind === "MESA" && (!destino || destino.cuenta.kind !== "MESA" || !abierta)) {
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: "Esa mesa ya no tiene su cuenta abierta: elige otra.",
              problemas: [{ path: ["destino", "cuentaId"], message: "MESA_CERRADA" }],
            };
          }
          const recibe = destino!;

          const { desde: sinEl, lineasNuevas } = unlinkSession(desde.cuenta, cmd.sessionId, recibe.cuenta.id, () => randomUUID());
          const conEl = receiveSession(recibe.cuenta, cmd.sessionId, lineasNuevas);
          const quien = await nombreDe(tx, ctx);
          const instante = new Date(ahora).toISOString();
          // En la cola desde ahora si quedó ahí (una familia de prepago, o que ya salió entera); fuera de ella, sin espera.
          const espera = (antes: FamilyAccountDto, despues: FamilyAccountDto) => {
            const { pendingSince: _, ...sin } = despues;
            return despues.status === "POR_COBRAR" ? { ...sin, pendingSince: antes.status === "POR_COBRAR" ? (antes.pendingSince ?? instante) : instante } : sin;
          };
          const mesa = FamilyAccountSchema.parse({ ...espera(desde.cuenta, sinEl), version: desde.version + 1 });
          const otra = FamilyAccountSchema.parse({ ...espera(recibe.cuenta, conEl), version: recibe.version + 1 });
          await guardarVersion(tx, ctx, mesa, { cause: "DESVINCULAR", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await guardarVersion(tx, ctx, otra, { cause: "DESVINCULAR", operationKey: claveSecundaria(cmd.idempotencyKey, "destino"), ahora, quien: quien.nombre });

          const movido = lineasNuevas.reduce((acc, l) => add(acc, money(BigInt(l.amount.minor), "USD")), money(0n, "USD"));
          await auditar(tx, ctx, {
            action: "mesa.desvincular",
            entityType: "account",
            entityId: mesa.id,
            after: {
              mesa: mesa.tableLabel ?? "?",
              pulsera: s.wristbandCode,
              a: otra.kind === "MESA" ? `Mesa ${otra.tableLabel ?? "?"}` : "Su familia",
              cuenta: otra.id,
              movido: { minor: String(movido.amount), currency: movido.currency },
            },
          });
          return { desde: mesa, destino: otra };
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "mesa.desvincular", reason: r.mensaje });
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

/** Por qué no se desvincula (B6-15), dicho para quien está en la mesa. */
const MENSAJE_DESVINCULAR: Record<UnlinkProblem, string> = {
  NO_VINCULADO: "Ese niño ya no está vinculado a esta mesa.",
  COBRO_EN_CURSO: "Esta mesa ya cobró una parte de su división: termina de cobrarla, o anula ese cobro, antes de desvincular.",
  YA_COBRADO: "Su tiempo ya se cobró en esta mesa: lo cobrado no se mueve.",
};

/** Quien ve el salón: quien atiende las mesas y la caja (supervisión y administración tienen las dos). */
const VEN_EL_SALON: readonly Action[] = ["pedido.tomar", "documento.emitir"];

async function puedeAlgunaDe(tx: Transaccion, ctx: Contexto, acciones: readonly Action[]): Promise<boolean> {
  for (const a of acciones) if ((await permisoEn(tx, ctx, a)) !== "DENEGADO") return true;
  return false;
}

/**
 * Las mesas por limpiar (B6-14): de las cuentas de mesa abiertas hoy, por mesa, si alguna sigue abierta y cuándo se
 * cerró la última; por limpiar, la que no tiene ninguna abierta y se cerró después de la última limpieza.
 */
export async function mesasPorLimpiar(tx: Transaccion, branchId: string, ahora: number): Promise<MesasPorLimpiarDto> {
  const zona = await zonaDe(tx, branchId);
  const desde = new Date(startOfDay(calendarDay(new Date(ahora).toISOString(), zona), zona));
  const filas = await tx.$queryRaw<{ table_id: string; abierta: boolean; cerrada: Date | null }[]>`
    SELECT u.table_id,
           bool_or(u.status IN ('ABIERTA', 'POR_COBRAR')) AS abierta,
           max(u.saved_at) FILTER (WHERE u.status NOT IN ('ABIERTA', 'POR_COBRAR')) AS cerrada
    FROM (
      SELECT DISTINCT ON (v.account_id) v.status, v.saved_at, v.content->>'tableId' AS table_id
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MESA' AND a.opened_at >= ${desde}
      ORDER BY v.account_id, v.version DESC
    ) u
    WHERE u.table_id IS NOT NULL
    GROUP BY u.table_id`;
  const limpias = new Map(
    (await tx.diningTableCleaned.groupBy({ by: ["tableId"], where: { branchId, cleanedAt: { gte: desde } }, _max: { cleanedAt: true } })).map((g) => [g.tableId, g._max.cleanedAt!.getTime()]),
  );
  return MesasPorLimpiarSchema.parse({
    mesas: filas
      .filter((f) => !f.abierta && f.cerrada !== null && f.cerrada.getTime() > (limpias.get(f.table_id) ?? 0))
      .map((f) => ({ tableId: f.table_id, desde: f.cerrada!.toISOString() }))
      .sort((a, b) => a.desde.localeCompare(b.desde)),
  });
}
