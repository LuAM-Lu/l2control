/**
 * Los medios de pago del local en el servidor — B3-2, F4-02, F4-04, §9.9.
 *
 * Qué se cobra, por qué terminal y con qué datos del local es configuración de la base, no del
 * navegador ni del código. Quién decide qué:
 *  · el dominio (`@l2/domain-cash`): qué medio tiene sentido (`methodDefinitionProblem`) y cuál
 *    puede ofrecer la caja (`offerProblem`);
 *  · el contrato (`MediosDePagoSchema`): que la configuración que resulta de un cambio no deje un
 *    medio encendido sin los datos que el cliente necesita (fail-closed);
 *  · la matriz: cambiarla es `catalogo.modificar` (administración, con elevación), porque cambia
 *    por dónde entra el dinero;
 *  · este archivo: una transacción por cambio, con su asiento, y los datos del local cifrados
 *    (§7.6): un Zelle puede ser la cuenta personal de quien lleva el negocio.
 *
 * Nada se borra: un medio se apaga (los asientos lo citan), un terminal se retira (un pago dice
 * por cuál pasó la tarjeta) y los datos del local se sustituyen añadiendo una fila.
 */
import {
  DatosPagoMovilSchema,
  DatosZelleSchema,
  MedioCommandSchema,
  MediosDePagoSchema,
  problemasDe,
  type MedioCommand,
  type MediosDePagoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { methodDefinitionProblem, type PaymentDataKind } from "@l2/domain-cash";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo, type AccionAuditada, type Asiento } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import type { Cifrador } from "../identidad/cifrado.ts";

export interface CasosMedios {
  /**
   * La configuración del local: medios (encendidos o no), terminales vigentes de la sucursal y los
   * datos que ve el cliente. Exige una persona en sesión: son datos del negocio, no de la puerta.
   */
  leer(ctx: Contexto): Promise<Resultado<MediosDePagoDto>>;
  /** Un cambio de la configuración (`MedioCommandSchema`). Devuelve cómo queda. */
  aplicar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<MediosDePagoDto>>;
}

const sinClave: Rechazo = {
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: "Los datos de cobro no están disponibles en este servidor (falta L2_CLAVE_CIFRADO).",
};
const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({
  ok: false,
  motivo: "INVALIDO",
  mensaje,
  problemas: [{ path, message }],
});

