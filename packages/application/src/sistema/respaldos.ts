/**
 * Los respaldos — B7-4, M-26, PLAN §10.4.
 *
 * Los hace el servidor, no la aplicación: `infra/produccion/respaldar.sh` vuelca la base cada noche, la cifra
 * para la clave del local y escribe aquí cómo le fue (`backup_copy`). Aquí se lee eso para el panel (¿se hizo
 * el de anoche?, ¿salió del servidor?), administración prepara la PC del local que los baja, y se atiende a esa
 * PC: pregunta qué hay, lo baja y confirma cada uno con su huella.
 *
 * La PC no es una persona ni tiene sesión: es una tarea programada con una credencial. `entrarPc` la reconoce
 * por la huella de esa credencial y devuelve la `PcDeRespaldos` con la que se piden el índice, un archivo o el
 * acuse; sin ella no hay nada de eso.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  AcuseDeRespaldoCommandSchema,
  EstadoDeRespaldosSchema,
  PrepararPcDeRespaldosCommandSchema,
  RetirarPcDeRespaldosCommandSchema,
  problemasDe,
  type CopiaDeRespaldoDto,
  type EstadoDeRespaldosDto,
  type IndiceDeRespaldosDto,
  type NivelDeRespaldos,
  type PcDeRespaldosDto,
  type PcPreparadaDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type BackupCopy, type BackupReceiver, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";

/** Cuántos intentos enseña el panel. */
const COPIAS = 14;
const HORA = 3_600_000;
/** Un respaldo por noche: pasado este rato sin uno nuevo, el de anoche no se hizo. */
export const ATRASADO_TRAS_MS = 26 * HORA;
/** La PC del local baja el de la noche por la mañana; si en este rato no bajó ninguno reciente, se avisa. */
export const SIN_BAJAR_TRAS_MS = 36 * HORA;
/** Al primero se le da medio día para que la PC lo baje antes de avisar. */
const PRIMERO_SIN_BAJAR_TRAS_MS = 12 * HORA;

/** La PC del local reconocida por su credencial: lo único con que se piden el índice, un archivo o el acuse. */
export type PcDeRespaldos = Readonly<{ ctx: Contexto; id: string; nombre: string }>;

