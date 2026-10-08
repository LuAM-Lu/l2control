/**
 * Reportar un problema — T-11 (M-27, P-4, D-SOP).
 *
 * Cualquiera con sesión reporta desde su pantalla: qué pasó, la pantalla, la versión, los últimos errores y, si la deja,
 * una captura. Quién es, su rol y el equipo los pone esta capa desde la sesión, nunca la página. El reporte se queda en
 * el servidor del local (D-SOP): quien lo envió lo sigue en «Mis reportes»; administración (o quien tenga
 * `soporte.gestionar`, como la cuenta de soporte del desarrollo) lo atiende en Ajustes → Soporte. El worker avisa al
 * desarrollo por correo con el número, la versión y la pantalla: sin el texto ni la captura.
 *
 * Nada se corrige ni se borra: el estado de un reporte es el último paso de su historia, y su aviso, el último
 * intento. Los reportes del mismo error se agrupan por su huella, y quien reporta ve si ya se conocía y cómo va.
 */
import {
  CAPTURA_MAX_BYTES,
  EstadoDeReporteCommandSchema,
  ReporteEnviadoSchema,
  ReporteSchema,
  ReportarCommandSchema,
  ReportesSchema,
  problemasDe,
  type EstadoReporte,
  type ReporteDto,
  type ReporteEnviadoDto,
  type Rechazo,
  type ReportesDto,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn } from "../identidad/actor.ts";

/** Lo que el worker necesita para avisar al desarrollo: nada del texto ni de la captura. */
export type ReporteParaAvisar = Readonly<{
  id: string;
  numero: number;
  version: string;
  ruta: string;
  codigoError: string | null;
  iguales: number;
  /** Cuántas veces se intentó ya. */
  intentos: number;
}>;

