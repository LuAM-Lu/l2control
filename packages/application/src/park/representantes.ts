/**
 * El directorio de familias en el servidor — B4-1, F5-01, F5-03, DEC-9, DEC-27.
 *
 * Quién trae a quién y a quién se llama si pasa algo: el nombre del representante, su contacto y los
 * niños que alguien nombró. Nada más (DEC-9). El contacto es la llave con la que la entrada reconoce
 * a una familia que vuelve, escrito como se escriba (`contactKey`).
 *
 *  · **Buscar** compara el contacto entero: quien está en la puerta no puede recorrer el directorio
 *    tecleando pedazos de números.
 *  · **Leer** el directorio entero enseña contactos: es de quien puede verlos (`parque.verContacto`).
 *  · **Corregir** cambia un nombre o un contacto con auditoría; nada se borra, porque las estancias ya
 *    pagadas nombran a la familia (regla 5).
 */
import {
  BuscarRepresentanteSchema,
  DirectorioRepresentantesSchema,
  PaginaDelDirectorioQuerySchema,
  PaginaDelDirectorioSchema,
  RepresentanteCommandSchema,
  RepresentanteEncontradoSchema,
  problemasDe,
  type CheckInCommand,
  type DirectorioRepresentantesDto,
  type PaginaDelDirectorioDto,
  type Rechazo,
  type RepresentanteEncontradoDto,
  type Resultado,
} from "@l2/contracts";
import { contactKey, documentKey, documentoLegible } from "@l2/domain-park";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { exigirPermiso } from "../identidad/actor.ts";
import { marcasVip } from "../caja/reglas-de-descuento.ts";

export interface CasosRepresentantes {
  /** La familia de ese contacto, o `null` si no ha venido nunca. */
  buscar(ctx: Contexto, entrada: unknown): Promise<Resultado<RepresentanteEncontradoDto | null>>;
  /** El directorio entero, con sus visitas contadas de las estancias. */
  directorio(ctx: Contexto): Promise<Resultado<DirectorioRepresentantesDto>>;
  /**
   * Una página del directorio (T-22, `PaginaDelDirectorioQuerySchema`): lo que coincide con lo buscado y la letra, de la
   * visita más reciente a la más vieja, de a 50; con cuántas hay y las iniciales con alguien (el índice A–Z).
   */
  pagina(ctx: Contexto, entrada: unknown): Promise<Resultado<PaginaDelDirectorioDto>>;
  /** Corrige un representante o un niño (`RepresentanteCommandSchema`). Devuelve el directorio. */
  corregir(ctx: Contexto, entrada: unknown): Promise<Resultado<DirectorioRepresentantesDto>>;
}

const noEsta: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa familia no está en el directorio." };

