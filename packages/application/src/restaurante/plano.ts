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
 *    del navegador) y las cuentas de cada mesa, con un candado por sucursal que ordena también sus altas
 *    (`mesaParaCuentaNueva`). Desde B6-7 una mesa admite varias cuentas abiertas, cada una con su nombre
 *    (mesas compartidas, M-27): I-05 pasa a ser «una cuenta nueva solo sobre lo que se vio».
 */
import {
  CUENTAS_POR_MESA,
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

/** Una cuenta abierta en una mesa: su id y su nombre (`family`: «Mesa 3» o el de la familia). */
export type CuentaEnMesa = Readonly<{ id: string; nombre: string }>;

/**
 * Las cuentas abiertas (o por cobrar) de cada mesa de la sucursal: su id → sus cuentas, de la más antigua
 * a la más nueva. Una mesa compartida tiene varias (B6-7). Lee la última versión de cada cuenta de mesa.
 */
export async function cuentasDeLasMesas(tx: Transaccion, branchId: string): Promise<Map<string, CuentaEnMesa[]>> {
  const filas = await tx.$queryRaw<{ table_id: string | null; account_id: string; family: string | null }[]>`
    SELECT ultima.content->>'tableId' AS table_id, ultima.account_id, ultima.content->>'family' AS family FROM (
      SELECT DISTINCT ON (v.account_id) v.account_id, v.content, v.status, a.opened_at
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MESA'
      ORDER BY v.account_id, v.version DESC
    ) ultima
    WHERE ultima.status IN ('ABIERTA', 'POR_COBRAR')
    ORDER BY ultima.opened_at, ultima.account_id`;
  const mapa = new Map<string, CuentaEnMesa[]>();
  for (const f of filas) {
    if (!f.table_id) continue;
    mapa.set(f.table_id, [...(mapa.get(f.table_id) ?? []), { id: f.account_id, nombre: f.family ?? "" }]);
  }
  return mapa;
}

/** Las cuentas de pie abiertas (o por cobrar) de la sucursal (B6-7), de la más antigua a la más nueva. */
export async function cuentasDePieEn(tx: Transaccion, branchId: string): Promise<CuentaEnMesa[]> {
  const filas = await tx.$queryRaw<{ account_id: string; family: string | null }[]>`
    SELECT ultima.account_id, ultima.content->>'family' AS family FROM (
      SELECT DISTINCT ON (v.account_id) v.account_id, v.content, v.status, a.opened_at
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MOSTRADOR'
      ORDER BY v.account_id, v.version DESC
    ) ultima
    WHERE ultima.status IN ('ABIERTA', 'POR_COBRAR') AND ultima.content->>'dePie' = 'true'
    ORDER BY ultima.opened_at, ultima.account_id`;
  return filas.map((f) => ({ id: f.account_id, nombre: f.family ?? "" }));
}

/**
 * Las mesas de la sucursal se abren y se retiran de una en una: el candado ordena dos altas de cuenta
 * en la misma mesa y un plano que se publica mientras una mesa se abre.
 */
export async function candadoDeMesas(tx: Transaccion, branchId: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mesas:${branchId}`}, 0))::text AS candado`;
}

/**
 * Las estancias ya vinculadas a alguna mesa de la sucursal (F6-05): su id → a qué mesa y con qué
 * etiqueta. Un niño vinculado no se ofrece para otra mesa: su parque se cobraría dos veces (R3).
 */
export async function sessionsVinculadas(
  tx: Transaccion,
  branchId: string,
): Promise<Map<string, Readonly<{ tableId: string; label: string; accountId: string }>>> {
  const filas = await tx.$queryRaw<{ account_id: string; content: unknown }[]>`
    SELECT ultima.account_id, ultima.content FROM (
      SELECT DISTINCT ON (v.account_id) v.account_id, v.content, v.status
      FROM account_version v
      JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
      WHERE a.branch_id = ${branchId}::uuid AND a.kind = 'MESA'
      ORDER BY v.account_id, v.version DESC
    ) ultima
    WHERE ultima.status IN ('ABIERTA', 'POR_COBRAR')`;
  const mapa = new Map<string, Readonly<{ tableId: string; label: string; accountId: string }>>();
  for (const f of filas) {
    const c = f.content as { tableId?: string; tableLabel?: string; sessionIds?: string[] };
    for (const id of c.sessionIds ?? []) mapa.set(id, { tableId: c.tableId ?? "", label: c.tableLabel ?? "?", accountId: f.account_id });
  }
  return mapa;
}

/**
 * Una mesa sin cuenta abierta no la abre un pedido, una pulsera ni una salida del parque: se sienta primero a su
 * cliente, con nombre, cédula y teléfono (B6-9, M-33). Así toda cuenta del salón tiene a quién cobrarle.
 */
export function mesaSinCuenta(path: readonly (string | number)[]): Rechazo {
  return {
    ok: false,
    motivo: "CONFLICTO",
    mensaje: "Esa mesa no tiene cuenta abierta: sienta primero a su cliente, con su nombre, cédula y teléfono.",
    problemas: [{ path: [...path], message: "MESA_SIN_CUENTA" }],
  };
}

/** Cómo se abre una cuenta más en una mesa (B6-7): con nombre, y sabiendo cuántas veía quien la abre. */
export type CuentaNuevaEnMesa = Readonly<{ nombre?: string; vistas: number }>;

const mismoNombre = (a: string, b: string) => a.trim().localeCompare(b.trim(), "es", { sensitivity: "base" }) === 0;

/**
 * ¿Puede nacer una cuenta en esta mesa? Tiene que estar en el plano publicado y en el salón (sin retirar).
 * Devuelve el número de la mesa, o el rechazo.
 *
 * Sin `nueva` (un pedido o un vínculo sobre una mesa sin cuenta), la mesa tiene que estar libre: así dos
 * tablets que piden a la vez en una mesa vacía no abren dos cuentas. Con `nueva` (sentar a una familia,
 * B6-7) la mesa puede tener otras —una mesa compartida—, pero tienen que ser las que vio quien la abre
 * (`vistas`), la nueva lleva un nombre que la distinga y no pasan de `CUENTAS_POR_MESA`.
 */
export async function mesaParaCuentaNueva(
  tx: Transaccion,
  branchId: string,
  tableId: string,
  nueva?: CuentaNuevaEnMesa,
): Promise<Readonly<{ label: string }> | Rechazo> {
  await candadoDeMesas(tx, branchId);
  const { plano } = await planoEn(tx, branchId);
  if (!plano) {
    return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El local no tiene plano publicado: se dibuja en Ajustes → Plano del local." };
  }
  const mesa = plano.tables.find((m) => m.id === tableId);
  if (!mesa || mesa.retiredAt !== undefined) {
    return { ok: false, motivo: "INVALIDO", mensaje: "Esa mesa no está en el salón.", problemas: [{ path: ["cuenta", "tableId"], message: "MESA_FUERA_DEL_PLANO" }] };
  }
  const abiertas = (await cuentasDeLasMesas(tx, branchId)).get(tableId) ?? [];
  const otroEquipo: Rechazo = {
    ok: false,
    motivo: "CONFLICTO",
    mensaje: `La mesa ${mesa.label} cambió: otro equipo le abrió una cuenta. Vuelve a mirar la mesa.`,
    problemas: [{ path: ["cuenta", "tableId"], message: "MESA_CON_CUENTA" }],
  };
  if (!nueva) return abiertas.length > 0 ? otroEquipo : { label: mesa.label };

  if (abiertas.length !== nueva.vistas) return otroEquipo;
  if (abiertas.length >= CUENTAS_POR_MESA) {
    return {
      ok: false,
      motivo: "CONFLICTO",
      mensaje: `La mesa ${mesa.label} ya tiene ${CUENTAS_POR_MESA} cuentas abiertas.`,
      problemas: [{ path: ["tableId"], message: "MESA_LLENA" }],
    };
  }
  if (abiertas.length > 0 && !nueva.nombre) {
    return {
      ok: false,
      motivo: "INVALIDO",
      mensaje: `La mesa ${mesa.label} ya tiene una cuenta: la nueva lleva el nombre de la familia para no confundirlas.`,
      problemas: [{ path: ["nombre"], message: "NOMBRE_OBLIGATORIO" }],
    };
  }
  const nombre = nueva.nombre ?? `Mesa ${mesa.label}`;
  if (abiertas.some((c) => mismoNombre(c.nombre, nombre))) {
    return {
      ok: false,
      motivo: "CONFLICTO",
      mensaje: `En la mesa ${mesa.label} ya hay una cuenta «${nombre}»: usa otro nombre.`,
      problemas: [{ path: ["nombre"], message: "NOMBRE_REPETIDO" }],
    };
  }
  return { label: mesa.label };
}

/**
 * La cuenta de la mesa a la que va algo —un pedido, un vínculo, la salida del parque— (B6-7). Con
 * `cuentaId`, esa, que tiene que estar abierta en esa mesa. Sin ella, la única que tenga la mesa, o
 * ninguna (`abierta: null`: quien llama la abre, con `mesaParaCuentaNueva`); con dos o más, quien pide
 * tiene que decir a cuál. Se llama con el candado de las mesas tomado.
 */
export async function cuentaDeMesaPara(
  tx: Transaccion,
  branchId: string,
  tableId: string,
  cuentaId: string | undefined,
): Promise<Readonly<{ abierta: string | null }> | Rechazo> {
  const abiertas = (await cuentasDeLasMesas(tx, branchId)).get(tableId) ?? [];
  if (cuentaId !== undefined) {
    return abiertas.some((c) => c.id === cuentaId)
      ? { abierta: cuentaId }
      : {
          ok: false,
          motivo: "CONFLICTO",
          mensaje: "Esa cuenta ya no está abierta en esta mesa: vuelve a mirar la mesa.",
          problemas: [{ path: ["cuentaId"], message: "CUENTA_CERRADA" }],
        };
  }
  if (abiertas.length > 1) {
    return { ok: false, motivo: "INVALIDO", mensaje: "La mesa tiene varias cuentas: elige a cuál va.", problemas: [{ path: ["cuentaId"], message: "ELIGE_CUENTA" }] };
  }
  return { abierta: abiertas[0]?.id ?? null };
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
          const ocupadas = await cuentasDeLasMesas(tx, ctx.branchId);
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