export interface CasosSoporte {
  /** Reporta un problema (`ReportarCommandSchema`). Responde el reporte y, si el error ya se conocía, cómo va. */
  reportar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReporteEnviadoDto>>;
  /** Los reportes de la persona de la sesión, del más reciente al más antiguo. */
  mios(ctx: Contexto): Promise<Resultado<ReportesDto>>;
  /** Todos los reportes del local (`soporte.gestionar`), del más reciente al más antiguo. */
  bandeja(ctx: Contexto): Promise<Resultado<ReportesDto>>;
  /** La captura de un reporte: la ve quien lo envió y quien atiende el soporte. */
  captura(ctx: Contexto, reporteId: string): Promise<Resultado<{ tipo: string; bytes: Uint8Array }>>;
  /** Marca un reporte visto, en curso o resuelto en una versión (`EstadoDeReporteCommandSchema`). */
  estado(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ReporteDto>>;
  /** Los reportes que esperan su aviso por correo (o reintentarlo): para el worker. */
  porAvisar(ctx: Contexto, ahora?: number): Promise<ReporteParaAvisar[]>;
  /** Anota un intento de aviso: si salió y, si no, por qué (sin datos). */
  anotarAviso(ctx: Contexto, reporteId: string, ok: boolean, detalle: string | null, ahora?: number): Promise<void>;
}

/** Hasta cuántas veces se intenta avisar por correo un reporte. */
export const INTENTOS_DE_AVISO = 5;
/** La espera tras el primer fallo; se dobla con cada uno. */
const ESPERA_AVISO_MS = 10 * 60_000;

/**
 * La huella de un error, para agrupar los reportes del mismo problema: el código del error conocido si lo hay; si no,
 * el último error que enseñó la pantalla, sin cifras, tildes ni mayúsculas (dos errores iguales con otro importe u
 * otro número de orden son el mismo error). Sin errores, no hay huella: el reporte va solo.
 */
export function huellaDelError(codigo: string | null | undefined, errores: readonly string[]): string | null {
  if (codigo) return `codigo:${codigo}`;
  const primero = errores[0];
  if (!primero) return null;
  const texto = primero
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[0-9]+(?:[.,][0-9]+)*/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return texto === "" ? null : `texto:${texto}`;
}

/** De más a menos avanzado: el estado de un grupo es el de su reporte más avanzado. */
const AVANCE: Readonly<Record<EstadoReporte, number>> = { NUEVO: 0, VISTO: 1, EN_CURSO: 2, RESUELTO: 3 };

/** Los primeros bytes de un JPEG y de un PNG: lo que no lo sea no se guarda (fail-closed). */
function esImagen(tipo: string, bytes: Uint8Array): boolean {
  if (tipo === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (tipo === "image/png") return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return false;
}

const sinPersona: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra por el acceso para reportar un problema." };
const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese reporte no existe en este local." };

const CON_HISTORIA = {
  statuses: { orderBy: [{ at: "asc" as const }, { id: "asc" as const }] },
  notices: { orderBy: [{ at: "desc" as const }, { id: "desc" as const }], take: 1 },
};

type FilaConHistoria = NonNullable<Awaited<ReturnType<typeof leerUno>>>;
const leerUno = (tx: Transaccion, id: string) => tx.supportReport.findUnique({ where: { id }, include: CON_HISTORIA });

/** Cuántos reportes trae cada huella, para decir cuántos iguales tiene cada uno. */
async function cuentasPorHuella(tx: Transaccion, huellas: readonly (string | null)[]): Promise<Map<string, number>> {
  const distintas = [...new Set(huellas.filter((h): h is string => h !== null))];
  if (distintas.length === 0) return new Map();
  const grupos = await tx.supportReport.groupBy({ by: ["fingerprint"], where: { fingerprint: { in: distintas } }, _count: { _all: true } });
  return new Map(grupos.map((g) => [g.fingerprint!, g._count._all]));
}

function reporteDe(f: FilaConHistoria, porHuella: ReadonlyMap<string, number>): ReporteDto {
  const ultimo = f.statuses.at(-1);
  const aviso = f.notices[0];
  return ReporteSchema.parse({
    id: f.id,
    numero: f.number,
    creadoEn: f.createdAt.toISOString(),
    quien: { nombre: f.userName, rol: f.userRole },
    equipo: f.deviceLabel,
    ruta: f.route,
    version: f.appVersion,
    texto: f.text,
    codigoError: f.errorCode,
    errores: f.recentErrors as string[],
    conCaptura: f.hasCapture,
    estado: (ultimo?.status ?? "NUEVO") as EstadoReporte,
    resueltoEn: ultimo?.status === "RESUELTO" ? ultimo.resolvedVersion : null,
    historia: f.statuses.map((s) => ({ estado: s.status, en: s.at.toISOString(), por: s.byName, version: s.resolvedVersion, nota: s.note })),
    iguales: f.fingerprint ? Math.max(0, (porHuella.get(f.fingerprint) ?? 1) - 1) : 0,
    aviso: !aviso ? "PENDIENTE" : aviso.ok ? "ENVIADO" : "FALLO",
  });
}

export function casosSoporte(base: Base): CasosSoporte {
  async function listar(tx: Transaccion, where: { userId?: string }): Promise<ReportesDto> {
    const filas = await tx.supportReport.findMany({ where, include: CON_HISTORIA, orderBy: [{ createdAt: "desc" }, { number: "desc" }], take: 200 });
    const porHuella = await cuentasPorHuella(tx, filas.map((f) => f.fingerprint));
    return ReportesSchema.parse({ reportes: filas.map((f) => reporteDe(f, porHuella)) });
  }

  return {
    async reportar(ctx, entrada, ahora = Date.now()) {
      const v = ReportarCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El reporte no se envió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const userId = ctx.quien?.userId;
      if (!userId) return sinPersona;
      const cmd = v.data;

      let captura: { tipo: string; bytes: Uint8Array } | null = null;
      if (cmd.captura) {
        const bytes = new Uint8Array(Buffer.from(cmd.captura.base64, "base64"));
        if (bytes.length === 0 || bytes.length > CAPTURA_MAX_BYTES || !esImagen(cmd.captura.tipo, bytes)) {
          return { ok: false, motivo: "INVALIDO", mensaje: "La captura no es una imagen válida: envíalo sin ella.", problemas: [{ path: ["captura"], message: "Imagen no válida" }] };
        }
        captura = { tipo: cmd.captura.tipo, bytes };
      }
      const huella = huellaDelError(cmd.codigoError, cmd.errores);

      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<ReporteEnviadoDto | Rechazo> => {
          const persona = await tx.staffUser.findUnique({ where: { id: userId }, select: { fullName: true, role: true } });
          if (!persona) return sinPersona;
          const equipo = ctx.quien?.deviceId ? await tx.device.findUnique({ where: { id: ctx.quien.deviceId }, select: { label: true } }) : null;
          const max = await tx.supportReport.aggregate({ _max: { number: true } });
          const numero = (max._max.number ?? 0) + 1;
          const fila = await tx.supportReport.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              number: numero,
              createdAt: new Date(ahora),
              userId,
              userName: persona.fullName,
              userRole: persona.role,
              deviceId: ctx.quien?.deviceId ?? null,
              deviceLabel: equipo?.label ?? null,
              route: cmd.ruta,
              appVersion: cmd.version,
              text: cmd.texto,
              errorCode: cmd.codigoError ?? null,
              fingerprint: huella,
              recentErrors: cmd.errores,
              hasCapture: captura !== null,
            },
          });
          if (captura) {
            await tx.supportReportCapture.create({
              data: { tenantId: ctx.tenantId, reportId: fila.id, mime: captura.tipo, bytes: Buffer.from(captura.bytes), createdAt: new Date(ahora) },
            });
          }
          // Sin el texto: lo que la persona cuenta se lee en el reporte, con su permiso; el asiento dice qué y dónde.
          await auditar(tx, ctx, {
            action: "soporte.reportar",
            entityType: "support_report",
            entityId: fila.id,
            after: { numero, ruta: cmd.ruta, version: cmd.version, codigoError: cmd.codigoError ?? null, conCaptura: captura !== null, errores: cmd.errores.length },
          });

          // ¿Ya se conocía? Los anteriores con la misma huella, y el estado del más avanzado.
          let conocido: ReporteEnviadoDto["conocido"] = null;
          if (huella) {
            const anteriores = await tx.supportReport.findMany({
              where: { fingerprint: huella, id: { not: fila.id } },
              include: { statuses: { orderBy: [{ at: "desc" }, { id: "desc" }], take: 1 } },
            });
            if (anteriores.length > 0) {
              const estados = anteriores.map((a) => ({ estado: (a.statuses[0]?.status ?? "NUEVO") as EstadoReporte, version: a.statuses[0]?.resolvedVersion ?? null }));
              const mas = estados.reduce((x, y) => (AVANCE[y.estado] > AVANCE[x.estado] ? y : x));
              conocido = { antes: anteriores.length, estado: mas.estado, resueltoEn: mas.estado === "RESUELTO" ? mas.version : null };
            }
          }
          const leida = (await leerUno(tx, fila.id))!;
          return ReporteEnviadoSchema.parse({ reporte: reporteDe(leida, await cuentasPorHuella(tx, [huella])), conocido });
        });