export function casosRepresentantes(base: Base): CasosRepresentantes {
  return {
    async buscar(ctx, entrada) {
      const v = BuscarRepresentanteSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Ese contacto no se puede buscar.", problemas: problemasDe(v.error) };
      // Por la cédula (T-19) o por el teléfono: una de las dos, completa.
      const porCedula = v.data.documento ? documentKey(v.data.documento) : null;
      const llave = v.data.contacto ? contactKey(v.data.contacto) : null;
      if (!porCedula && !llave) return { ok: true, valor: null };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<RepresentanteEncontradoDto | null | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "parque.checkIn");
        if (rechazo) return rechazo;
        const g = await tx.guardian.findFirst({
          where: porCedula ? { documentKey: porCedula } : { contactKey: llave! },
          include: { kids: { select: { id: true, name: true, nickname: true }, orderBy: { createdAt: "asc" } } },
        });
        if (!g) return null;
        return RepresentanteEncontradoSchema.parse({
          id: g.id,
          fullName: g.fullName,
          kids: g.kids.map((k) => ({ id: k.id, name: k.name, ...(k.nickname ? { nickname: k.nickname } : {}) })),
          tieneCedula: g.documentKey !== null,
        });
      });
      return r !== null && "ok" in r ? r : { ok: true, valor: r };
    },

    async directorio(ctx) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<DirectorioRepresentantesDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "parque.verContacto");
        if (rechazo) return rechazo;
        const d = await leerDirectorio(tx);
        // PLAN §7.6: ver los contactos de los representantes es un permiso propio y se audita cada consulta. El
        // asiento dice cuántos, no cuáles: los contactos no salen de la máquina.
        await auditar(tx, ctx, { action: "representante.consultar", entityType: "guardian", after: { representantes: d.representantes.length } });
        return d;
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async pagina(ctx, entrada) {
      const v = PaginaDelDirectorioQuerySchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Esa búsqueda no se puede hacer.", problemas: problemasDe(v.error) };
      const { texto, letra, desde, cuantos } = v.data;
      const q = sinAcentos(texto);
      // Las cifras buscan en el teléfono y la cédula desde tres (menos encontraría a medio directorio).
      const cifras = texto.replace(/\D/g, "");
      const conCifras = cifras.length >= 3 ? cifras : "";
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PaginaDelDirectorioDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "parque.verContacto");
        if (rechazo) return rechazo;
        const filas = await tx.$queryRaw<{ id: string; total: bigint }[]>`
          WITH ultima AS (SELECT guardian_id, max(started_at) AS ultima FROM park_session GROUP BY guardian_id),
          buscados AS (
            SELECT g.id, g.full_name, u.ultima
            FROM guardian g LEFT JOIN ultima u ON u.guardian_id = g.id
            WHERE (
                ${q} = ''
                OR position(${q} IN translate(lower(g.full_name), 'áéíóúüñ', 'aeiouun')) > 0
                OR (${conCifras} <> '' AND (position(${conCifras} IN g.contact_key) > 0 OR position(${conCifras} IN coalesce(g.document_key, '')) > 0))
                OR EXISTS (
                  SELECT 1 FROM kid k WHERE k.guardian_id = g.id AND ${q} <> ''
                    AND (position(${q} IN translate(lower(k.name), 'áéíóúüñ', 'aeiouun')) > 0
                      OR position(${q} IN translate(lower(coalesce(k.nickname, '')), 'áéíóúüñ', 'aeiouun')) > 0)
                )
              )
              AND (${letra}::text IS NULL OR (CASE WHEN upper(left(btrim(g.full_name), 1)) = 'Ñ' THEN 'Ñ' ELSE translate(upper(left(btrim(g.full_name), 1)), 'ÁÉÍÓÚÜ', 'AEIOUU') END) = ${letra})
          )
          SELECT id, count(*) OVER () AS total FROM buscados
          ORDER BY ultima DESC NULLS LAST, translate(lower(full_name), 'áéíóúü', 'aeiouu') ASC, full_name ASC
          OFFSET ${desde} LIMIT ${cuantos}`;
        const ids = filas.map((f) => f.id);
        const total = filas[0] ? Number(filas[0].total) : await contarBuscados(tx, q, conCifras, letra);
        const representantes = ids.length === 0 ? [] : await representantesDe(tx, ids);
        const letras = await tx.$queryRaw<{ letra: string }[]>`
          SELECT DISTINCT CASE WHEN upper(left(btrim(full_name), 1)) = 'Ñ' THEN 'Ñ' ELSE translate(upper(left(btrim(full_name), 1)), 'ÁÉÍÓÚÜ', 'AEIOUU') END AS letra
          FROM guardian`;
        // PLAN §7.6: cada consulta de contactos se audita, con cuántos, no cuáles ni qué se buscó.
        await auditar(tx, ctx, { action: "representante.consultar", entityType: "guardian", after: { representantes: representantes.length, desde } });
        return PaginaDelDirectorioSchema.parse({
          representantes,
          total,
          familias: await tx.guardian.count(),
          letras: letras.map((l) => l.letra).filter((l) => /^[A-ZÑ]$/.test(l)).sort(),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async corregir(ctx, entrada) {
      const v = RepresentanteCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se corrigió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<DirectorioRepresentantesDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "parque.verContacto");
          if (rechazo) return rechazo;
          const g = await tx.guardian.findUnique({ where: { id: cmd.representanteId } });
          if (!g) return noEsta;
          if (cmd.kind === "CORREGIR_REPRESENTANTE") {
            const llave = contactKey(cmd.contactReference);
            if (!llave) {
              return { ok: false, motivo: "INVALIDO", mensaje: "Ese contacto no tiene suficientes números.", problemas: [{ path: ["contactReference"], message: "CONTACTO_SIN_NUMEROS" }] };
            }
            await tx.guardian.update({ where: { id: g.id }, data: { fullName: cmd.fullName, contactReference: cmd.contactReference, contactKey: llave } });
            // El asiento dice qué cambió, no los datos: el contacto no sale de la máquina (§7.6).
            await auditar(tx, ctx, {
              action: "representante.corregir",
              entityType: "guardian",
              entityId: g.id,
              after: { nombreCambiado: g.fullName !== cmd.fullName, contactoCambiado: g.contactKey !== llave },
            });
          } else {
            const k = await tx.kid.findUnique({ where: { id: cmd.kidId } });
            if (!k || k.guardianId !== g.id) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese niño no es de esta familia." };
            await tx.kid.update({ where: { id: k.id }, data: { name: cmd.name, nickname: cmd.nickname ?? null } });
            await auditar(tx, ctx, { action: "nino.corregir", entityType: "kid", entityId: k.id, after: { representanteId: g.id } });
          }
          return leerDirectorio(tx);
        });
        return "ok" in r ? r : { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        return { ok: false, motivo: "CONFLICTO", mensaje: "Ese contacto ya es de otra familia del directorio." };
      }
    },
  };
}