export function casosMedios(base: Base, cifrador: Cifrador | null): CasosMedios {
  /** La configuración tal como está en la base, dentro de una transacción ya abierta. */
  const cargar = async (tx: Transaccion, ctx: Contexto, c: Cifrador): Promise<MediosDePagoDto> => {
    const medios = await tx.paymentMethod.findMany({ orderBy: [{ position: "asc" }, { code: "asc" }] });
    const terminales = await tx.posTerminal.findMany({ where: { branchId: ctx.branchId, retiredAt: null }, orderBy: { createdAt: "asc" } });
    const datos = await tx.collectionDetails.findMany({ orderBy: { recordedAt: "desc" } });
    // Rige la última fila de cada clase: cambiar los datos añade una, no reescribe (regla 5).
    const ultimo = (kind: string) => {
      const fila = datos.find((d) => d.kind === kind);
      return fila ? (JSON.parse(c.descifrar(fila.dataCipher)) as unknown) : undefined;
    };
    const pagoMovil = ultimo("PAGO_MOVIL");
    const zelle = ultimo("ZELLE");
    // Se revalida al salir: lo que no cumple el contrato no llega a la caja (fail-closed).
    return MediosDePagoSchema.parse({
      medios: medios.map((m) => ({
        code: m.code,
        label: m.label,
        currency: m.currency,
        triggersIgtf: m.triggersIgtf,
        canGiveChange: m.givesChange,
        ...(m.dataKind ? { datos: m.dataKind } : {}),
        activo: m.active,
      })),
      terminales: terminales.map((t) => ({ id: t.id, name: t.name, bank: t.bank })),
      ...(pagoMovil ? { pagoMovil: DatosPagoMovilSchema.parse(pagoMovil) } : {}),
      ...(zelle ? { zelle: DatosZelleSchema.parse(zelle) } : {}),
    });
  };

  return {
    async leer(ctx) {
      if (!ctx.sistema && !ctx.quien?.userId) {
        return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los medios de pago." };
      }
      if (!cifrador) return sinClave;
      const config = await base.conTenant(ctx.tenantId, (tx) => cargar(tx, ctx, cifrador));
      return { ok: true, valor: config };
    },

    async aplicar(ctx, entrada, ahora = Date.now()) {
      const v = MedioCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El cambio no se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      if (!cifrador) return sinClave;
      const cmd = v.data;
      if (cmd.kind === "AÑADIR_MEDIO") {
        const m = cmd.medio;
        const problema = methodDefinitionProblem({ currency: m.currency, givesChange: m.canGiveChange, dataKind: m.datos ?? null });
        if (problema) return invalido("Ese medio no tiene sentido así.", ["medio", "canGiveChange"], problema);
      }

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<MediosDePagoDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const antes = await cargar(tx, ctx, cifrador);
          const despues = aplicarA(antes, cmd);
          if ("ok" in despues) return despues;
          // La configuración que resulta tiene que seguir cobrando: ningún medio encendido sin los
          // datos del local que el cliente necesita, ni el punto sin terminales.
          const valida = MediosDePagoSchema.safeParse(despues);
          if (!valida.success) {
            return { ok: false, motivo: "INVALIDO", mensaje: valida.error.issues[0]?.message ?? "La configuración no cobraría así.", problemas: problemasDe(valida.error) };
          }
          const quien = await nombreDe(tx, ctx);
          const asiento = await guardar(tx, ctx, cmd, antes, quien.nombre, cifrador, ahora);
          if (asiento) await auditar(tx, ctx, asiento);
          return cargar(tx, ctx, cifrador);
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accionDe(cmd), reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return cmd.kind === "AÑADIR_MEDIO"
            ? invalido("Ya hay un medio con ese código.", ["medio", "code"], "Código repetido")
            : invalido("Ya hay un terminal con ese nombre.", ["terminal", "name"], "Nombre repetido");
        }
        throw e;
      }
    },
  };
}

/** La configuración como quedaría con el cambio, para validarla ANTES de guardar nada. */
function aplicarA(c: MediosDePagoDto, cmd: MedioCommand): MediosDePagoDto | Rechazo {
  switch (cmd.kind) {
    case "ACTIVAR":
      if (!c.medios.some((m) => m.code === cmd.code)) return invalido("Ese medio no existe en este local.", ["code"], "Medio desconocido");
      return { ...c, medios: c.medios.map((m) => (m.code === cmd.code ? { ...m, activo: cmd.activo } : m)) };
    case "AÑADIR_MEDIO": {
      const { datos, ...resto } = cmd.medio;
      return { ...c, medios: [...c.medios, { ...resto, ...(datos ? { datos } : {}), activo: false }] };
    }
    case "DATOS_PAGO_MOVIL":
      return { ...c, pagoMovil: cmd.datos };
    case "DATOS_ZELLE":
      return { ...c, zelle: cmd.datos };
    case "AÑADIR_TERMINAL":
      // El identificador de verdad lo pone la base; este solo sirve para validar el conjunto.
      return { ...c, terminales: [...c.terminales, { id: "nuevo", ...cmd.terminal }] };
    case "RETIRAR_TERMINAL":
      if (!c.terminales.some((t) => t.id === cmd.terminalId)) {
        return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese terminal no está vigente en esta sucursal." };
      }
      return { ...c, terminales: c.terminales.filter((t) => t.id !== cmd.terminalId) };
  }
}

