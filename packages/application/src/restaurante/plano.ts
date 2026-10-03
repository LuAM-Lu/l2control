/**
 * El plano del local en el servidor — B6-1, F6-01, F6-02 (I-05).
 *
 * Publicar añade una versión; nunca reescribe la anterior (regla 5, la tabla lo impone). La vigente
 * es la más alta de la sucursal. Sin ninguna, el local **no tiene plano**: el salón dice dónde se
 * dibuja, no inventa mesas.
 *
 * Quién decide qué:
 *  · el contrato (`PlanoLocalSchema`): la geometría (mesas dentro del local, sin encimarse, números
 *    distintos en el salón);
 *  · el dominio (`cambioDePlanoProblem`): una mesa no desaparece, se retira, y con su cuenta abierta
 *    no se retira;
 *  · este archivo: la versión optimista (`sobre`), la hora de retirar una mesa (la del servidor, no la
 *    del navegador) y que **una mesa tenga una sola cuenta abierta** (I-05), con un candado por
 *    sucursal que ordenan también las altas de cuentas de mesa (`mesaParaCuentaNueva`).
 */
import {
  PlanoLocalSchema,
  PlanoPublicadoSchema,
  problemasDe,
  PublicarPlanoCommandSchema,
  type PlanoLocalDto,
  type PlanoPublicadoDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { cambioDePlanoProblem } from "@l2/domain-orders";
import { errorDeBase, type Base, type FloorPlanVersion, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";

export interface CasosPlano {
  /**
   * El plano vigente de la sucursal, con quién y cuándo se publicó; `plano: null` si nunca se dibujó.
   * No exige persona: el plano no es dato sensible y lo lee toda superficie que pinta mesas.
   */
  leer(ctx: Contexto): Promise<PlanoPublicadoDto>;
  /**
   * Publica un plano como versión nueva (`PublicarPlanoCommandSchema`): `catalogo.modificar` con
   * elevación. Choca si otra persona publicó sobre la misma versión, y se niega a borrar una mesa o
   * a retirar una con su cuenta abierta.
   */
  publicar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PlanoPublicadoDto>>;
}

type Vigente = Readonly<{ fila: FloorPlanVersion | null; plano: PlanoLocalDto | null }>;

/** El plano vigente de la sucursal, dentro de la transacción de quien lo necesita. */
export async function planoEn(tx: Transaccion, branchId: string): Promise<Vigente> {
  const fila = await tx.floorPlanVersion.findFirst({ where: { branchId }, orderBy: { version: "desc" } });
  return { fila, plano: fila ? revalidado(fila) : null };
}

/**
 * Las mesas con una cuenta abierta (o por cobrar) en la sucursal: su id → el de la cuenta. Lee la
 * última versión de cada cuenta de mesa.
 */
export async function mesasOcupadasEn(tx: Transaccion, branchId: string): Promise<Map<string, string>> {
  const filas = await tx.$queryRaw<{ table_id: string | null; account_id: string }[]>`
    SELECT ultima.content->>'tableId' AS table_id, ultima.account_id FROM (
      SELECT DISTINCT ON (v.account_id) v.account_id, v.content, v.status
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MESA'
      ORDER BY v.account_id, v.version DESC
    ) ultima
    WHERE ultima.status IN ('ABIERTA', 'POR_COBRAR')`;
  return new Map(filas.flatMap((f) => (f.table_id ? [[f.table_id, f.account_id] as const] : [])));
}

/**
 * Las mesas de la sucursal se abren y se retiran de una en una: el candado ordena dos altas de cuenta
 * en la misma mesa (I-05) y un plano que se publica mientras una mesa se abre.
 */
export async function candadoDeMesas(tx: Transaccion, branchId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mesas:${branchId}`}, 0))::text AS candado`;
}

/**
 * ¿Puede nacer una cuenta en esta mesa? Tiene que estar en el plano publicado, en el salón (sin
 * retirar) y sin otra cuenta abierta (I-05). Devuelve el número de la mesa, o el rechazo.
 */
/**
 * Las estancias ya vinculadas a alguna mesa de la sucursal (F6-05): su id → a qué mesa y con qué
 * etiqueta. Un niño vinculado no se ofrece para otra mesa: su parque se cobraría dos veces (R3).
 */
export async function sessionsVinculadas(tx: Transaccion, branchId: string): Promise<Map<string, Readonly<{ tableId: string; label: string }>>> {
  const filas = await tx.$queryRaw<{ content: unknown }[]>`
    SELECT ultima.content FROM (
      SELECT DISTINCT ON (v.account_id) v.account_id, v.content, v.status
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MESA'
      ORDER BY v.account_id, v.version DESC
    ) ultima
    WHERE ultima.status IN ('ABIERTA', 'POR_COBRAR')`;
  const mapa = new Map<string, Readonly<{ tableId: string; label: string }>>();
  for (const f of filas) {
    const c = f.content as { tableId?: string; tableLabel?: string; sessionIds?: string[] };
    for (const id of c.sessionIds ?? []) mapa.set(id, { tableId: c.tableId ?? "", label: c.tableLabel ?? "?" });
  }
  return mapa;
}

export async function mesaParaCuentaNueva(tx: Transaccion, branchId: string, tableId: string): Promise<Readonly<{ label: string }> | Rechazo> {
  await candadoDeMesas(tx, branchId);
  const { plano } = await planoEn(tx, branchId);
  if (!plano) {
    return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El local no tiene plano publicado: se dibuja en Ajustes → Plano del local." };
  }
  const mesa = plano.tables.find((m) => m.id === tableId);
  if (!mesa || mesa.retiredAt !== undefined) {
    return { ok: false, motivo: "INVALIDO", mensaje: "Esa mesa no está en el salón.", problemas: [{ path: ["cuenta", "tableId"], message: "MESA_FUERA_DEL_PLANO" }] };
  }
  if ((await mesasOcupadasEn(tx, branchId)).has(tableId)) {
    return {
      ok: false,
      motivo: "CONFLICTO",
      mensaje: `La mesa ${mesa.label} ya tiene su cuenta abierta: otro equipo la abrió. Vuelve a mirar la mesa.`,
      problemas: [{ path: ["cuenta", "tableId"], message: "MESA_CON_CUENTA" }],
    };
  }
  return { label: mesa.label };
}

export function casosPlano(base: Base): CasosPlano {
  return {
    async leer(ctx) {
      return publicado(await base.conTenant(ctx.tenantId, (tx) => planoEn(tx, ctx.branchId)));
    },

    async publicar(ctx, entrada, ahora = Date.now()) {
      const v = PublicarPlanoCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El plano no se publicó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const { sobre } = v.data;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Vigente | Rechazo> => {
          // El salón es configuración del local, como la carta y las tarifas: administración, con elevación.
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          // Cada versión dice quién la publicó (la tabla lo exige): la consola no dibuja planos.
          if (!ctx.quien?.userId) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Un plano lo publica una persona, con su sesión." };
          await candadoDeMesas(tx, ctx.branchId);
          const antes = await planoEn(tx, ctx.branchId);
          const version = antes.fila?.version ?? null;
          if (version !== sobre) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Alguien publicó otro plano mientras editabas. Revisa el vigente antes de publicar." };
          }

          // La hora de retirar una mesa es la del servidor; la de una ya retirada no cambia.
          const previas = new Map((antes.plano?.tables ?? []).map((m) => [m.id, m]));
          const instante = new Date(ahora).toISOString();
          const tables = v.data.plano.tables.map(({ retiredAt, ...m }) =>
            retiredAt === undefined ? m : { ...m, retiredAt: previas.get(m.id)?.retiredAt ?? instante },
          );
          const ocupadas = await mesasOcupadasEn(tx, ctx.branchId);
          const problema = cambioDePlanoProblem(antes.plano?.tables ?? null, tables, new Set(ocupadas.keys()));
          if (problema) {
            const i = Math.max(0, tables.findIndex((m) => m.label === problema.mesa));
            return problema.problema === "MESA_DESAPARECE"
              ? {
                  ok: false,
                  motivo: "INVALIDO",
                  mensaje: `La mesa ${problema.mesa} no se borra: se retira del salón (los pedidos y cobros del pasado la nombran).`,
                  problemas: [{ path: ["plano", "tables"], message: problema.problema }],
                }
              : {
                  ok: false,
                  motivo: "CONFLICTO",
                  mensaje: `La mesa ${problema.mesa} tiene su cuenta abierta: se retira cuando se cobre.`,
                  problemas: [{ path: ["plano", "tables", i], message: problema.problema }],
                };
          }
          const plano = PlanoLocalSchema.parse({ ...v.data.plano, tables });
          // Publicar lo mismo no añade versión: el historial dice cuándo cambió el salón.
          if (antes.plano && JSON.stringify(antes.plano) === JSON.stringify(plano)) return antes;

          const autor = await nombreDe(tx, ctx);
          const fila = await tx.floorPlanVersion.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              version: (version ?? 0) + 1,
              content: plano,
              publishedAt: new Date(ahora),
              publishedBy: autor.id,
              publishedByName: autor.nombre,
            },
          });
          await auditar(tx, ctx, {
            action: "plano.publicar",
            entityType: "floor_plan_version",
            entityId: fila.id,
            ...(antes.plano ? { before: resumenDe(version, antes.plano) } : {}),
            after: resumenDe(fila.version, plano),
          });
          return { fila, plano };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "plano.publicar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: publicado(r) };
      } catch (e) {
        switch (errorDeBase(e)?.motivo) {
          // Dos publicaciones a la vez sobre la misma versión: gana la primera.
          case "DUPLICADO":
            return { ok: false, motivo: "CONFLICTO", mensaje: "Alguien publicó otro plano al mismo tiempo. Revisa el vigente antes de publicar." };
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
 * en vez de pintar un salón que el sistema no entiende (fail-closed).
 */
function revalidado(fila: FloorPlanVersion): PlanoLocalDto {
  const r = PlanoLocalSchema.safeParse(fila.content);
  if (!r.success) throw new Error(`El plano v${fila.version} guardado no cumple el contrato actual; hay que publicar uno nuevo.`);
  return r.data;
}

function publicado({ fila, plano }: Vigente): PlanoPublicadoDto {
  return PlanoPublicadoSchema.parse({
    plano,
    version: fila?.version ?? null,
    publicadoEn: fila?.publishedAt.toISOString() ?? null,
    publicadoPor: fila?.publishedByName ?? null,
  });
}

/** Lo que va a la auditoría de un plano: su forma, no su geometría. */
function resumenDe(version: number | null, p: PlanoLocalDto) {
  const enSalon = p.tables.filter((m) => m.retiredAt === undefined);
  return {
    version,
    medidas: `${p.width} × ${p.height} cm`,
    mesas: enSalon.map((m) => m.label),
    retiradas: p.tables.filter((m) => m.retiredAt !== undefined).map((m) => m.label),
    sillas: enSalon.reduce((n, m) => n + m.seats, 0),
  };
}
