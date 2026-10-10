/**
 * Dividir por ítems — B3-20 (M-37, U-13).
 *
 * En una mesa se sentaron varios en una sola cuenta y en la caja cada uno paga lo suyo. Rápido, sin protocolo:
 *
 *  · **Partir** un ítem compartido en partes iguales: la línea se queda con su importe y su producto, marcada `partida`
 *    (el inventario salió una vez, con ella), y nacen sus partes, cada una con su IVA.
 *  · **Dividir**: lo de cada persona, de la 2 en adelante, pasa a su propia cuenta (como al juntar, `movedTo` aquí y su
 *    igual allá, con de dónde vino); lo demás se queda en la cuenta, que es la de la persona 1. Cada cuenta se cobra
 *    con el cobro de siempre: su recibo, su «Factura a», su vuelto.
 *  · **Unir de nuevo**: lo que las personas no cobraron vuelve a la cuenta. Lo cobrado se anula aparte (B3-18).
 *
 * Nada se borra; sin PIN; con su asiento. No se divide una cuenta ya dividida en partes iguales, con descuento, de un
 * cumpleaños, que cobra una deuda o que otra persona está cobrando.
 */
import { randomUUID } from "node:crypto";
import {
  DividirPorItemsCommandSchema,
  DivisionPorItemsSchema,
  FamilyAccountSchema,
  PartirLineaCommandSchema,
  UnirDivisionCommandSchema,
  problemasDe,
  type DivisionPorItemsDto,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { joinInto, splitLine, splitLineProblem, takeLines, type AccountLineDoc, type SplitLineProblem } from "@l2/domain-cash";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import { borrarBorradorEn } from "./borrador.ts";
import { claveSecundaria, crearCuentaDePersona, guardarVersion, vigenteDe } from "./cuentas.ts";

export interface CasosDividir {
  /** Parte un ítem en partes iguales (`PartirLineaCommandSchema`). */
  partir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<DivisionPorItemsDto>>;
  /** Pasa lo de cada persona a su cuenta (`DividirPorItemsCommandSchema`). */
  dividir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<DivisionPorItemsDto>>;
  /** Devuelve a la cuenta lo que las personas no cobraron (`UnirDivisionCommandSchema`). */
  unir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<DivisionPorItemsDto>>;
}

const MOTIVO_PARTIR: Record<SplitLineProblem, string> = {
  LINEA_DESCONOCIDA: "Ese ítem ya no está en la cuenta.",
  NO_SE_DEBE: "Ese ítem ya no se cobra aquí (cobrado, regalado, anulado o ya partido).",
  YA_ES_PARTE: "Ese ítem ya es una parte: se reparte como está.",
  PARTES: "Se parte entre 2 y 12 personas.",
  MUY_POCO: "Cuesta demasiado poco para partirlo así.",
};

const cuentaCambiada: Rechazo = {
  ok: false,
  motivo: "CONFLICTO",
  mensaje: "Otro equipo cambió esta cuenta mientras la tenías abierta. Revísala y vuelve a intentarlo.",
};

/** «#0123», como lo dice la caja. */
const numero = (c: FamilyAccountDto) => (c.orderNumber ? `#${String(c.orderNumber).padStart(4, "0")}` : "La cuenta");

/** Lo que impide dividir esta cuenta, o `null` (la versión que vio la caja, su estado y quién la está cobrando). */
async function sePuedeDividir(tx: Transaccion, ctx: Contexto, accountId: string, version: number): Promise<{ cuenta: FamilyAccountDto; version: number } | Rechazo> {
  const fila = await tx.account.findUnique({ where: { id: accountId }, select: { branchId: true } });
  if (!fila || fila.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
  const vig = (await vigenteDe(tx, accountId))!;
  if (vig.version !== version) return cuentaCambiada;
  const c = vig.cuenta;
  if (c.status !== "POR_COBRAR") return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta no está en la cola de la caja." };
  if (c.kind === "EVENTO") return { ok: false, motivo: "CONFLICTO", mensaje: "La cuenta de un cumpleaños se cobra entera, con su reserva." };
  if (c.split) return { ok: false, motivo: "CONFLICTO", mensaje: "Ya está dividida en partes iguales: quita esa división antes de dividir por ítems." };
  if (c.descuento) return { ok: false, motivo: "CONFLICTO", mensaje: "Lleva un descuento sobre su total: quítalo antes de dividir por ítems." };
  if (await tx.customerDebtCollection.findFirst({ where: { accountId }, select: { id: true } })) {
    return { ok: false, motivo: "CONFLICTO", mensaje: "Cobra una deuda: se cobra entera." };
  }
  const borrador = await tx.chargeDraft.findFirst({ where: { accountId }, select: { updatedBy: true, updatedByName: true } });
  if (borrador && borrador.updatedBy !== (ctx.quien?.userId ?? null)) {
    return { ok: false, motivo: "CONFLICTO", mensaje: `${borrador.updatedByName} está cobrando ${numero(c)}: que termine o la deje antes de dividirla.` };
  }
  return vig;
}

/** Las cuentas de las personas de una cuenta dividida que siguen por cobrar, en su última versión. */
async function personasPorCobrar(tx: Transaccion, branchId: string, cuentaId: string) {
  const filas = await tx.$queryRaw<{ account_id: string }[]>`
    SELECT u.account_id FROM (
      SELECT DISTINCT ON (v.account_id) v.account_id, v.status, v.content
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MOSTRADOR'
      ORDER BY v.account_id, v.version DESC
    ) u
    WHERE u.status = 'POR_COBRAR' AND u.content->'divididaDe'->>'cuentaId' = ${cuentaId}`;
  const r = [];
  for (const f of filas) r.push((await vigenteDe(tx, f.account_id))!);
  return r.sort((a, b) => ((a.cuenta.divididaDe?.persona ?? 0) - (b.cuenta.divididaDe?.persona ?? 0)));
}

/** El reintento de un mando con su clave: la cuenta como quedó y, si se dan, las de sus personas. */
async function loQueQuedo(tx: Transaccion, accountId: string, personas: readonly string[] = []): Promise<DivisionPorItemsDto> {
  const lista: FamilyAccountDto[] = [];
  for (const id of personas) lista.push((await vigenteDe(tx, id))!.cuenta);
  return DivisionPorItemsSchema.parse({ cuenta: (await vigenteDe(tx, accountId))!.cuenta, personas: lista });
}

export function casosDividir(base: Base): CasosDividir {
  /** Corre un mando en la transacción del tenant; un choque de claves se reintenta una vez y devuelve lo que quedó. */
  async function correr(ctx: Contexto, accion: "cuenta.partir" | "cuenta.dividir" | "cuenta.unir", f: (tx: Transaccion) => Promise<DivisionPorItemsDto | Rechazo>) {
    const intentar = () => base.conTenant(ctx.tenantId, f);
    try {
      const r = await intentar();
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
        return r;
      }
      return { ok: true as const, valor: r };
    } catch (e) {
      if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
      const r = await intentar();
      return "ok" in r ? r : { ok: true as const, valor: r };
    }
  }

  return {
    async partir(ctx, entrada, ahora = Date.now()) {
      const v = PartirLineaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se partió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return correr(ctx, "cuenta.partir", async (tx) => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
        if (previa) return previa.cause === "DIVIDIR" && previa.accountId === cmd.accountId ? loQueQuedo(tx, cmd.accountId) : conflictoDeClave;

        const vig = await sePuedeDividir(tx, ctx, cmd.accountId, cmd.version);
        if ("ok" in vig) return vig;
        const problema = splitLineProblem(vig.cuenta, cmd.lineId, cmd.partes);
        if (problema) return { ok: false, motivo: "CONFLICTO", mensaje: MOTIVO_PARTIR[problema], problemas: [{ path: ["lineId"], message: problema }] };
        const partida = splitLine(vig.cuenta, cmd.lineId, cmd.partes, () => randomUUID());
        const cuenta = FamilyAccountSchema.parse({ ...partida, version: vig.version + 1 });
        const quien = await nombreDe(tx, ctx);
        await guardarVersion(tx, ctx, cuenta, { cause: "DIVIDIR", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
        const linea = vig.cuenta.lines.find((l) => l.id === cmd.lineId)!;
        await auditar(tx, ctx, { action: "cuenta.partir", entityType: "account", entityId: cuenta.id, after: { orden: cuenta.orderNumber ?? null, item: linea.concept, partes: cmd.partes } });
        return { cuenta, personas: [] };
      });
    },

    async dividir(ctx, entrada, ahora = Date.now()) {
      const v = DividirPorItemsCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se dividió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const clavePersona = (k: number) => claveSecundaria(cmd.idempotencyKey, `persona-${k}`);
      return correr(ctx, "cuenta.dividir", async (tx) => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
        if (previa) {
          if (previa.cause !== "DIVIDIR" || previa.accountId !== cmd.accountId) return conflictoDeClave;
          const ids = [];
          for (const [i] of cmd.personas.entries()) {
            const p = await tx.accountVersion.findFirst({ where: { operationKey: clavePersona(i + 2) }, select: { accountId: true } });
            if (p) ids.push(p.accountId);
          }
          return loQueQuedo(tx, cmd.accountId, ids);
        }

        const vig = await sePuedeDividir(tx, ctx, cmd.accountId, cmd.version);
        if ("ok" in vig) return vig;
        const de = vig.cuenta;
        const origen = { cuentaId: de.id, ...(de.orderNumber ? { orderNumber: de.orderNumber } : {}), family: de.family, kind: de.kind, ...(de.dePie ? { dePie: true as const } : {}) };
        let cuenta: FamilyAccountDto = de;
        const reparto: { id: string; persona: number; lineas: readonly AccountLineDoc[] }[] = [];
        for (const [i, p] of cmd.personas.entries()) {
          const id = randomUUID();
          const r = takeLines(cuenta, p.lineIds, id, origen, () => randomUUID());
          if (!r) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Uno de esos ítems ya no se cobra en esta cuenta: vuelve a abrirla.", problemas: [{ path: ["personas", i], message: "ITEM_QUE_NO_SE_DEBE" }] };
          }
          cuenta = r.desde;
          reparto.push({ id, persona: i + 2, lineas: r.lineas });
        }
        // La persona 1 es la cuenta: se queda con algo, o no hay nada que dividir.
        if (!cuenta.lines.some((l) => !l.paid && !l.movedTo && !l.cortesia && !l.anulacion && !l.porUso && !l.partida)) {
          return { ok: false, motivo: "INVALIDO", mensaje: "La persona 1 se queda sin nada: déjale algo, o cobra la cuenta entera.", problemas: [{ path: ["personas"], message: "PERSONA_1_VACIA" }] };
        }

        const quien = await nombreDe(tx, ctx);
        const final = FamilyAccountSchema.parse({ ...cuenta, version: vig.version + 1 });
        await guardarVersion(tx, ctx, final, { cause: "DIVIDIR", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
        const personas: FamilyAccountDto[] = [];
        for (const r of reparto) {
          const p = await crearCuentaDePersona(tx, ctx, { id: r.id, de: final, persona: r.persona, lines: r.lineas, ahora, quien: quien.nombre });
          await guardarVersion(tx, ctx, p, { cause: "DIVIDIR", operationKey: clavePersona(r.persona), ahora, quien: quien.nombre });
          personas.push(p);
        }
        await auditar(tx, ctx, {
          action: "cuenta.dividir",
          entityType: "account",
          entityId: final.id,
          after: { orden: final.orderNumber ?? null, personas: personas.length + 1, cuentas: personas.map((p) => p.orderNumber ?? null) },
        });
        return { cuenta: final, personas };
      });
    },

    async unir(ctx, entrada, ahora = Date.now()) {
      const v = UnirDivisionCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se unió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      return correr(ctx, "cuenta.unir", async (tx) => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
        if (previa) return previa.cause === "UNIR" && previa.accountId === cmd.accountId ? loQueQuedo(tx, cmd.accountId) : conflictoDeClave;

        const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
        if (!fila || fila.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
        const vig = (await vigenteDe(tx, cmd.accountId))!;
        const personas = await personasPorCobrar(tx, ctx.branchId, cmd.accountId);
        if (personas.length === 0) return { ok: false, motivo: "CONFLICTO", mensaje: "No queda nada que unir: lo de cada persona ya se cobró." };
        for (const p of personas) {
          if (p.cuenta.lines.some((l) => l.paid) || (p.cuenta.split && p.cuenta.split.paid > 0)) {
            return { ok: false, motivo: "CONFLICTO", mensaje: `${numero(p.cuenta)} ya cobró una parte: termina de cobrarla o anula ese cobro.` };
          }
        }
        const borrador = await tx.chargeDraft.findFirst({ where: { accountId: { in: personas.map((p) => p.cuenta.id) } }, select: { accountId: true, updatedBy: true, updatedByName: true } });
        if (borrador && borrador.updatedBy !== (ctx.quien?.userId ?? null)) {
          const de = personas.find((p) => p.cuenta.id === borrador.accountId)!;
          return { ok: false, motivo: "CONFLICTO", mensaje: `${borrador.updatedByName} está cobrando ${numero(de.cuenta)}: que termine o la deje antes de unir.` };
        }

        const juntadaEn = { cuentaId: vig.cuenta.id, ...(vig.cuenta.orderNumber ? { orderNumber: vig.cuenta.orderNumber } : {}) };
        let cuenta: FamilyAccountDto = vig.cuenta;
        const cerradas: FamilyAccountDto[] = [];
        for (const p of personas) {
          // Lo suyo vuelve sin el origen que le puso la división; lo que ya traía de otra cuenta (juntada), con él.
          const r = joinInto(cuenta, cuenta.id, p.cuenta, (l) => (l.vieneDe?.cuentaId === cuenta.id ? undefined : l.vieneDe), juntadaEn, () => randomUUID());
          cuenta = r.destino;
          const { pendingSince: _, ...sinEspera } = r.otra;
          cerradas.push(FamilyAccountSchema.parse({ ...sinEspera, version: p.version + 1 }));
        }
        const instante = new Date(ahora).toISOString();
        const final = FamilyAccountSchema.parse({
          ...cuenta,
          pendingSince: vig.cuenta.status === "POR_COBRAR" ? (vig.cuenta.pendingSince ?? instante) : instante,
          version: vig.version + 1,
        });
        const quien = await nombreDe(tx, ctx);
        await guardarVersion(tx, ctx, final, { cause: "UNIR", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
        for (const p of cerradas) {
          await guardarVersion(tx, ctx, p, { cause: "UNIR", operationKey: claveSecundaria(cmd.idempotencyKey, p.id), ahora, quien: quien.nombre });
          await borrarBorradorEn(tx, p.id);
        }
        await auditar(tx, ctx, { action: "cuenta.unir", entityType: "account", entityId: final.id, after: { orden: final.orderNumber ?? null, unidas: cerradas.map((p) => p.orderNumber ?? null) } });
        return { cuenta: final, personas: cerradas };
      });
    },
  };
}
