/**
 * Clientes (T-25, M-40): el directorio de todos los clientes en un solo lugar, en lugar de «Representantes y niños».
 *
 * Es el mismo directorio de siempre (`guardian`, B4-1): las familias del parque y los clientes de mesa que dieron su
 * teléfono (B6-9, B6-22). Aquí se ve cada uno con lo que hizo en el local y se corrige en un solo lugar:
 *  · sus datos (nombre, cédula, teléfono), con su asiento; la cédula se anota o se corrige, no se quita;
 *  · sus niños: agregar, corregir y retirar (no se borran: sus estancias los nombran; la entrada deja de ofrecerlos);
 *  · «Juntar»: la misma persona quedó dos veces. La que se va pasa a la que queda (`guardian_merge`, de solo agregar):
 *    sus niños cambian de familia (el disparador lo deja solo así), su cédula y su VIP pasan si la que queda no los
 *    tiene, y su historia, lo que gastó y lo que debe se leen con la que queda. Buscarla por su teléfono lleva a la que
 *    queda (`quienQueda`). Con dos cédulas distintas no son la misma persona.
 *
 * Lo ven y corrigen quienes atienden al cliente (`clientes.ver`); juntar, administración y supervisión
 * (`clientes.juntar`). Cada consulta queda en la auditoría con cuántos, no cuáles (PLAN §7.6).
 */