/** Un nombre como lo lee una persona: sin mayúsculas, acentos ni espacios de más. */
export function claveDeNombre(n: string): string {
  return n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");
}

/**
 * El representante de una entrada (o de una reserva de cumpleaños, B10-1): uno del directorio
 * (`guardianId`) o uno nuevo. Si el «nuevo» ya estaba con ese contacto, es él: una familia no se
 * duplica por no haberla encontrado a tiempo.
 */
export async function representanteDeLaEntrada(
  tx: Transaccion,
  ctx: Contexto,
  cmd: Pick<CheckInCommand, "guardianId" | "guardian"> & Readonly<{ guardianDocument?: string | undefined }>,
  ahora: number,
  exigirCedula = false,
): Promise<{ id: string; fullName: string } | Rechazo> {
  // La cédula (T-19, M-34): manda para reconocer, y al que no la tenía se le anota.
  const cedula = cmd.guardianDocument ? { legible: documentoLegible(cmd.guardianDocument), llave: documentKey(cmd.guardianDocument) } : null;
  if (cmd.guardianDocument && (!cedula?.legible || !cedula.llave)) {
    return { ok: false, motivo: "INVALIDO", mensaje: "Esa cédula no se entiende.", problemas: [{ path: ["guardianDocument"], message: "CEDULA_NO_SE_ENTIENDE" }] };
  }
  const completar = async (g: { id: string; fullName: string; documentKey: string | null }): Promise<{ id: string; fullName: string } | Rechazo> => {
    if (g.documentKey !== null) {
      if (cedula && cedula.llave !== g.documentKey) {
        return { ok: false, motivo: "CONFLICTO", mensaje: `Esa no es la cédula de ${g.fullName}.`, problemas: [{ path: ["guardianDocument"], message: "OTRA_CEDULA" }] };
      }
      return { id: g.id, fullName: g.fullName };
    }
    if (cedula) {
      const de = await tx.guardian.findFirst({ where: { documentKey: cedula.llave! }, select: { fullName: true } });
      if (de) return { ok: false, motivo: "CONFLICTO", mensaje: `Esa cédula ya es de ${de.fullName}.`, problemas: [{ path: ["guardianDocument"], message: "CEDULA_DE_OTRO" }] };
      await tx.guardian.update({ where: { id: g.id }, data: { document: cedula.legible!, documentKey: cedula.llave! } });
      await auditar(tx, ctx, { action: "cliente.completar", entityType: "guardian", entityId: g.id, after: { cedula: "anotada" } });
      return { id: g.id, fullName: g.fullName };
    }
    if (exigirCedula) {
      return { ok: false, motivo: "INVALIDO", mensaje: "Escribe la cédula del representante.", problemas: [{ path: ["guardianDocument"], message: "FALTA_LA_CEDULA" }] };
    }
    return { id: g.id, fullName: g.fullName };
  };
  if (cmd.guardianId) {
    const g = await tx.guardian.findUnique({ where: { id: cmd.guardianId }, select: { id: true, fullName: true, documentKey: true } });
    return g ? completar(g) : { ...noEsta, problemas: [{ path: ["guardianId"], message: "REPRESENTANTE_DESCONOCIDO" }] };
  }
  if (cedula) {
    const porCedula = await tx.guardian.findFirst({ where: { documentKey: cedula.llave! }, select: { id: true, fullName: true, documentKey: true } });
    if (porCedula) return completar(porCedula);
  }
  const nuevo = cmd.guardian!;
  const llave = contactKey(nuevo.contactReference);
  if (!llave) {
    return {
      ok: false,
      motivo: "INVALIDO",
      mensaje: "El contacto del representante no tiene suficientes números.",
      problemas: [{ path: ["guardian", "contactReference"], message: "CONTACTO_SIN_NUMEROS" }],
    };
  }
  const ya = await tx.guardian.findFirst({ where: { contactKey: llave }, select: { id: true, fullName: true, documentKey: true } });
  if (ya) return completar(ya);
  if (exigirCedula && !cedula) {
    return { ok: false, motivo: "INVALIDO", mensaje: "Escribe la cédula del representante.", problemas: [{ path: ["guardianDocument"], message: "FALTA_LA_CEDULA" }] };
  }
  return tx.guardian.create({
    data: {
      tenantId: ctx.tenantId,
      fullName: nuevo.fullName,
      contactReference: nuevo.contactReference,
      contactKey: llave,
      ...(cedula ? { document: cedula.legible!, documentKey: cedula.llave! } : {}),
      createdAt: new Date(ahora),
      createdBy: ctx.quien?.userId ?? null,
    },
    select: { id: true, fullName: true },
  });
}