      try {
        const r = await intentar().catch(async (e) => {
          // Dos reportes a la vez se llevaron el mismo número: el segundo lo intenta con el siguiente.
          if (errorDeBase(e)?.motivo === "DUPLICADO") return intentar();
          throw e;
        });
        return "ok" in r ? r : { ok: true, valor: r };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") return { ok: false, motivo: "CONFLICTO", mensaje: "Otro reporte se envió a la vez: vuelve a enviarlo." };
        throw e;
      }
    },

    async mios(ctx) {
      const userId = ctx.quien?.userId;
      if (!userId) return sinPersona;
      return { ok: true, valor: await base.conTenant(ctx.tenantId, (tx) => listar(tx, { userId })) };
    },

    async bandeja(ctx) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ReportesDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "soporte.gestionar");
        if (rechazo) return rechazo;
        return listar(tx, {});
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async captura(ctx, reporteId) {
      const userId = ctx.quien?.userId;
      if (!userId) return sinPersona;
      if (!/^[0-9a-f-]{36}$/i.test(reporteId)) return noExiste;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<{ tipo: string; bytes: Uint8Array } | Rechazo> => {
        const fila = await tx.supportReport.findUnique({ where: { id: reporteId }, select: { userId: true, capture: { select: { mime: true, bytes: true } } } });
        if (!fila) return noExiste;
        // La ve quien la envió y quien atiende el soporte; nadie más.
        if (fila.userId !== userId && (await permisoEn(tx, ctx, "soporte.gestionar")) !== "PERMITIDO") {
          return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Esa captura es de otro reporte." };
        }
        if (!fila.capture) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese reporte se envió sin captura." };
        return { tipo: fila.capture.mime, bytes: new Uint8Array(fila.capture.bytes) };
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async estado(ctx, entrada, ahora = Date.now()) {
      const v = EstadoDeReporteCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se cambió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ReporteDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "soporte.gestionar");
        if (rechazo) return rechazo;
        const actual = await leerUno(tx, cmd.reporteId);
        if (!actual) return noExiste;
        const antes = (actual.statuses.at(-1)?.status ?? "NUEVO") as EstadoReporte;
        if (antes === cmd.estado && cmd.estado !== "RESUELTO") return reporteDe(actual, await cuentasPorHuella(tx, [actual.fingerprint]));
        const quien = await nombreDe(tx, ctx);
        await tx.supportReportStatus.create({
          data: {
            tenantId: ctx.tenantId,
            reportId: actual.id,
            status: cmd.estado,
            resolvedVersion: cmd.estado === "RESUELTO" ? cmd.version : null,
            note: "nota" in cmd ? (cmd.nota ?? null) : null,
            byUserId: ctx.quien?.userId ?? null,
            byName: quien.nombre,
            at: new Date(ahora),
          },
        });
        await auditar(tx, ctx, {
          action: "soporte.estado",
          entityType: "support_report",
          entityId: actual.id,
          before: { estado: antes },
          after: { numero: actual.number, estado: cmd.estado, ...(cmd.estado === "RESUELTO" ? { version: cmd.version } : {}) },
        });
        return reporteDe((await leerUno(tx, actual.id))!, await cuentasPorHuella(tx, [actual.fingerprint]));
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "soporte.estado", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async porAvisar(ctx, ahora = Date.now()) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        const filas = await tx.supportReport.findMany({
          where: { notices: { none: { ok: true } } },
          include: { notices: { orderBy: [{ at: "desc" }, { id: "desc" }] } },
          orderBy: { number: "asc" },
          take: 50,
        });
        const porHuella = await cuentasPorHuella(tx, filas.map((f) => f.fingerprint));
        return filas
          .filter((f) => {
            const fallos = f.notices.length;
            if (fallos >= INTENTOS_DE_AVISO) return false;
            const ultimo = f.notices[0];
            return !ultimo || ahora - ultimo.at.getTime() >= ESPERA_AVISO_MS * 2 ** (fallos - 1);
          })
          .map((f) => ({
            id: f.id,
            numero: f.number,
            version: f.appVersion,
            ruta: f.route,
            codigoError: f.errorCode,
            iguales: f.fingerprint ? Math.max(0, (porHuella.get(f.fingerprint) ?? 1) - 1) : 0,
            intentos: f.notices.length,
          }));
      });
    },

    async anotarAviso(ctx, reporteId, ok, detalle, ahora = Date.now()) {
      await base.conTenant(ctx.tenantId, async (tx) => {
        await tx.supportReportNotice.create({
          data: { tenantId: ctx.tenantId, reportId: reporteId, ok, detail: detalle ? detalle.slice(0, 300) : null, at: new Date(ahora) },
        });
        await auditar(tx, ctx, {
          action: "soporte.aviso",
          entityType: "support_report",
          entityId: reporteId,
          // El intento se hizo; si salió o no, y por qué, va en el asiento.
          after: { ok, ...(detalle ? { detalle: detalle.slice(0, 300) } : {}) },
        });
      });
    },
  };
}