import {
  CorregirClienteCommandSchema,
  FichaDelClienteSchema,
  JuntarClientesCommandSchema,
  NinoDelClienteCommandSchema,
  PaginaDeClientesQuerySchema,
  PaginaDeClientesSchema,
  problemasDe,
  type FichaDelClienteDto,
  type MovimientoDelClienteDto,
  type PaginaDeClientesDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { contactKey, documentKey, documentoLegible, telefonoLegible } from "@l2/domain-park";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import { marcaVip } from "../caja/reglas-de-descuento.ts";
import { diaDeNegocioDe } from "../sucursal/ajustes.ts";

export interface CasosDirectorio {
  /** Una página de Clientes (`PaginaDeClientesQuerySchema`): de la visita más reciente a la más vieja, de a 50. */
  pagina(ctx: Contexto, entrada: unknown): Promise<Resultado<PaginaDeClientesDto>>;
  /** La ficha de un cliente. Si se juntó con otro, la de con quien quedó. */
  ficha(ctx: Contexto, clienteId: string): Promise<Resultado<FichaDelClienteDto>>;
  /** Corrige sus datos (`CorregirClienteCommandSchema`). Devuelve su ficha. */
  corregir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FichaDelClienteDto>>;
  /** Agrega, corrige o retira uno de sus niños (`NinoDelClienteCommandSchema`). Devuelve su ficha. */
  nino(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FichaDelClienteDto>>;
  /** Junta a la misma persona que quedó dos veces (`JuntarClientesCommandSchema`). Devuelve la ficha de la que queda. */
  juntar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<FichaDelClienteDto>>;
}

const noEsta: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese cliente no está en el directorio." };

/**
 * Con quién quedó un representante que se juntó con otro (T-25), siguiendo la cadena; él mismo si no se juntó. Lo usa
 * toda búsqueda por su teléfono o por su ficha: el que se fue lleva al que queda.
 */
export async function quienQueda(tx: Transaccion, guardianId: string): Promise<string> {
  let actual = guardianId;
  for (let i = 0; i < 20; i++) {
    const m = await tx.guardianMerge.findFirst({ where: { absorbedId: actual }, select: { intoId: true } });
    if (!m) return actual;
    actual = m.intoId;
  }
  return actual;
}

/** Él y los que se juntaron con él (y con esos): su historia es una sola. */
async function registrosDe(tx: Transaccion, guardianId: string): Promise<string[]> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE juntos(id) AS (
      SELECT ${guardianId}::uuid
      UNION SELECT m.absorbed_id FROM guardian_merge m JOIN juntos j ON m.into_id = j.id
    )
    SELECT id FROM juntos`;
  return filas.map((f) => f.id);
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const usd = (minor: bigint | number | null | undefined) => ({ minor: String(minor ?? 0), currency: "USD" as const });

/** Las cuentas de un cliente: las del parque (sus estancias), las que tienen su nombre (el cliente vigente) y sus cumpleaños. */
async function cuentasDe(tx: Transaccion, ids: readonly string[]): Promise<string[]> {
  const filas = await tx.$queryRaw<{ account_id: string }[]>`
    SELECT DISTINCT account_id FROM park_session WHERE guardian_id = ANY(${[...ids]}::uuid[])
    UNION
    SELECT c.account_id FROM (
      SELECT DISTINCT ON (account_id) account_id, guardian_id FROM account_customer ORDER BY account_id, set_at DESC, id DESC
    ) c WHERE c.guardian_id = ANY(${[...ids]}::uuid[])
    UNION
    SELECT account_id FROM event_reservation WHERE guardian_id = ANY(${[...ids]}::uuid[])`;
  return filas.map((f) => f.account_id);
}

/** Lo que cobraron sus cuentas, cuenta por cuenta, sin lo anulado. */
async function cobradoDe(tx: Transaccion, cuentas: readonly string[]): Promise<Map<string, bigint>> {
  if (cuentas.length === 0) return new Map();
  const filas = await tx.$queryRaw<{ account_id: string; total: bigint }[]>`
    SELECT s.account_id, sum(s.total_minor)::bigint AS total FROM sale s
    WHERE s.account_id = ANY(${[...cuentas]}::uuid[]) AND NOT EXISTS (SELECT 1 FROM sale_void v WHERE v.sale_id = s.id)
    GROUP BY s.account_id`;
  return new Map(filas.map((f) => [f.account_id, f.total]));
}

/** Sus deudas sin resolver (B3-11): las suyas, o las de su cédula o su teléfono (una deuda de antes de estar en el directorio). */
async function deudasDe(tx: Transaccion, ids: readonly string[]) {
  const g = await tx.guardian.findMany({ where: { id: { in: [...ids] } }, select: { documentKey: true, contactKey: true } });
  const documentos = g.flatMap((x) => (x.documentKey ? [x.documentKey] : []));
  const telefonos = g.map((x) => x.contactKey);
  return tx.customerDebt.findMany({
    where: {
      OR: [{ guardianId: { in: [...ids] } }, ...(documentos.length ? [{ documentKey: { in: documentos } }] : []), { phoneKey: { in: telefonos } }],
    },
    include: { outcome: true },
    orderBy: { markedAt: "desc" },
  });
}

/** La ficha de un cliente vigente (no juntado con otro). */
async function fichaDe(tx: Transaccion, ctx: Contexto, id: string): Promise<FichaDelClienteDto | null> {
  const g = await tx.guardian.findUnique({ where: { id } });
  if (!g) return null;
  const ids = await registrosDe(tx, id);
  const dia = await diaDeNegocioDe(tx, ctx.branchId);
  const cuentas = await cuentasDe(tx, ids);
  const cobrado = await cobradoDe(tx, cuentas);
  const deudas = await deudasDe(tx, ids);
  // Los días que vino: al parque, al salón (una cuenta con su nombre) o a un cumpleaños, por día de negocio del local.
  const [dias] = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT d) AS n FROM (
      SELECT ((started_at AT TIME ZONE ${dia.zona}) - make_interval(mins => ${dia.finMin}::int))::date AS d FROM park_session WHERE guardian_id = ANY(${ids}::uuid[])
      UNION ALL
      SELECT ((a.opened_at AT TIME ZONE ${dia.zona}) - make_interval(mins => ${dia.finMin}::int))::date FROM account a WHERE a.id = ANY(${cuentas}::uuid[]) AND a.kind <> 'FAMILIA'
      UNION ALL
      SELECT event_date FROM event_reservation WHERE guardian_id = ANY(${ids}::uuid[])
    ) x`;
  const kids = await tx.kid.findMany({ where: { guardianId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const visitasDe = new Map(
    (
      await tx.$queryRaw<{ kid_id: string; n: bigint }[]>`
        SELECT kid_id, count(DISTINCT check_in_key) AS n FROM park_session WHERE kid_id = ANY(${kids.map((k) => k.id)}::uuid[]) GROUP BY kid_id`
    ).map((v) => [v.kid_id, Number(v.n)]),
  );

  // Lo que hizo en el local: las entradas al parque (una por llegada, con sus niños), las cuentas con su nombre, los
  // cumpleaños y las deudas. Lo más reciente primero; hasta 40.
  const historia: MovimientoDelClienteDto[] = [];
  const entradas = await tx.$queryRaw<{ en: Date; account_id: string; ninos: string[]; paquetes: string[] }[]>`
    SELECT min(ps.started_at) AS en, min(ps.account_id::text)::uuid AS account_id,
           array_agg(DISTINCT coalesce(k.name, 'Sin nombre')) AS ninos, array_agg(DISTINCT ps.package_name) AS paquetes
    FROM park_session ps LEFT JOIN kid k ON k.id = ps.kid_id
    WHERE ps.guardian_id = ANY(${ids}::uuid[])
    GROUP BY ps.check_in_key ORDER BY en DESC LIMIT 40`;
  for (const e of entradas) {
    const ninos = e.ninos.length <= 2 ? e.ninos.join(" y ") : `${e.ninos.slice(0, -1).join(", ")} y ${e.ninos.at(-1)}`;
    historia.push({ en: e.en.toISOString(), que: "PARQUE", detalle: `${ninos} · ${e.paquetes.join(", ")}`.slice(0, 120), monto: cobrado.has(e.account_id) ? usd(cobrado.get(e.account_id)) : null });
  }
  const delSalon = await tx.$queryRaw<{ id: string; kind: string; order_number: number | null; opened_at: Date; de_pie: string | null }[]>`
    SELECT a.id, a.kind, a.order_number, a.opened_at,
           (SELECT v.content->>'dePie' FROM account_version v WHERE v.account_id = a.id ORDER BY v.version DESC LIMIT 1) AS de_pie
    FROM account a WHERE a.id = ANY(${cuentas}::uuid[]) AND a.kind IN ('MESA', 'MOSTRADOR')
    ORDER BY a.opened_at DESC LIMIT 40`;
  for (const a of delSalon) {
    const que = a.kind === "MESA" ? "MESA" : a.de_pie === "true" ? "DE_PIE" : "MOSTRADOR";
    const orden = a.order_number ? `#${String(a.order_number).padStart(4, "0")}` : "Cuenta";
    historia.push({ en: a.opened_at.toISOString(), que, detalle: `${orden} · ${que === "MESA" ? "en una mesa" : que === "DE_PIE" ? "de pie" : "venta del mostrador"}`, monto: cobrado.has(a.id) ? usd(cobrado.get(a.id)) : null });
  }
  const cumples = await tx.eventReservation.findMany({ where: { guardianId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 40 });
  for (const r of cumples) {
    historia.push({
      en: r.createdAt.toISOString(),
      que: "CUMPLEANOS",
      detalle: `Cumpleaños de ${r.honoree} · ${r.guests} invitados · ${r.eventDate.toISOString().slice(0, 10).split("-").reverse().join("/")}`.slice(0, 120),
      monto: cobrado.has(r.accountId) ? usd(cobrado.get(r.accountId)) : null,
    });
  }
  for (const d of deudas) {
    const como = !d.outcome ? "sin cobrar" : d.outcome.kind === "COBRADA" ? "cobrada" : "dada por perdida";
    historia.push({ en: d.markedAt.toISOString(), que: "DEUDA", detalle: `Se fue sin pagar · ${como}`, monto: usd(d.amountMinor) });
  }
  historia.sort((a, b) => b.en.localeCompare(a.en));

  // Quizás la misma persona: otro del directorio (que no se juntó) con el mismo nombre. Con otra cédula, no: dos cédulas
  // son dos personas, aunque se llamen igual.
  const parecidos = await tx.$queryRaw<{ id: string; full_name: string; document: string | null; contact_reference: string; ultima: Date | null }[]>`
    SELECT g.id, g.full_name, g.document, g.contact_reference,
           (SELECT max(started_at) FROM park_session ps WHERE ps.guardian_id = g.id) AS ultima
    FROM guardian g
    WHERE g.id <> ALL(${ids}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM guardian_merge m WHERE m.absorbed_id = g.id)
      AND (${g.documentKey}::text IS NULL OR g.document_key IS NULL)
      AND regexp_replace(translate(lower(btrim(g.full_name)), 'áéíóúüñ', 'aeiouun'), '[[:space:]]+', ' ', 'g') = ${sinAcentos(g.fullName).replace(/ñ/g, "n").replace(/\s+/g, " ")}
    ORDER BY g.created_at DESC LIMIT 5`;
  const juntados = await tx.guardianMerge.findMany({ where: { intoId: { in: ids } }, include: { absorbed: { select: { fullName: true } } }, orderBy: { mergedAt: "desc" } });

  return FichaDelClienteSchema.parse({
    id: g.id,
    nombre: g.fullName,
    cedula: g.document,
    telefono: telefonoLegible(g.contactReference) ?? g.contactReference,
    desde: g.createdAt.toISOString(),
    visitas: Number(dias?.n ?? 0),
    gastado: usd([...cobrado.values()].reduce((s, v) => s + v, 0n)),
    debe: usd(deudas.filter((d) => !d.outcome).reduce((s, d) => s + d.amountMinor, 0n)),
    vip: await marcaVip(tx, g.id),
    ninos: kids.map((k) => ({
      id: k.id,
      nombre: k.name,
      apodo: k.nickname,
      visitas: visitasDe.get(k.id) ?? 0,
      retirado: k.retiredAt ? { en: k.retiredAt.toISOString(), por: k.retiredByName ?? "" } : null,
    })),
    historia: historia.slice(0, 40),
    parecidos: parecidos.map((p) => ({
      id: p.id,
      nombre: p.full_name,
      cedula: p.document,
      telefono: telefonoLegible(p.contact_reference) ?? p.contact_reference,
      ultimaVez: p.ultima ? p.ultima.toISOString() : null,
    })),
    juntados: juntados.map((j) => ({ nombre: j.absorbed.fullName, en: j.mergedAt.toISOString(), por: j.mergedByName })),
  });
}

export function casosDirectorio(base: Base): CasosDirectorio {
  /** Lee la ficha de un cliente vigente dentro de una escritura. */
  const fichaO = async (tx: Transaccion, ctx: Contexto, id: string): Promise<FichaDelClienteDto | Rechazo> => (await fichaDe(tx, ctx, id)) ?? noEsta;

  /** El cliente de una escritura: tiene que estar y no haberse juntado con otro. */
  async function vigente(tx: Transaccion, id: string) {
    const g = await tx.guardian.findUnique({ where: { id } });
    if (!g) return noEsta;
    const queda = await quienQueda(tx, id);
    if (queda !== id) {
      const otro = await tx.guardian.findUnique({ where: { id: queda }, select: { fullName: true } });
      return { ok: false as const, motivo: "CONFLICTO" as const, mensaje: `Ese cliente se juntó con ${otro?.fullName ?? "otro"}: corrígelo ahí.` };
    }
    return g;
  }

  return {
    async pagina(ctx, entrada) {
      const v = PaginaDeClientesQuerySchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Esa búsqueda no se puede hacer.", problemas: problemasDe(v.error) };
      const { texto, filtro, desde, cuantos } = v.data;
      const q = sinAcentos(texto);
      // Las cifras buscan en el teléfono y la cédula desde tres (menos encontraría a medio directorio).
      const cifras = texto.replace(/\D/g, "");
      const conCifras = cifras.length >= 3 ? cifras : "";
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PaginaDeClientesDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "clientes.ver");
        if (rechazo) return rechazo;
        // Cada cliente vigente (no juntado con otro) con lo que dicen los filtros, en una sola consulta: la página, cuántos
        // hay con lo buscado y cuántos hay en cada filtro. La fila llega aunque la página quede vacía.
        const filas = await tx.$queryRaw<{ id: string | null; total: bigint; todos: bigint; familias: bigint; de_mesa: bigint; con_deuda: bigint; vip: bigint }[]>`
          WITH RECURSIVE grupo(raiz, id) AS (
            SELECT g.id, g.id FROM guardian g WHERE NOT EXISTS (SELECT 1 FROM guardian_merge m WHERE m.absorbed_id = g.id)
            UNION ALL
            SELECT gr.raiz, m.absorbed_id FROM guardian_merge m JOIN grupo gr ON m.into_id = gr.id
          ),
          actividad AS (
            SELECT gr.raiz, max(x.en) AS en FROM (
              SELECT guardian_id AS gid, started_at AS en FROM park_session
              UNION ALL SELECT guardian_id, set_at FROM account_customer WHERE guardian_id IS NOT NULL
              UNION ALL SELECT guardian_id, created_at FROM event_reservation
            ) x JOIN grupo gr ON gr.id = x.gid GROUP BY gr.raiz
          ),
          vip AS (
            SELECT DISTINCT ON (guardian_id) guardian_id, discount_rule_id FROM guardian_vip ORDER BY guardian_id, marked_at DESC, id DESC
          ),
          marcas AS (
            SELECT g.id, g.full_name, g.contact_key, g.document_key, a.en,
                   (EXISTS (SELECT 1 FROM kid k WHERE k.guardian_id = g.id AND k.retired_at IS NULL)
                    OR EXISTS (SELECT 1 FROM park_session ps JOIN grupo gr ON gr.id = ps.guardian_id WHERE gr.raiz = g.id)) AS familia,
                   EXISTS (SELECT 1 FROM account_customer ac JOIN grupo gr ON gr.id = ac.guardian_id WHERE gr.raiz = g.id) AS de_mesa,
                   EXISTS (SELECT 1 FROM customer_debt d JOIN grupo gr ON gr.id = d.guardian_id WHERE gr.raiz = g.id
                           AND NOT EXISTS (SELECT 1 FROM customer_debt_outcome o WHERE o.debt_id = d.id)) AS con_deuda,
                   EXISTS (SELECT 1 FROM vip v WHERE v.guardian_id = g.id AND v.discount_rule_id IS NOT NULL) AS es_vip
            FROM guardian g LEFT JOIN actividad a ON a.raiz = g.id
            WHERE NOT EXISTS (SELECT 1 FROM guardian_merge m WHERE m.absorbed_id = g.id)
          ),
          buscados AS (
            SELECT m.* FROM marcas m
            WHERE (
                ${q} = ''
                OR position(${q} IN translate(lower(m.full_name), 'áéíóúüñ', 'aeiouun')) > 0
                OR (${conCifras} <> '' AND (position(${conCifras} IN m.contact_key) > 0 OR position(${conCifras} IN coalesce(m.document_key, '')) > 0))
                OR EXISTS (
                  SELECT 1 FROM kid k WHERE k.guardian_id = m.id AND k.retired_at IS NULL AND ${q} <> ''
                    AND (position(${q} IN translate(lower(k.name), 'áéíóúüñ', 'aeiouun')) > 0
                      OR position(${q} IN translate(lower(coalesce(k.nickname, '')), 'áéíóúüñ', 'aeiouun')) > 0)
                )
              )
              AND (
                ${filtro} = 'TODOS'
                OR (${filtro} = 'FAMILIAS' AND m.familia)
                OR (${filtro} = 'DE_MESA' AND m.de_mesa)
                OR (${filtro} = 'CON_DEUDA' AND m.con_deuda)
                OR (${filtro} = 'VIP' AND m.es_vip)
              )
          ),
          cuantos AS (
            SELECT count(*) AS todos, count(*) FILTER (WHERE familia) AS familias, count(*) FILTER (WHERE de_mesa) AS de_mesa,
                   count(*) FILTER (WHERE con_deuda) AS con_deuda, count(*) FILTER (WHERE es_vip) AS vip
            FROM marcas
          )
          SELECT p.id, (SELECT count(*) FROM buscados) AS total, c.todos, c.familias, c.de_mesa, c.con_deuda, c.vip
          FROM cuantos c
          LEFT JOIN LATERAL (
            SELECT id, en, full_name FROM buscados
            ORDER BY en DESC NULLS LAST, translate(lower(full_name), 'áéíóúü', 'aeiouu') ASC, full_name ASC
            OFFSET ${desde} LIMIT ${cuantos}
          ) p ON TRUE
          ORDER BY p.en DESC NULLS LAST, translate(lower(p.full_name), 'áéíóúü', 'aeiouu') ASC, p.full_name ASC`;
        const ids = filas.flatMap((f) => (f.id ? [f.id] : []));
        const clientes = ids.length === 0 ? [] : await clientesDe(tx, ids);
        const c = filas[0];
        // PLAN §7.6: cada consulta de contactos se audita, con cuántos, no cuáles ni qué se buscó.
        await auditar(tx, ctx, { action: "cliente.consultar", entityType: "guardian", after: { clientes: clientes.length, desde } });
        return PaginaDeClientesSchema.parse({
          clientes,
          total: Number(c?.total ?? 0),
          porFiltro: { TODOS: Number(c?.todos ?? 0), FAMILIAS: Number(c?.familias ?? 0), DE_MESA: Number(c?.de_mesa ?? 0), CON_DEUDA: Number(c?.con_deuda ?? 0), VIP: Number(c?.vip ?? 0) },
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async ficha(ctx, clienteId) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<FichaDelClienteDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "clientes.ver");
        if (rechazo) return rechazo;
        if (!(await tx.guardian.findUnique({ where: { id: clienteId }, select: { id: true } }))) return noEsta;
        const f = await fichaO(tx, ctx, await quienQueda(tx, clienteId));
        if ("ok" in f) return f;
        await auditar(tx, ctx, { action: "cliente.consultar", entityType: "guardian", entityId: f.id, after: { clientes: 1 } });
        return f;
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async corregir(ctx, entrada) {
      const v = CorregirClienteCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se corrigió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const telefono = telefonoLegible(cmd.telefono);
      const llave = contactKey(cmd.telefono);
      if (!telefono || !llave) return { ok: false, motivo: "INVALIDO", mensaje: "Ese teléfono no se entiende.", problemas: [{ path: ["telefono"], message: "NO_SE_ENTIENDE" }] };
      const cedula = cmd.cedula ? { legible: documentoLegible(cmd.cedula), llave: documentKey(cmd.cedula) } : null;
      if (cedula && (!cedula.legible || !cedula.llave)) {
        return { ok: false, motivo: "INVALIDO", mensaje: "Esa cédula no se entiende.", problemas: [{ path: ["cedula"], message: "NO_SE_ENTIENDE" }] };
      }
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<FichaDelClienteDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "clientes.ver");
          if (rechazo) return rechazo;
          const g = await vigente(tx, cmd.clienteId);
          if ("ok" in g) return g;
          if (g.documentKey !== null && !cedula) {
            return { ok: false, motivo: "INVALIDO", mensaje: "La cédula no se quita: corrígela si está mal.", problemas: [{ path: ["cedula"], message: "CEDULA_NO_SE_QUITA" }] };
          }
          // La cédula o el teléfono de otro cliente: si es la misma persona, se juntan; si no, uno está mal escrito.
          if (cedula && cedula.llave !== g.documentKey) {
            const de = await tx.guardian.findFirst({ where: { documentKey: cedula.llave!, id: { not: g.id } }, select: { fullName: true } });
            if (de) return { ok: false, motivo: "CONFLICTO", mensaje: `Esa cédula ya es de ${de.fullName}: si es la misma persona, júntalos.`, problemas: [{ path: ["cedula"], message: "CEDULA_DE_OTRO" }] };
          }
          if (llave !== g.contactKey) {
            const deId = await tx.guardian.findFirst({ where: { contactKey: llave, id: { not: g.id } }, select: { id: true, fullName: true } });
            if (deId) {
              const juntado = (await quienQueda(tx, deId.id)) === g.id;
              return {
                ok: false,
                motivo: "CONFLICTO",
                mensaje: juntado ? `Ese teléfono era de ${deId.fullName}, que ya se juntó con este cliente: ya lo encuentra.` : `Ese teléfono ya es de ${deId.fullName}: si es la misma persona, júntalos.`,
                problemas: [{ path: ["telefono"], message: "TELEFONO_DE_OTRO" }],
              };
            }
          }
          const cambio = [
            ...(g.fullName !== cmd.nombre ? ["NOMBRE"] : []),
            ...(g.contactKey !== llave ? ["TELEFONO"] : []),
            ...(cedula && cedula.llave !== g.documentKey ? ["CEDULA"] : []),
          ];
          if (cambio.length > 0) {
            await tx.guardian.update({
              where: { id: g.id },
              data: { fullName: cmd.nombre, contactReference: telefono, contactKey: llave, ...(cedula ? { document: cedula.legible!, documentKey: cedula.llave! } : {}) },
            });
            // El asiento dice qué cambió, no los datos (PLAN §7.6).
            await auditar(tx, ctx, { action: "cliente.corregir", entityType: "guardian", entityId: g.id, after: { cambio } });
          }
          return fichaO(tx, ctx, g.id);
        });
        return "ok" in r ? r : { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        return { ok: false, motivo: "CONFLICTO", mensaje: "Esa cédula o ese teléfono ya son de otro cliente del directorio." };
      }
    },

    async nino(ctx, entrada, ahora = Date.now()) {
      const v = NinoDelClienteCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se guardó: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<FichaDelClienteDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "clientes.ver");
        if (rechazo) return rechazo;
        const g = await vigente(tx, cmd.clienteId);
        if ("ok" in g) return g;
        const suyos = await tx.kid.findMany({ where: { guardianId: g.id } });
        const clave = (n: string) => sinAcentos(n).replace(/\s+/g, " ");
        if (cmd.kind === "AGREGAR") {
          const igual = suyos.find((k) => k.retiredAt === null && clave(k.name) === clave(cmd.nombre));
          if (igual) return { ok: false, motivo: "CONFLICTO", mensaje: `${g.fullName} ya tiene a ${igual.name}.`, problemas: [{ path: ["nombre"], message: "YA_ESTA" }] };
          const k = await tx.kid.create({ data: { tenantId: ctx.tenantId, guardianId: g.id, name: cmd.nombre, nickname: cmd.apodo ?? null, createdAt: new Date(ahora) }, select: { id: true } });
          await auditar(tx, ctx, { action: "nino.agregar", entityType: "kid", entityId: k.id, after: { representanteId: g.id } });
          return fichaO(tx, ctx, g.id);
        }
        const k = suyos.find((x) => x.id === cmd.ninoId);
        if (!k) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese niño no es de esta familia." };
        if (cmd.kind === "CORREGIR") {
          await tx.kid.update({ where: { id: k.id }, data: { name: cmd.nombre, nickname: cmd.apodo ?? null } });
          await auditar(tx, ctx, { action: "nino.corregir", entityType: "kid", entityId: k.id, after: { representanteId: g.id } });
          return fichaO(tx, ctx, g.id);
        }
        if (k.retiredAt) return { ok: false, motivo: "CONFLICTO", mensaje: `${k.name} ya está retirado.` };
        // En la sala no se retira: su salida lo nombra.
        if (await tx.parkSession.findFirst({ where: { kidId: k.id, status: "ACTIVA" }, select: { id: true } })) {
          return { ok: false, motivo: "CONFLICTO", mensaje: `${k.name} está en la sala ahora: retíralo cuando salga.` };
        }
        const quien = await nombreDe(tx, ctx);
        await tx.kid.update({ where: { id: k.id }, data: { retiredAt: new Date(ahora), retiredByName: quien.nombre } });
        await auditar(tx, ctx, { action: "nino.retirar", entityType: "kid", entityId: k.id, after: { representanteId: g.id } });
        return fichaO(tx, ctx, g.id);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async juntar(ctx, entrada, ahora = Date.now()) {
      const v = JuntarClientesCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se juntaron: elige a los dos.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<FichaDelClienteDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "clientes.juntar");
        if (rechazo) return rechazo;
        const queda = await vigente(tx, cmd.quedaId);
        if ("ok" in queda) return queda;
        const seVa = await vigente(tx, cmd.seVaId);
        if ("ok" in seVa) return seVa;
        if (queda.documentKey !== null && seVa.documentKey !== null && queda.documentKey !== seVa.documentKey) {
          return { ok: false, motivo: "CONFLICTO", mensaje: `Tienen cédulas distintas (${queda.document} y ${seVa.document}): no son la misma persona.` };
        }
        const quien = await nombreDe(tx, ctx);
        await tx.guardianMerge.create({
          data: { tenantId: ctx.tenantId, absorbedId: seVa.id, intoId: queda.id, mergedAt: new Date(ahora), mergedBy: ctx.quien?.userId ?? null, mergedByName: quien.nombre },
        });
        // Sus niños pasan a la que queda (el disparador lo deja solo con el registro de arriba).
        await tx.kid.updateMany({ where: { guardianId: seVa.id }, data: { guardianId: queda.id } });
        // Su cédula, si la que queda no la tiene: primero se suelta (es única).
        if (queda.documentKey === null && seVa.documentKey !== null) {
          await tx.guardian.update({ where: { id: seVa.id }, data: { document: null, documentKey: null } });
          await tx.guardian.update({ where: { id: queda.id }, data: { document: seVa.document, documentKey: seVa.documentKey } });
        }
        // Su VIP, si la que queda no lo tiene.
        const vipQueda = await marcaVip(tx, queda.id);
        const vipSeVa = await marcaVip(tx, seVa.id);
        if (!vipQueda && vipSeVa) {
          await tx.guardianVip.create({
            data: { tenantId: ctx.tenantId, guardianId: queda.id, discountRuleId: vipSeVa.reglaId, markedAt: new Date(ahora), markedBy: ctx.quien?.userId ?? null, markedByName: quien.nombre },
          });
        }
        await auditar(tx, ctx, { action: "cliente.juntar", entityType: "guardian", entityId: queda.id, after: { seVa: seVa.id } });
        return fichaO(tx, ctx, queda.id);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}

/** Los clientes de esos ids, en ese orden, para la lista. */
async function clientesDe(tx: Transaccion, ids: readonly string[]) {
  const familias = await tx.guardian.findMany({ where: { id: { in: [...ids] } } });
  const ninos = new Map(
    (await tx.kid.groupBy({ by: ["guardianId"], where: { guardianId: { in: [...ids] }, retiredAt: null }, _count: { _all: true } })).map((n) => [n.guardianId, n._count._all]),
  );
  const ultimas = await tx.$queryRaw<{ raiz: string; en: Date; donde: string }[]>`
    WITH RECURSIVE grupo(raiz, id) AS (
      SELECT g.id, g.id FROM guardian g WHERE g.id = ANY(${[...ids]}::uuid[])
      UNION ALL
      SELECT gr.raiz, m.absorbed_id FROM guardian_merge m JOIN grupo gr ON m.into_id = gr.id
    )
    SELECT DISTINCT ON (gr.raiz) gr.raiz, x.en, x.donde FROM (
      SELECT guardian_id AS gid, started_at AS en, 'PARQUE' AS donde FROM park_session
      UNION ALL
      SELECT ac.guardian_id, ac.set_at,
             CASE a.kind WHEN 'MESA' THEN 'MESA' WHEN 'EVENTO' THEN 'CUMPLEANOS'
               ELSE CASE WHEN (SELECT v.content->>'dePie' FROM account_version v WHERE v.account_id = a.id ORDER BY v.version DESC LIMIT 1) = 'true'
                         THEN 'DE_PIE' ELSE 'MOSTRADOR' END END
      FROM account_customer ac JOIN account a ON a.id = ac.account_id WHERE ac.guardian_id IS NOT NULL
      UNION ALL
      SELECT guardian_id, created_at, 'CUMPLEANOS' FROM event_reservation
    ) x JOIN grupo gr ON gr.id = x.gid
    ORDER BY gr.raiz, x.en DESC`;
  const ultimaDe = new Map(ultimas.map((u) => [u.raiz, u]));
  const deben = await tx.$queryRaw<{ raiz: string; debe: bigint }[]>`
    WITH RECURSIVE grupo(raiz, id) AS (
      SELECT g.id, g.id FROM guardian g WHERE g.id = ANY(${[...ids]}::uuid[])
      UNION ALL
      SELECT gr.raiz, m.absorbed_id FROM guardian_merge m JOIN grupo gr ON m.into_id = gr.id
    )
    SELECT gr.raiz, sum(d.amount_minor)::bigint AS debe FROM customer_debt d JOIN grupo gr ON gr.id = d.guardian_id
    WHERE NOT EXISTS (SELECT 1 FROM customer_debt_outcome o WHERE o.debt_id = d.id)
    GROUP BY gr.raiz`;
  const debeDe = new Map(deben.map((d) => [d.raiz, d.debe]));
  const vips = await tx.$queryRaw<{ guardian_id: string; name: string }[]>`
    SELECT ultima.guardian_id, r.name FROM (
      SELECT DISTINCT ON (guardian_id) guardian_id, discount_rule_id FROM guardian_vip
      WHERE guardian_id = ANY(${[...ids]}::uuid[]) ORDER BY guardian_id, marked_at DESC, id DESC
    ) ultima JOIN discount_rule r ON r.id = ultima.discount_rule_id`;
  const vipDe = new Map(vips.map((x) => [x.guardian_id, x.name]));
  const porId = new Map(familias.map((g) => [g.id, g]));
  return ids.flatMap((id) => {
    const g = porId.get(id);
    if (!g) return [];
    const u = ultimaDe.get(id);
    const debe = debeDe.get(id);
    return [
      {
        id: g.id,
        nombre: g.fullName,
        cedula: g.document,
        telefono: telefonoLegible(g.contactReference) ?? g.contactReference,
        ninos: ninos.get(g.id) ?? 0,
        ultimaVez: u ? { en: u.en.toISOString(), donde: u.donde } : null,
        debe: debe && debe > 0n ? usd(debe) : null,
        vip: vipDe.get(g.id) ?? null,
      },
    ];
  });
}
