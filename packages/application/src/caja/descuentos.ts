/**
 * Los descuentos en el servidor — B3-6, V-9, D-DESC.
 *
 * Quién decide qué:
 *  · el dominio (`@l2/domain-cash`, `descuento.ts`): qué líneas toca un alcance, cuánto descuenta,
 *    qué se ofrece y en qué orden, si se puede poner y si se puede cobrar con él;
 *  · la matriz: crear reglas y marcar familias VIP es de `catalogo.modificar` (administración, con su
 *    elevación); ponerlo en una cuenta, de `cuenta.descuento` (🔐 para supervisión y caja);
 *  · este archivo: que la regla exista y rija hoy en el local, que el VIP sea el de esa familia, que
 *    lo de administración (el manual por encima del tope de supervisión y el suyo propio) lo autorice
 *    administración, y que la autorización se compruebe y se registre ANTES de tocar la cuenta.
 *
 * Una regla no se edita ni se borra: se retira (la base lo impone). El descuento se guarda en la
 * cuenta como una versión más (causa DESCUENTO) y el cobro lo consume (`cuentas.cobrar`).
 */
import {
  AplicarDescuentoCommandSchema,
  CrearReglaDescuentoCommandSchema,
  DescuentoAplicadoSchema,
  DescuentosDeCuentaSchema,
  DescuentosDelLocalSchema,
  FamilyAccountSchema,
  MarcarVipCommandSchema,
  RetirarReglaDescuentoCommandSchema,
  problemasDe,
  type DescuentoAplicadoDto,
  type DescuentosDeCuentaDto,
  type DescuentosDelLocalDto,
  type FamilyAccountDto,
  type Rechazo,
  type ReglaDescuentoDto,
  type RequiereDescuento,
  type Resultado,
} from "@l2/contracts";
import {
  applyDiscountProblem,
  chargeableSubtotal,
  discountAmount,
  discountCandidates,
  needsAdministration,
  ruleInForce,
  withDiscount,
  type ApplyDiscountProblem,
} from "@l2/domain-cash";
import { calendarDay } from "@l2/domain-rates";
import { percentFromBasisPoints } from "@l2/domain-tax";
import { errorDeBase, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { AutorizacionSchema, exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { guardarVersion, vigenteDe } from "./cuentas.ts";
import { categoriasDe, marcaVip, reglaDeFila, reglasDe, resumenDeRegla, TEXTO_MOTIVO_DESCUENTO, vipDeCuenta } from "./reglas-de-descuento.ts";

export interface CasosDescuentos {
  /** Las reglas del local (las retiradas también) y el tope de supervisión. */
  leer(ctx: Contexto): Promise<Resultado<DescuentosDelLocalDto>>;
  /** Crea una regla (`CrearReglaDescuentoCommandSchema`). */
  crear(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReglaDescuentoDto>>;
  /** Retira una regla (`RetirarReglaDescuentoCommandSchema`): deja de ofrecerse; lo cobrado con ella no cambia. */
  retirar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReglaDescuentoDto>>;
  /** Marca a una familia VIP con una regla VIP, o le quita la marca (`MarcarVipCommandSchema`). */
  marcarVip(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<{ guardianId: string; vip: { reglaId: string; nombre: string } | null }>>;
  /** Lo que la caja puede ofrecerle a una cuenta hoy, el mayor primero. */
  deCuenta(ctx: Contexto, accountId: unknown, ahora?: number): Promise<Resultado<DescuentosDeCuentaDto>>;
  /**
   * Pone un descuento a una cuenta o se lo quita (`AplicarDescuentoCommandSchema`). `autorizacion` es
   * la del 🔐 (o el PIN de quien puede por sí mismo); el VIP y quitarlo no la piden.
   */
  aplicar(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
}

const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});
const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa cuenta no existe en esta sucursal." };
const cuentaCambiada: Rechazo = {
  ok: false,
  motivo: "CONFLICTO",
  mensaje: "Otro equipo cambió esta cuenta mientras la tenías abierta. Revísala y vuelve a intentarlo.",
};
const conflictoDeClave: Rechazo = { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otra operación." };

const MENSAJE_APLICAR: Record<ApplyDiscountProblem, string> = {
  NO_POR_COBRAR: "El descuento se pone a una cuenta que está en la cola de la caja.",
  CUENTA_DIVIDIDA: "Una cuenta dividida no lleva descuento: únela para aplicarlo.",
  NADA_QUE_DESCONTAR: "Ese descuento no toca nada de lo que se cobra en esta cuenta.",
  ANTICIPO_DE_EVENTO: "El anticipo de un cumpleaños no lleva descuento.",
};


export function casosDescuentos(base: Base): CasosDescuentos {
  return {
    async leer(ctx) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<DescuentosDelLocalDto>> => {
        // La caja los lee para ofrecerlos y administración para configurarlos.
        if (!ctx.quien?.userId) return rechazoDePermiso("DENEGADO");
        const puede = (await permisoEn(tx, ctx, "catalogo.modificar")) !== "DENEGADO" || (await permisoEn(tx, ctx, "documento.emitir")) !== "DENEGADO";
        if (!puede) return rechazoDePermiso("DENEGADO");
        const ajustes = await ajustesDe(tx, ctx.branchId);
        return { ok: true, valor: DescuentosDelLocalSchema.parse({ reglas: await reglasDe(tx), topeSupervision: ajustes.topeDescuentoSupervision }) };
      });
    },

    async crear(ctx, entrada, ahora = Date.now()) {
      const v = CrearReglaDescuentoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El descuento no se creó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ReglaDescuentoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
        if (rechazo) return rechazo;
        if (cmd.medio) {
          const medio = await tx.paymentMethod.findFirst({ where: { code: cmd.medio }, select: { label: true } });
          if (!medio) return invalido("Ese medio de pago no existe en este local.", ["medio"], "Medio desconocido");
        }
        // Una regla no empieza en el pasado: lo cobrado antes no se recalcula con ella.
        const hoy = calendarDay(new Date(ahora).toISOString(), (await ajustesDe(tx, ctx.branchId)).zonaHoraria);
        if (cmd.desde < hoy) return invalido("Un descuento empieza hoy o después.", ["desde"], "En el pasado");
        const quien = await nombreDe(tx, ctx);
        const fila = await tx.discountRule.create({
          data: {
            tenantId: ctx.tenantId,
            name: cmd.nombre,
            kind: cmd.tipo,
            valueKind: cmd.valor.tipo,
            basisPoints: cmd.valor.tipo === "PORCENTAJE" ? cmd.valor.basisPoints : null,
            amountMinor: cmd.valor.tipo === "MONTO" ? BigInt(cmd.valor.monto.minor) : null,
            currency: cmd.valor.tipo === "MONTO" ? "USD" : null,
            scopeKind: cmd.alcance.tipo,
            categories: cmd.alcance.tipo === "CATEGORIAS" ? [...new Set(cmd.alcance.categorias)] : [],
            methodCode: cmd.medio ?? null,
            validFrom: new Date(`${cmd.desde}T00:00:00.000Z`),
            validTo: cmd.hasta ? new Date(`${cmd.hasta}T00:00:00.000Z`) : null,
            createdAt: new Date(ahora),
            createdBy: ctx.quien?.userId ?? null,
            createdByName: quien.nombre,
          },
        });
        const regla = reglaDeFila(fila, 0);
        await auditar(tx, ctx, { action: "descuento.crear", entityType: "discount_rule", entityId: fila.id, after: resumenDeRegla(regla) });
        return regla;
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "descuento.crear", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async retirar(ctx, entrada, ahora = Date.now()) {
      const v = RetirarReglaDescuentoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se retiró: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ReglaDescuentoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
        if (rechazo) return rechazo;
        const fila = await tx.discountRule.findUnique({ where: { id: v.data.reglaId } });
        if (!fila) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese descuento no existe." };
        if (fila.retiredAt) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese descuento ya estaba retirado." };
        const quien = await nombreDe(tx, ctx);
        const retirada = await tx.discountRule.update({
          where: { id: fila.id },
          data: { retiredAt: new Date(ahora), retiredBy: ctx.quien?.userId ?? null, retiredByName: quien.nombre },
        });
        const regla = reglaDeFila(retirada, 0);
        await auditar(tx, ctx, { action: "descuento.retirar", entityType: "discount_rule", entityId: fila.id, before: resumenDeRegla(regla) });
        return regla;
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "descuento.retirar", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async marcarVip(ctx, entrada, ahora = Date.now()) {
      const v = MarcarVipCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se marcó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx) => {
        const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
        if (rechazo) return rechazo;
        const familia = await tx.guardian.findUnique({ where: { id: cmd.guardianId }, select: { id: true, fullName: true } });
        if (!familia) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa familia no está en el directorio." } satisfies Rechazo;
        let vip: { reglaId: string; nombre: string } | null = null;
        if (cmd.reglaId) {
          const regla = await tx.discountRule.findUnique({ where: { id: cmd.reglaId }, select: { id: true, name: true, kind: true, retiredAt: true } });
          if (!regla || regla.kind !== "VIP") return invalido("Elige un descuento VIP.", ["reglaId"], "No es VIP");
          if (regla.retiredAt) return invalido("Ese descuento VIP está retirado.", ["reglaId"], "Retirada");
          vip = { reglaId: regla.id, nombre: regla.name };
        }
        const antes = await marcaVip(tx, familia.id);
        if ((antes?.reglaId ?? null) === (vip?.reglaId ?? null)) return { guardianId: familia.id, vip };
        const quien = await nombreDe(tx, ctx);
        await tx.guardianVip.create({
          data: {
            tenantId: ctx.tenantId,
            guardianId: familia.id,
            discountRuleId: vip?.reglaId ?? null,
            markedAt: new Date(ahora),
            markedBy: ctx.quien?.userId ?? null,
            markedByName: quien.nombre,
          },
        });
        await auditar(tx, ctx, {
          action: "familia.vip",
          entityType: "guardian",
          entityId: familia.id,
          before: { vip: antes?.nombre ?? null },
          after: { familia: familia.fullName, vip: vip?.nombre ?? null },
        });
        return { guardianId: familia.id, vip };
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "familia.vip", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async deCuenta(ctx, accountId, ahora = Date.now()) {
      const id = typeof accountId === "string" ? accountId : "";
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<DescuentosDeCuentaDto>> => {
        if ((await permisoEn(tx, ctx, "cuenta.descuento")) === "DENEGADO") return rechazoDePermiso("DENEGADO");
        const fila = /^[0-9a-f-]{36}$/i.test(id) ? await tx.account.findUnique({ where: { id }, select: { branchId: true } }) : null;
        if (!fila || fila.branchId !== ctx.branchId) return noExiste;
        const { cuenta, version } = (await vigenteDe(tx, id))!;
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const hoy = calendarDay(new Date(ahora).toISOString(), ajustes.zonaHoraria);
        const vip = await vipDeCuenta(tx, cuenta);
        const categoryOf = await categoriasDe(tx);
        // Un descuento por un medio apagado no se puede cumplir: no se ofrece.
        const encendidos = new Set((await tx.paymentMethod.findMany({ where: { active: true }, select: { code: true } })).map((m) => m.code));
        const reglas = (await reglasDe(tx)).filter((r) => r.tipo !== "MEDIO" || (r.medio !== null && encendidos.has(r.medio)));
        const subtotal = chargeableSubtotal(cuenta);
        const tope = ajustes.topeDescuentoSupervision;
        const candidatos = discountCandidates({ rules: reglas, day: hoy, vipRuleId: vip?.reglaId ?? null, account: cuenta, categoryOf }).map((c) => ({
          regla: c.regla,
          importe: { minor: String(c.importe.amount), currency: "USD" },
          requiere: requiereDe(c.regla.tipo, c.importe, subtotal, tope),
        }));
        return {
          ok: true,
          valor: DescuentosDeCuentaSchema.parse({
            accountId: id,
            version,
            subtotal: { minor: String(subtotal.amount), currency: "USD" },
            topeSupervision: tope,
            vip,
            candidatos,
          }),
        };
      });
    },

    async aplicar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = AplicarDescuentoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El descuento no se aplicó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<FamilyAccountDto | Rechazo> => {
          if ((await permisoEn(tx, ctx, "cuenta.descuento")) === "DENEGADO") return rechazoDePermiso("DENEGADO");
          // Un doble clic devuelve la cuenta como quedó, sin volver a pedir el PIN.
          const previa = await tx.accountVersion.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) {
            if (previa.accountId !== cmd.accountId || previa.cause !== "DESCUENTO") return conflictoDeClave;
            return (await vigenteDe(tx, cmd.accountId))!.cuenta;
          }
          const fila = await tx.account.findUnique({ where: { id: cmd.accountId }, select: { branchId: true } });
          if (!fila || fila.branchId !== ctx.branchId) return noExiste;
          const actual = (await vigenteDe(tx, cmd.accountId))!;
          if (actual.version !== cmd.version) return cuentaCambiada;
          const cuenta = actual.cuenta;
          const quien = await nombreDe(tx, ctx);

          // Quitarlo no regala nada: la cuenta vuelve a deberse entera. Queda en la auditoría.
          if (cmd.quitar) {
            if (!cuenta.descuento) return invalido("Esa cuenta no tiene descuento.", ["quitar"], "Sin descuento");
            const nueva = FamilyAccountSchema.parse({ ...withDiscount(cuenta, null), version: actual.version + 1 });
            await guardarVersion(tx, ctx, nueva, { cause: "DESCUENTO", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
            await auditar(tx, ctx, {
              action: "cuenta.quitar_descuento",
              entityType: "account",
              entityId: cuenta.id,
              before: { orderNumber: cuenta.orderNumber ?? null, descuento: cuenta.descuento.nombre, origen: cuenta.descuento.origen },
              after: { version: nueva.version },
            });
            return nueva;
          }

          const ajustes = await ajustesDe(tx, ctx.branchId);
          const hoy = calendarDay(new Date(ahora).toISOString(), ajustes.zonaHoraria);
          const categoryOf = await categoriasDe(tx);
          const origen = cmd.origen!;
          let nombre = "Descuento de administración";
          let valor = cmd.valor!;
          let alcance: DescuentoAplicadoDto["alcance"] = { tipo: "CUENTA" };
          let medio: string | null = null;
          if (origen !== "ADMIN") {
            const regla = (await reglasDe(tx)).find((r) => r.id === cmd.reglaId);
            if (!regla || regla.tipo !== origen) return invalido("Ese descuento no existe.", ["reglaId"], "Regla desconocida");
            if (!ruleInForce(regla, hoy)) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese descuento ya no rige hoy." };
            if (origen === "VIP" && (await vipDeCuenta(tx, cuenta))?.reglaId !== regla.id) {
              return invalido("Esta familia no está marcada con ese descuento VIP.", ["reglaId"], "No es su VIP");
            }
            ({ nombre, valor, alcance, medio } = regla);
          }
          const problema = applyDiscountProblem(cuenta, { valor, alcance }, categoryOf);
          if (problema) return { ok: false, motivo: problema === "NADA_QUE_DESCONTAR" ? "INVALIDO" : "CONFLICTO", mensaje: MENSAJE_APLICAR[problema] };

          // Lo que pide autorización se comprueba y se registra ANTES de tocar la cuenta (§7.3).
          const importe = discountAmount({ valor, alcance }, cuenta, categoryOf);
          const requiere = requiereDe(origen, importe, chargeableSubtotal(cuenta), ajustes.topeDescuentoSupervision);
          let autorizadoPor: DescuentoAplicadoDto["autorizadoPor"] = null;
          if (requiere !== "NADA") {
            if (requiere === "ADMINISTRACION") {
              // Antes del PIN: quien no es de administración no llega a probarlo.
              const aut = AutorizacionSchema.safeParse(autorizacion);
              const rol = aut.success ? (await tx.staffUser.findUnique({ where: { id: aut.data.autorizadorId }, select: { role: true } }))?.role : null;
              if (rol !== "ADMIN") {
                return {
                  ok: false,
                  motivo: "NO_PERMITIDO",
                  mensaje:
                    origen === "ADMIN"
                      ? "El descuento de administración lo autoriza administración con su PIN."
                      : `Pasa del tope de supervisión (${percentFromBasisPoints(ajustes.topeDescuentoSupervision)} %): lo autoriza administración.`,
                };
              }
            }
            const permiso = await exigirPermisoOAutorizacion(tx, ctx, "cuenta.descuento", autorizacion, ahora, { confirmarConPin: true });
            if (!permiso.ok) return permiso;
            const a = await tx.staffUser.findUniqueOrThrow({ where: { id: permiso.autorizadoPor! }, select: { id: true, fullName: true, role: true } });
            if (a.role !== "ADMIN" && a.role !== "SUPERVISOR") return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Esa persona no puede autorizar esto." };
            autorizadoPor = { id: a.id, name: a.fullName, role: a.role };
          }

          const descuento = DescuentoAplicadoSchema.parse({
            origen,
            reglaId: origen === "ADMIN" ? null : cmd.reglaId!,
            nombre,
            valor,
            alcance,
            medio,
            motivo: cmd.motivo ?? null,
            detalle: cmd.detalle ?? null,
            autorizadoPor,
            en: new Date(ahora).toISOString(),
          });
          const nueva = FamilyAccountSchema.parse({ ...withDiscount(cuenta, descuento), version: actual.version + 1 });
          await guardarVersion(tx, ctx, nueva, { cause: "DESCUENTO", operationKey: cmd.idempotencyKey, ahora, quien: quien.nombre });
          await auditar(tx, ctx, {
            action: "cuenta.descuento",
            entityType: "account",
            entityId: cuenta.id,
            ...(autorizadoPor ? { authorizedBy: autorizadoPor.id } : {}),
            reason: (cmd.motivo ? TEXTO_MOTIVO_DESCUENTO[cmd.motivo] : origen === "ADMIN" ? cmd.detalle : origen === "VIP" ? "Familia VIP" : "Pago por el medio del descuento") ?? origen,
            ...(cuenta.descuento ? { before: { descuento: cuenta.descuento.nombre, origen: cuenta.descuento.origen } } : {}),
            after: {
              orderNumber: cuenta.orderNumber ?? null,
              origen,
              nombre,
              reglaId: descuento.reglaId,
              valor,
              alcance,
              importe: { minor: String(importe.amount), currency: "USD" },
              detalle: cmd.detalle ?? null,
              version: nueva.version,
            },
          });
          return nueva;
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "cuenta.descuento", reason: r.mensaje });
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

/** Qué hace falta para aplicarlo: el VIP lo ampara su marca; lo de administración, administración. */
function requiereDe(origen: DescuentoAplicadoDto["origen"], importe: Parameters<typeof needsAdministration>[1], subtotal: Parameters<typeof needsAdministration>[2], tope: number): RequiereDescuento {
  if (origen === "VIP") return "NADA";
  return needsAdministration(origen, importe, subtotal, tope) ? "ADMINISTRACION" : "AUTORIZACION";
}