export interface CasosRespaldos {
  /** Ajustes → Respaldos: cómo están, para quien decide el sistema (sin confirmar la identidad: solo mira). */
  estado(ctx: Contexto, ahora?: number): Promise<Resultado<EstadoDeRespaldosDto>>;
  /** Prepara la PC del local (`PrepararPcDeRespaldosCommandSchema`), con elevación; la anterior deja de valer. */
  prepararPc(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PcPreparadaDto>>;
  /** Retira la PC del local (`RetirarPcDeRespaldosCommandSchema`), con elevación. */
  retirarPc(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstadoDeRespaldosDto>>;
  /** Reconoce a la PC por su credencial y anota que se conectó. `null` si no es la de la PC en uso. */
  entrarPc(local: Readonly<{ tenantId: string; branchId: string }>, credencial: string, ip: string | null, ahora?: number): Promise<PcDeRespaldos | null>;
  /** Los que siguen en el servidor. */
  indice(pc: PcDeRespaldos): Promise<IndiceDeRespaldosDto>;
  /** Para servir un archivo: si existe y sigue en el servidor, su tamaño y su huella. */
  copia(pc: PcDeRespaldos, archivo: string): Promise<{ archivo: string; bytes: number; sha256: string } | null>;
  /** La PC confirma que bajó uno y que su huella coincide (`AcuseDeRespaldoCommandSchema`). */
  acusar(pc: PcDeRespaldos, entrada: unknown, ahora?: number): Promise<Resultado<{ yaEstaba: boolean }>>;
}

const huellaDe = (credencial: string) => createHash("sha256").update(credencial).digest("hex");

function dto(f: BackupCopy): CopiaDeRespaldoDto {
  return {
    id: f.id,
    hechoEn: f.madeAt.toISOString(),
    estado: f.state as CopiaDeRespaldoDto["estado"],
    archivo: f.file,
    bytes: f.bytes === null ? null : Number(f.bytes),
    sha256: f.sha256,
    version: f.version,
    detalle: f.detail,
    bajadoEn: f.downloadedAt?.toISOString() ?? null,
    retiradoEn: f.removedAt?.toISOString() ?? null,
  };
}

const pcDto = (p: BackupReceiver): PcDeRespaldosDto => ({
  id: p.id,
  nombre: p.name,
  preparadaEn: p.createdAt.toISOString(),
  preparadaPor: p.createdByName,
  ultimaConexion: p.lastSeenAt?.toISOString() ?? null,
});

/**
 * Cómo están, de los intentos del más nuevo al más viejo. Va de lo peor a lo mejor: sin ninguno, el último
 * falló, el de anoche no se hizo, ninguna PC preparada o la PC no baja los recientes; si no, al día.
 */
export function clasificar(copias: readonly CopiaDeRespaldoDto[], hayPc: boolean, ahora: number): { nivel: NivelDeRespaldos; aviso: string } {
  if (copias.length === 0) return { nivel: "SIN_RESPALDOS", aviso: "Este servidor todavía no hace respaldos: hay que instalarlos en el servidor." };
  const ultimoIntento = copias[0]!;
  if (ultimoIntento.estado === "FALLIDO") return { nivel: "FALLIDO", aviso: `El último respaldo falló: ${ultimoIntento.detalle ?? "sin motivo"}` };
  const ultimo = copias.find((c) => c.estado === "HECHO")!;
  if (ahora - Date.parse(ultimo.hechoEn) > ATRASADO_TRAS_MS) return { nivel: "ATRASADO", aviso: "No se hizo el respaldo de anoche: el último tiene más de un día." };
  if (!hayPc) return { nivel: "SIN_BAJAR", aviso: "Ninguna PC del local está preparada para bajarlos: la única copia está en el servidor." };
  const bajado = copias.find((c) => c.bajadoEn !== null);
  if (!bajado) {
    if (ahora - Date.parse(ultimo.hechoEn) > PRIMERO_SIN_BAJAR_TRAS_MS) {
      return { nivel: "SIN_BAJAR", aviso: "La PC del local todavía no ha bajado ningún respaldo: la única copia está en el servidor." };
    }
  } else if (ahora - Date.parse(bajado.hechoEn) > SIN_BAJAR_TRAS_MS) {
    return { nivel: "SIN_BAJAR", aviso: "La PC del local no baja los respaldos recientes: la única copia de los últimos días está en el servidor." };
  }
  return {
    nivel: "AL_DIA",
    aviso: ultimo.bajadoEn ? "El último respaldo se hizo y ya está también en la PC del local." : "El último respaldo se hizo; la PC del local lo bajará al encenderse.",
  };
}

export function casosRespaldos(base: Base): CasosRespaldos {
  async function leer(tx: Parameters<Parameters<Base["conTenant"]>[1]>[0], ahora: number): Promise<EstadoDeRespaldosDto> {
    const filas = await tx.backupCopy.findMany({ orderBy: [{ madeAt: "desc" }, { id: "desc" }], take: 60 });
    const pc = await tx.backupReceiver.findFirst({ where: { revokedAt: null } });
    const copias = filas.map(dto);
    const { nivel, aviso } = clasificar(copias, pc !== null, ahora);
    return EstadoDeRespaldosSchema.parse({
      nivel,
      aviso,
      pc: pc ? pcDto(pc) : null,
      ultimo: copias.find((c) => c.estado === "HECHO") ?? null,
      ultimoBajado: copias.find((c) => c.bajadoEn !== null) ?? null,
      copias: copias.slice(0, COPIAS),
    });
  }

  return {
    async estado(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoDeRespaldosDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "sistema.actualizar");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        return leer(tx, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async prepararPc(ctx, entrada, ahora = Date.now()) {
      const v = PrepararPcDeRespaldosCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La PC no se preparó: falta su nombre.", problemas: problemasDe(v.error) };
      const credencial = randomBytes(32).toString("hex");
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PcPreparadaDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "sistema.actualizar");
          if (rechazo) return rechazo;
          const quien = await nombreDe(tx, ctx);
          // La anterior deja de valer en el mismo instante en que nace la nueva.
          const anterior = await tx.backupReceiver.findFirst({ where: { revokedAt: null } });
          if (anterior) await tx.backupReceiver.update({ where: { id: anterior.id }, data: { revokedAt: new Date(ahora), revokedByName: quien.nombre } });
          const pc = await tx.backupReceiver.create({
            data: { tenantId: ctx.tenantId, name: v.data.nombre, secretSha256: huellaDe(credencial), createdAt: new Date(ahora), createdByName: quien.nombre },
          });
          await auditar(tx, ctx, {
            action: "respaldo.preparar",
            entityType: "backup_receiver",
            entityId: pc.id,
            ...(anterior ? { before: { pc: anterior.name } } : {}),
            after: { pc: pc.name },
          });
          return { pc: pcDto(pc), credencial };
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "respaldo.preparar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos preparadas a la vez: la base deja una.
        if (errorDeBase(e)?.motivo === "DUPLICADO") return { ok: false, motivo: "CONFLICTO", mensaje: "Otra persona acaba de preparar una PC: vuelve a mirar." };
        throw e;
      }
    },

    async retirarPc(ctx, entrada, ahora = Date.now()) {
      const v = RetirarPcDeRespaldosCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Falta qué PC retirar.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoDeRespaldosDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "sistema.actualizar");
        if (rechazo) return rechazo;
        const quien = await nombreDe(tx, ctx);
        const hecho = await tx.backupReceiver.updateMany({ where: { id: v.data.id, revokedAt: null }, data: { revokedAt: new Date(ahora), revokedByName: quien.nombre } });
        if (hecho.count !== 1) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa PC ya no estaba en uso." };
        await auditar(tx, ctx, { action: "respaldo.retirar", entityType: "backup_receiver", entityId: v.data.id });
        return leer(tx, ahora);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async entrarPc(local, credencial, ip, ahora = Date.now()) {
      if (!/^[0-9a-f]{64}$/.test(credencial)) return null;
      return base.conTenant(local.tenantId, async (tx) => {
        const pc = await tx.backupReceiver.findFirst({ where: { secretSha256: huellaDe(credencial), revokedAt: null } });
        if (!pc) return null;
        await tx.backupReceiver.update({ where: { id: pc.id }, data: { lastSeenAt: new Date(ahora), lastSeenFrom: ip } });
        return { ctx: { tenantId: local.tenantId, branchId: local.branchId, sistema: true, ip }, id: pc.id, nombre: pc.name } as const;
      });
    },

    async indice(pc) {
      const filas = await base.conTenant(pc.ctx.tenantId, (tx) =>
        tx.backupCopy.findMany({ where: { state: "HECHO", removedAt: null }, orderBy: { madeAt: "desc" } }),
      );
      return { copias: filas.map((f) => ({ archivo: f.file!, bytes: Number(f.bytes), sha256: f.sha256!, hechoEn: f.madeAt.toISOString() })) };
    },

    async copia(pc, archivo) {
      const f = await base.conTenant(pc.ctx.tenantId, (tx) => tx.backupCopy.findFirst({ where: { file: archivo, state: "HECHO", removedAt: null } }));
      return f ? { archivo: f.file!, bytes: Number(f.bytes), sha256: f.sha256! } : null;
    },

    async acusar(pc, entrada, ahora = Date.now()) {
      const v = AcuseDeRespaldoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El acuse no trae un respaldo y su huella.", problemas: problemasDe(v.error) };
      const { archivo, sha256 } = v.data;
      const r = await base.conTenant(pc.ctx.tenantId, async (tx): Promise<{ yaEstaba: boolean } | Rechazo> => {
        const f = await tx.backupCopy.findFirst({ where: { file: archivo, state: "HECHO" } });
        if (!f) return { ok: false, motivo: "CONFLICTO", mensaje: `${archivo} no es un respaldo de este servidor.` };
        // Fail-closed: una huella que no coincide no cuenta como copia fuera del servidor.
        if (f.sha256 !== sha256) return { ok: false, motivo: "CONFLICTO", mensaje: `La huella de ${archivo} no coincide: esa copia no vale, hay que bajarla otra vez.` };
        if (f.downloadedAt) return { yaEstaba: true };
        await tx.backupCopy.update({ where: { id: f.id }, data: { downloadedAt: new Date(ahora), downloadedFrom: pc.ctx.ip ?? null, downloadedBy: pc.id } });
        await auditar(tx, pc.ctx, { action: "respaldo.bajar", entityType: "backup_copy", entityId: f.id, after: { archivo, pc: pc.nombre } });
        return { yaEstaba: false };
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
