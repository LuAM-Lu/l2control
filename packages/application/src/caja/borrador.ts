/**
 * El cobro en curso, guardado como borrador de la cuenta — B3-13, M-34 (S-6).
 *
 * La caja lo guarda mientras se teclea (un poco después de cada cambio) y lo lee al abrir la cuenta: así lo escrito
 * aguanta cambiar de cuenta o de pestaña, recargar, un corte de luz y otro equipo de caja. Cifrado entero, como los
 * datos de los pagos (B3-2): lleva referencias, teléfonos y cédulas. Con su versión: si otro equipo lo cambió desde
 * que se leyó, el guardado choca y se vuelve a leer. Cobrar lo borra en su misma transacción (`cuentas.cobrar`).
 *
 * No es un pago ni un asiento: no se audita cada tecla. Sí queda en la auditoría tomar el de otra persona (se guarda
 * encima del suyo) y descartarlo.
 */
import {
  BorradorDeCobroSchema,
  BorradorGuardadoSchema,
  DescartarBorradorCommandSchema,
  GuardarBorradorCommandSchema,
  problemasDe,
  type BorradorGuardadoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import type { Cifrador } from "../identidad/cifrado.ts";

export interface CasosBorrador {
  /** El borrador de una cuenta, si hay; `null` si no. */
  leer(ctx: Contexto, accountId: string): Promise<Resultado<BorradorGuardadoDto | null>>;
  /** Guarda (o, sin pagos, borra) el borrador de una cuenta (`GuardarBorradorCommandSchema`). */
  guardar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<BorradorGuardadoDto | null>>;
  /** Descarta el borrador de una cuenta (`DescartarBorradorCommandSchema`). */
  descartar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<{ descartado: boolean }>>;
}

const SIN_CIFRADO: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El servidor no tiene la clave de cifrado: el cobro en curso no se guarda." };

type Fila = NonNullable<Awaited<ReturnType<Transaccion["chargeDraft"]["findFirst"]>>>;

function dto(f: Fila, cifrador: Cifrador): BorradorGuardadoDto {
  return BorradorGuardadoSchema.parse({
    accountId: f.accountId,
    version: f.version,
    por: f.updatedByName,
    porId: f.updatedBy,
    deviceId: f.deviceId,
    en: f.updatedAt.toISOString(),
    borrador: BorradorDeCobroSchema.parse(JSON.parse(cifrador.descifrar(f.contentCipher))),
  });
}

/** Borra el borrador de una cuenta dentro de otra transacción (el cobro que lo consume). */
export async function borrarBorradorEn(tx: Transaccion, accountId: string): Promise<void> {
  await tx.chargeDraft.deleteMany({ where: { accountId } });
}

export function casosBorrador(base: Base, cifrador: Cifrador | null): CasosBorrador {
  return {
    async leer(ctx, accountId) {
      if (!cifrador) return SIN_CIFRADO;
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<BorradorGuardadoDto | null>> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const f = await tx.chargeDraft.findFirst({ where: { accountId, branchId: ctx.branchId } });
        return { ok: true, valor: f ? dto(f, cifrador) : null };
      });
    },

    async guardar(ctx, entrada, ahora = Date.now()) {
      if (!cifrador) return SIN_CIFRADO;
      const v = GuardarBorradorCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El cobro en curso no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<BorradorGuardadoDto | null>> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const cuenta = await tx.account.findFirst({ where: { id: cmd.accountId, branchId: ctx.branchId }, select: { id: true } });
        if (!cuenta) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
        // Una cuenta ya cobrada (o cerrada de otro modo) no guarda cobro en curso: un guardado que llega tarde no lo revive.
        const ultima = await tx.accountVersion.findFirst({ where: { accountId: cmd.accountId }, orderBy: { version: "desc" }, select: { status: true } });
        if (ultima && ultima.status !== "ABIERTA" && ultima.status !== "POR_COBRAR") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cuenta ya no está por cobrar." };
        }
        // El candado de la cuenta: dos guardados a la vez de la misma no se pisan.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`borrador:${cmd.accountId}`}, 0))::text AS candado`;
        const actual = await tx.chargeDraft.findFirst({ where: { accountId: cmd.accountId } });
        if ((actual?.version ?? null) !== cmd.version) {
          return {
            ok: false,
            motivo: "CONFLICTO",
            mensaje: actual ? `Otro equipo cambió este cobro (${actual.updatedByName}): se vuelve a leer.` : "Este cobro ya se cerró o se descartó en otro equipo.",
          };
        }
        const quien = await nombreDe(tx, ctx);
        const deOtro = actual !== null && actual.updatedBy !== (ctx.quien?.userId ?? null);
        if (cmd.borrador.pagos.length === 0) {
          if (actual) await tx.chargeDraft.delete({ where: { id: actual.id } });
          return { ok: true, valor: null };
        }
        const datos = {
          contentCipher: cifrador.cifrar(JSON.stringify(cmd.borrador)),
          updatedBy: ctx.quien?.userId ?? null,
          updatedByName: quien.nombre,
          deviceId: ctx.quien?.deviceId ?? null,
          updatedAt: new Date(ahora),
        };
        const f = actual
          ? await tx.chargeDraft.update({ where: { id: actual.id }, data: { ...datos, version: actual.version + 1 } })
          : await tx.chargeDraft.create({ data: { tenantId: ctx.tenantId, branchId: ctx.branchId, accountId: cmd.accountId, version: 1, ...datos } });
        // Tomar el cobro que llevaba otra persona queda dicho; lo propio, no (no se audita cada tecla).
        if (deOtro) {
          await auditar(tx, ctx, {
            action: "cobro.retomar",
            entityType: "account",
            entityId: cmd.accountId,
            before: { de: actual!.updatedByName, version: actual!.version },
            after: { pagos: cmd.borrador.pagos.length },
          });
        }
        return { ok: true, valor: dto(f, cifrador) };
      });
      if (!r.ok && r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cobro.borrador", reason: r.mensaje });
      return r;
    },

    async descartar(ctx, entrada, ahora = Date.now()) {
      const v = DescartarBorradorCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se descartó: hay datos que corregir.", problemas: problemasDe(v.error) };
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<{ descartado: boolean }>> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const actual = await tx.chargeDraft.findFirst({ where: { accountId: v.data.accountId, branchId: ctx.branchId } });
        if (!actual) return { ok: true, valor: { descartado: false } };
        await tx.chargeDraft.delete({ where: { id: actual.id } });
        await auditar(tx, ctx, {
          action: "cobro.descartar",
          entityType: "account",
          entityId: v.data.accountId,
          before: { de: actual.updatedByName, version: actual.version, en: actual.updatedAt.toISOString() },
          after: { en: new Date(ahora).toISOString() },
        });
        return { ok: true, valor: { descartado: true } };
      });
    },
  };
}