/** El directorio: cada familia con sus niños nombrados, sus visitas (entradas) y la última. */
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Cuántas hay con lo buscado, cuando la página pedida queda más allá del final (no trae filas que contar). */
async function contarBuscados(tx: Transaccion, q: string, cifras: string, letra: string | null): Promise<number> {
  const [c] = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM guardian g
    WHERE (
        ${q} = ''
        OR position(${q} IN translate(lower(g.full_name), 'áéíóúüñ', 'aeiouun')) > 0
        OR (${cifras} <> '' AND (position(${cifras} IN g.contact_key) > 0 OR position(${cifras} IN coalesce(g.document_key, '')) > 0))
        OR EXISTS (
          SELECT 1 FROM kid k WHERE k.guardian_id = g.id AND ${q} <> ''
            AND (position(${q} IN translate(lower(k.name), 'áéíóúüñ', 'aeiouun')) > 0
              OR position(${q} IN translate(lower(coalesce(k.nickname, '')), 'áéíóúüñ', 'aeiouun')) > 0)
        )
      )
      AND (${letra}::text IS NULL OR (CASE WHEN upper(left(btrim(g.full_name), 1)) = 'Ñ' THEN 'Ñ' ELSE translate(upper(left(btrim(g.full_name), 1)), 'ÁÉÍÓÚÜ', 'AEIOUU') END) = ${letra})`;
  return Number(c?.n ?? 0);
}

/** Las familias de esos ids, en ese orden, con sus niños, sus visitas y su marca VIP. */
async function representantesDe(tx: Transaccion, ids: readonly string[]) {
  const familias = await tx.guardian.findMany({
    where: { id: { in: [...ids] } },
    include: { kids: { select: { id: true, name: true, nickname: true }, orderBy: { createdAt: "asc" } } },
  });
  const visitas = await tx.$queryRaw<{ guardian_id: string; visitas: bigint; ultima: Date }[]>`
    SELECT guardian_id, count(DISTINCT check_in_key) AS visitas, max(started_at) AS ultima
    FROM park_session WHERE guardian_id = ANY(${[...ids]}::uuid[]) GROUP BY guardian_id`;
  const porFamilia = new Map(visitas.map((v) => [v.guardian_id, v]));
  const vip = await marcasVip(tx);
  const porId = new Map(familias.map((g) => [g.id, g]));
  return ids.flatMap((id) => {
    const g = porId.get(id);
    if (!g) return [];
    const v = porFamilia.get(g.id);
    return [
      {
        id: g.id,
        fullName: g.fullName,
        contactReference: g.contactReference,
        kids: g.kids.map((k) => ({ id: k.id, name: k.name, ...(k.nickname ? { nickname: k.nickname } : {}) })),
        visitas: v ? Number(v.visitas) : 0,
        ...(v ? { ultimaVisita: v.ultima.toISOString() } : {}),
        vip: vip.get(g.id) ?? null,
      },
    ];
  });
}

async function leerDirectorio(tx: Transaccion): Promise<DirectorioRepresentantesDto> {
  const familias = await tx.guardian.findMany({
    include: { kids: { select: { id: true, name: true, nickname: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { fullName: "asc" },
  });
  const visitas = await tx.$queryRaw<{ guardian_id: string; visitas: bigint; ultima: Date }[]>`
    SELECT guardian_id, count(DISTINCT check_in_key) AS visitas, max(started_at) AS ultima
    FROM park_session GROUP BY guardian_id`;
  const porFamilia = new Map(visitas.map((v) => [v.guardian_id, v]));
  const vip = await marcasVip(tx);
  return DirectorioRepresentantesSchema.parse({
    representantes: familias.map((g) => {
      const v = porFamilia.get(g.id);
      return {
        id: g.id,
        fullName: g.fullName,
        contactReference: g.contactReference,
        kids: g.kids.map((k) => ({ id: k.id, name: k.name, ...(k.nickname ? { nickname: k.nickname } : {}) })),
        visitas: v ? Number(v.visitas) : 0,
        ...(v ? { ultimaVisita: v.ultima.toISOString() } : {}),
        vip: vip.get(g.id) ?? null,
      };
    }),
  });
}