function accionDe(cmd: MedioCommand): AccionAuditada {
  switch (cmd.kind) {
    case "ACTIVAR":
      return cmd.activo ? "medio.encender" : "medio.apagar";
    case "AÑADIR_MEDIO":
      return "medio.crear";
    case "DATOS_PAGO_MOVIL":
    case "DATOS_ZELLE":
      return "medio.datos";
    case "AÑADIR_TERMINAL":
      return "terminal.crear";
    case "RETIRAR_TERMINAL":
      return "terminal.retirar";
  }
}

/** Escribe el cambio y devuelve su asiento de auditoría, o `null` si no cambia nada. */
async function guardar(
  tx: Transaccion,
  ctx: Contexto,
  cmd: MedioCommand,
  antes: MediosDePagoDto,
  quien: string,
  cifrador: Cifrador,
  ahora: number,
): Promise<Asiento | null> {
  const action = accionDe(cmd);
  switch (cmd.kind) {
    case "ACTIVAR": {
      const previo = antes.medios.find((m) => m.code === cmd.code)!;
      if (previo.activo === cmd.activo) return null; // ya estaba así: nada que guardar ni auditar
      const fila = await tx.paymentMethod.update({ where: { tenantId_code: { tenantId: ctx.tenantId, code: cmd.code } }, data: { active: cmd.activo } });
      return { action, entityType: "payment_method", entityId: fila.id, before: { code: cmd.code, activo: previo.activo }, after: { code: cmd.code, activo: cmd.activo } };
    }
    case "AÑADIR_MEDIO": {
      const m = cmd.medio;
      const ultima = await tx.paymentMethod.aggregate({ _max: { position: true } });
      const fila = await tx.paymentMethod.create({
        data: {
          tenantId: ctx.tenantId,
          code: m.code,
          label: m.label,
          currency: m.currency,
          givesChange: m.canGiveChange,
          triggersIgtf: m.triggersIgtf,
          dataKind: (m.datos ?? null) satisfies PaymentDataKind | null,
          active: false,
          position: (ultima._max.position ?? -1) + 1,
          createdAt: new Date(ahora),
          createdByName: quien,
        },
      });
      return { action, entityType: "payment_method", entityId: fila.id, after: { ...m, activo: false } };
    }
    case "DATOS_PAGO_MOVIL":
    case "DATOS_ZELLE": {
      const kind = cmd.kind === "DATOS_PAGO_MOVIL" ? "PAGO_MOVIL" : "ZELLE";
      const fila = await tx.collectionDetails.create({
        data: {
          tenantId: ctx.tenantId,
          kind,
          dataCipher: cifrador.cifrar(JSON.stringify(cmd.datos)),
          recordedAt: new Date(ahora),
          recordedBy: ctx.quien?.userId ?? null,
          recordedByName: quien,
        },
      });
      // Los datos no van a la auditoría, ni siquiera redactados: basta con saber quién los cambió.
      return { action, entityType: "collection_details", entityId: fila.id, after: { clase: kind, teniaDatos: (kind === "PAGO_MOVIL" ? antes.pagoMovil : antes.zelle) !== undefined } };
    }
    case "AÑADIR_TERMINAL": {
      const fila = await tx.posTerminal.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          name: cmd.terminal.name,
          bank: cmd.terminal.bank,
          createdAt: new Date(ahora),
          createdBy: ctx.quien?.userId ?? null,
          createdByName: quien,
        },
      });
      return { action, entityType: "pos_terminal", entityId: fila.id, after: { name: fila.name, bank: fila.bank } };
    }
    case "RETIRAR_TERMINAL": {
      const fila = await tx.posTerminal.update({
        where: { id: cmd.terminalId },
        data: { retiredAt: new Date(ahora), retiredBy: ctx.quien?.userId ?? null, retiredByName: quien },
      });
      return { action, entityType: "pos_terminal", entityId: fila.id, before: { name: fila.name, bank: fila.bank } };
    }
  }
}
