/**
 * Los ajustes de la sucursal en el servidor — B4-4, F5-08b.
 *
 * Publicar añade una versión; nunca reescribe la anterior (regla 5, la tabla lo impone). La vigente
 * es la más alta de la sucursal. Sin ninguna, rigen los **valores de fábrica**: los que el código
 * usaba hasta este paso y el cliente decidió (M-13, D9), no datos inventados; el RIF, la dirección,
 * el teléfono y el horario quedan sin declarar hasta que el cliente los dé (F0-04).
 *
 * Los demás casos de uso leen de aquí lo que antes era una constante: la zona que decide qué día es
 * hoy, el residuo del cobro, el umbral del arqueo y las horas de una huérfana (`ajustesDe`).
 */
import {
  AjustesPublicadosSchema,
  AjustesSucursalSchema,
  problemasDe,
  PublicarAjustesCommandSchema,
  type AjustesPublicadosDto,
  type AjustesSucursalDto,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base, type BranchSettingsVersion, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";

/**
 * Los valores de fábrica de una sucursal: los que regían en el código antes de B4-4. La hora en 12 h
 * (CLAUDE.md), Venezuela (ADR-009), $ 0,05 de residuo (F4-04c), $ 1,00 de arqueo (M-13) y 8 horas
 * para una huérfana (D9, 2026-09-28).
 */
export function ajustesDeFabrica(nombre: string): AjustesSucursalDto {
  return AjustesSucursalSchema.parse({
    nombre: nombre.trim().length >= 2 ? nombre : "Sucursal",
    rif: null,
    direccionFiscal: null,
    telefono: null,
    monedaFuncional: "USD",
    formatoHora: "12h",
    zonaHoraria: "America/Caracas",
    horario: null,
    maxRetenido: { minor: "5", currency: "USD" },
    umbralArqueo: { minor: "100", currency: "USD" },
    horasHuerfana: 8,
    servicio: { kind: "SIN_SERVICIO" },
  });
}

type Vigentes = Readonly<{ fila: BranchSettingsVersion | null; ajustes: AjustesSucursalDto }>;

async function vigentes(tx: Transaccion, branchId: string): Promise<Vigentes> {
  const fila = await tx.branchSettingsVersion.findFirst({ where: { branchId }, orderBy: { version: "desc" } });
  if (fila) return { fila, ajustes: revalidado(fila) };
  // El nombre de fábrica es el del local (el que sale en el recibo), no el de la sucursal.
  const sucursal = await tx.branch.findUnique({ where: { id: branchId }, select: { tenant: { select: { name: true } } } });
  return { fila: null, ajustes: ajustesDeFabrica(sucursal?.tenant.name ?? "Sucursal") };
}

/**
 * Los ajustes que rigen en la sucursal, dentro de la transacción de quien los necesita: así la zona
 * o el umbral con que se decide son los mismos que ve la operación que los usa.
 */
export async function ajustesDe(tx: Transaccion, branchId: string): Promise<AjustesSucursalDto> {
  return (await vigentes(tx, branchId)).ajustes;
}

/** La zona que decide qué día es hoy en la sucursal (ADR-009). */
export async function zonaDe(tx: Transaccion, branchId: string): Promise<string> {
  return (await ajustesDe(tx, branchId)).zonaHoraria;
}

export interface CasosAjustes {
  /**
   * Los ajustes vigentes. No exige persona: el formato de hora y el nombre del local los enseña
   * también la pantalla de acceso.
   */
  leer(ctx: Contexto): Promise<AjustesPublicadosDto>;
  /**
   * Publica los ajustes como versión nueva. Se niega si otra persona publicó sobre la misma versión
   * (`versionBase`) o si cambia la zona horaria con la caja o el parque en marcha.
   */
  publicar(ctx: Contexto, entrada: unknown): Promise<Resultado<AjustesPublicadosDto>>;
}

export function casosAjustes(base: Base): CasosAjustes {
  return {
    async leer(ctx) {
      return publicados(await base.conTenant(ctx.tenantId, (tx) => vigentes(tx, ctx.branchId)));
    },

    async publicar(ctx, entrada) {
      const v = PublicarAjustesCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "Los ajustes no se publicaron: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const { versionBase, ajustes } = v.data;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx) => {
          // Lo que cambia cómo cobra la caja es de administración, con elevación (F2-04), como el tarifario.
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const antes = await vigentes(tx, ctx.branchId);
          const version = antes.fila?.version ?? 0;
          if (version !== versionBase) {
            return {
              ok: false as const,
              motivo: "CONFLICTO" as const,
              mensaje: "Alguien publicó otros ajustes mientras editabas. Revisa los vigentes antes de publicar.",
            };
          }
          if (ajustes.zonaHoraria !== antes.ajustes.zonaHoraria) {
            // La zona decide el día de negocio (ADR-009): cambiarla con un turno abierto o niños en sala
            // partiría su día en dos. Se cambia con el local parado.
            const turno = await tx.cashShift.findFirst({ where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" } }, select: { id: true } });
            const nino = turno ? null : await tx.parkSession.findFirst({ where: { branchId: ctx.branchId, status: "ACTIVA" }, select: { id: true } });
            if (turno || nino) {
              return {
                ok: false as const,
                motivo: "CONFLICTO" as const,
                mensaje: turno
                  ? "La zona horaria decide el día de negocio: se cambia sin turnos abiertos. Cierra los turnos y vuelve a publicar."
                  : "La zona horaria decide el día de negocio: se cambia sin niños en sala. Vuelve a publicar cuando salgan.",
                problemas: [{ path: ["ajustes", "zonaHoraria"], message: "No se cambia con el local en marcha" }],
              };
            }
          }
          if (ajustes.preciosConIva !== antes.ajustes.preciosConIva) {
            // Si los precios llevan o no el IVA dentro cambia lo que se cobra de cada cuenta: con un turno
            // abierto, una cuenta vista a un precio se cobraría a otro. Se cambia con la caja cerrada.
            const turno = await tx.cashShift.findFirst({ where: { branchId: ctx.branchId, status: { not: "CERRADO_Z" } }, select: { id: true } });
            if (turno) {
              return {
                ok: false as const,
                motivo: "CONFLICTO" as const,
                mensaje: "Si los precios incluyen el IVA cambia lo que se cobra: se cambia sin turnos abiertos. Cierra los turnos y vuelve a publicar.",
                problemas: [{ path: ["ajustes", "preciosConIva"], message: "No se cambia con la caja abierta" }],
              };
            }
          }
          const autor = ctx.quien?.userId ? await nombreDe(tx, ctx) : null;
          const fila = await tx.branchSettingsVersion.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              version: version + 1,
              content: ajustes,
              publishedBy: autor?.id ?? null,
              publishedByName: autor?.nombre ?? null,
            },
          });
          // §7.4: lo que había (también si eran los de fábrica) y lo que queda.
          await auditar(tx, ctx, {
            action: "sucursal.ajustar",
            entityType: "branch_settings_version",
            entityId: fila.id,
            before: { version, ajustes: antes.ajustes },
            after: { version: fila.version, ajustes },
          });
          return fila;
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "sucursal.ajustar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: publicados({ fila: r, ajustes: revalidado(r) }) };
      } catch (e) {
        switch (errorDeBase(e)?.motivo) {
          // Dos publicaciones a la vez sobre la misma versión: gana la primera.
          case "DUPLICADO":
            return { ok: false, motivo: "CONFLICTO", mensaje: "Alguien publicó otros ajustes al mismo tiempo. Revisa los vigentes antes de publicar." };
          case "REFERENCIA_INVALIDA":
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "La sucursal no existe en este local." };
          default:
            throw e;
        }
      }
    },
  };
}

/**
 * La fila, revalidada. Si lo guardado ya no cumple el contrato (porque el contrato cambió), se niega
 * en vez de operar con unos ajustes que el sistema no entiende (fail-closed).
 */
function revalidado(fila: BranchSettingsVersion): AjustesSucursalDto {
  const r = AjustesSucursalSchema.safeParse(fila.content);
  if (!r.success) {
    throw new Error(`Los ajustes v${fila.version} guardados no cumplen el contrato actual; hay que publicar unos nuevos.`);
  }
  return r.data;
}

function publicados({ fila, ajustes }: Vigentes): AjustesPublicadosDto {
  return AjustesPublicadosSchema.parse({
    version: fila?.version ?? 0,
    publicadoEn: fila?.publishedAt.toISOString() ?? null,
    publicadoPor: fila ? (fila.publishedByName ?? "Consola del servidor") : null,
    ajustes,
  });
}
