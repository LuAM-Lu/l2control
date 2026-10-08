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
 *
 * Con control (B7-6, M-29): la PC dice al conectarse dónde guarda y la versión de su programa, y el panel lo
 * enseña (una copia en la misma PC no está fuera del local). Administración fija un respaldo con su nombre: el
 * índice se lo dice a la PC, que lo guarda aparte, y `respaldar.sh` no lo retira. Y el ensayo semanal de
 * restauración (`backup_rehearsal`, lo escribe `respaldar.sh`) llega al panel y a Inicio: íntegro, o qué falló.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  AcuseDeRespaldoCommandSchema,
  EstadoDeRespaldosSchema,
  FijarRespaldoCommandSchema,
  PrepararPcDeRespaldosCommandSchema,
  RetirarPcDeRespaldosCommandSchema,
  SoltarRespaldoCommandSchema,
  problemasDe,
  type CopiaDeRespaldoDto,
  type EnsayoDeRestauracionDto,
  type EstadoDeRespaldosDto,
  type IndiceDeRespaldosDto,
  type InformeDeLaPcDto,
  type NivelDeRespaldos,
  type PcDeRespaldosDto,
  type PcPreparadaDto,
  type Rechazo,
  type Resultado,
  type TipoDeCarpeta,
} from "@l2/contracts";
import { errorDeBase, type BackupCopy, type BackupPin, type BackupReceiver, type BackupRehearsal, type Base } from "@l2/database";
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
/** El ensayo de restauración es semanal (B7-6): pasado este rato sin ninguno, se avisa. */
export const SIN_ENSAYO_TRAS_MS = 8 * 24 * HORA;

/** La PC del local reconocida por su credencial: lo único con que se piden el índice, un archivo o el acuse. */
export type PcDeRespaldos = Readonly<{ ctx: Contexto; id: string; nombre: string }>;

export interface CasosRespaldos {
  /** Ajustes → Sistema → Respaldos: cómo están, para quien decide el sistema (sin confirmar la identidad: solo mira). */
  estado(ctx: Contexto, ahora?: number): Promise<Resultado<EstadoDeRespaldosDto>>;
  /** Prepara la PC del local (`PrepararPcDeRespaldosCommandSchema`), con elevación; la anterior deja de valer. */
  prepararPc(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<PcPreparadaDto>>;
  /** Retira la PC del local (`RetirarPcDeRespaldosCommandSchema`), con elevación. */
  retirarPc(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstadoDeRespaldosDto>>;
  /**
   * Reconoce a la PC por su credencial y anota que se conectó, con lo que diga de sí misma (B7-6: dónde guarda y
   * su programa). `null` si no es la de la PC en uso.
   */
  entrarPc(
    local: Readonly<{ tenantId: string; branchId: string }>,
    credencial: string,
    ip: string | null,
    ahora?: number,
    informe?: InformeDeLaPcDto | null,
  ): Promise<PcDeRespaldos | null>;
  /** Los que siguen en el servidor. */
  indice(pc: PcDeRespaldos): Promise<IndiceDeRespaldosDto>;
  /** Para servir un archivo: si existe y sigue en el servidor, su tamaño y su huella. */
  copia(pc: PcDeRespaldos, archivo: string): Promise<{ archivo: string; bytes: number; sha256: string } | null>;
  /** La PC confirma que bajó uno y que su huella coincide (`AcuseDeRespaldoCommandSchema`). */
  acusar(pc: PcDeRespaldos, entrada: unknown, ahora?: number): Promise<Resultado<{ yaEstaba: boolean }>>;
  /** Fija un respaldo con su nombre (`FijarRespaldoCommandSchema`, B7-6), con elevación: nada lo borra. */
  fijar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstadoDeRespaldosDto>>;
  /** Suelta un respaldo fijado (`SoltarRespaldoCommandSchema`, B7-6), con elevación: vuelve a la retención. */
  soltar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<EstadoDeRespaldosDto>>;
}

const huellaDe = (credencial: string) => createHash("sha256").update(credencial).digest("hex");

const ensayoDto = (e: BackupRehearsal): EnsayoDeRestauracionDto => ({ integro: e.intact, en: e.at.toISOString(), segundos: e.seconds, detalle: e.detail });

function dto(f: BackupCopy, pin?: BackupPin, ensayo?: BackupRehearsal): CopiaDeRespaldoDto {
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
    fijado: pin ? { nombre: pin.name, por: pin.pinnedByName, en: pin.pinnedAt.toISOString() } : null,
    ensayo: ensayo ? ensayoDto(ensayo) : null,
  };
}

const pcDto = (p: BackupReceiver): PcDeRespaldosDto => ({
  id: p.id,
  nombre: p.name,
  preparadaEn: p.createdAt.toISOString(),
  preparadaPor: p.createdByName,
  ultimaConexion: p.lastSeenAt?.toISOString() ?? null,
  carpeta: p.folder,
  tipoDeCarpeta: p.folderKind as TipoDeCarpeta | null,
  programa: p.programVersion,
});

/**
 * Cómo están, de los intentos del más nuevo al más viejo. Va de lo peor a lo mejor: sin ninguno, el último
 * falló, el de anoche no se hizo, el último ensayo de restauración no salió íntegro (B7-6), ninguna PC preparada o
 * la PC no baja los recientes, o más de una semana sin ensayar; si no, al día.
 */
export function clasificar(
  copias: readonly CopiaDeRespaldoDto[],
  hayPc: boolean,
  ahora: number,
  ensayo: Pick<EnsayoDeRestauracionDto, "integro" | "en" | "detalle"> | null = null,
): { nivel: NivelDeRespaldos; aviso: string } {
  if (copias.length === 0) return { nivel: "SIN_RESPALDOS", aviso: "Este servidor todavía no hace respaldos: hay que instalarlos en el servidor." };
  const ultimoIntento = copias[0]!;
  if (ultimoIntento.estado === "FALLIDO") return { nivel: "FALLIDO", aviso: `El último respaldo falló: ${ultimoIntento.detalle ?? "sin motivo"}` };
  const ultimo = copias.find((c) => c.estado === "HECHO")!;
  if (ahora - Date.parse(ultimo.hechoEn) > ATRASADO_TRAS_MS) return { nivel: "ATRASADO", aviso: "No se hizo el respaldo de anoche: el último tiene más de un día." };
  if (ensayo && !ensayo.integro) {
    return { nivel: "NO_INTEGRO", aviso: `El último ensayo de restauración no salió íntegro: ${ensayo.detalle ?? "sin motivo"}` };
  }
  if (!hayPc) return { nivel: "SIN_BAJAR", aviso: "Ninguna PC del local está preparada para bajarlos: la única copia está en el servidor." };
  const bajado = copias.find((c) => c.bajadoEn !== null);
  if (!bajado) {
    if (ahora - Date.parse(ultimo.hechoEn) > PRIMERO_SIN_BAJAR_TRAS_MS) {
      return { nivel: "SIN_BAJAR", aviso: "La PC del local todavía no ha bajado ningún respaldo: la única copia está en el servidor." };
    }
  } else if (ahora - Date.parse(bajado.hechoEn) > SIN_BAJAR_TRAS_MS) {
    return { nivel: "SIN_BAJAR", aviso: "La PC del local no baja los respaldos recientes: la única copia de los últimos días está en el servidor." };
  }
  // Semanal: sin ensayo en más de una semana (o ninguno, con respaldos de hace más de una), se avisa.
  const primero = copias.findLast((c) => c.estado === "HECHO")!;
  const desde = ensayo ? Date.parse(ensayo.en) : Date.parse(primero.hechoEn);
  if (ahora - desde > SIN_ENSAYO_TRAS_MS) {
    return { nivel: "SIN_ENSAYO", aviso: "Hace más de una semana que no se ensaya una restauración: el servidor la ensaya solo cada semana, revisa respaldar.sh." };
  }
  return {
    nivel: "AL_DIA",
    aviso:
      (ultimo.bajadoEn ? "El último respaldo se hizo y ya está también en la PC del local." : "El último respaldo se hizo; la PC del local lo bajará al encenderse.") +
      (ensayo ? " El último ensayo de restauración salió ÍNTEGRO." : ""),
  };
}

export function casosRespaldos(base: Base): CasosRespaldos {
  async function leer(tx: Parameters<Parameters<Base["conTenant"]>[1]>[0], ahora: number): Promise<EstadoDeRespaldosDto> {
    const filas = await tx.backupCopy.findMany({ orderBy: [{ madeAt: "desc" }, { id: "desc" }], take: 60 });
    const pc = await tx.backupReceiver.findFirst({ where: { revokedAt: null } });
    // Los fijados vigentes (también de respaldos viejos, fuera de los 60) y los ensayos de los que se enseñan.
    const pines = await tx.backupPin.findMany({ where: { releasedAt: null }, include: { copia: true } });
    const pinDe = new Map(pines.map((p) => [p.copyId, p]));
    const ids = [...new Set([...filas.map((f) => f.id), ...pines.map((p) => p.copyId)])];
    const ensayos = await tx.backupRehearsal.findMany({ where: { copyId: { in: ids } }, orderBy: { at: "desc" } });
    const ensayoDe = new Map<string, BackupRehearsal>();
    for (const e of ensayos) if (!ensayoDe.has(e.copyId)) ensayoDe.set(e.copyId, e);
    const ultimoEnsayo = await tx.backupRehearsal.findFirst({ orderBy: { at: "desc" }, include: { copia: { select: { file: true } } } });
    const copias = filas.map((f) => dto(f, pinDe.get(f.id), ensayoDe.get(f.id)));
    const ensayo = ultimoEnsayo ? { ...ensayoDto(ultimoEnsayo), archivo: ultimoEnsayo.copia.file } : null;
    const { nivel, aviso } = clasificar(copias, pc !== null, ahora, ensayo);
    return EstadoDeRespaldosSchema.parse({
      nivel,
      aviso,
      pc: pc ? pcDto(pc) : null,
      ultimo: copias.find((c) => c.estado === "HECHO") ?? null,
      ultimoBajado: copias.find((c) => c.bajadoEn !== null) ?? null,
      copias: copias.slice(0, COPIAS),
      ensayo,
      fijados: pines
        .sort((a, b) => b.copia.madeAt.getTime() - a.copia.madeAt.getTime())
        .map((p) => dto(p.copia, p, ensayoDe.get(p.copyId))),
    });
  }

  /** Lee como `estado`, pero dentro de una escritura que ya comprobó el permiso. */
  async function conPermiso(
    ctx: Contexto,
    accion: "respaldo.fijar" | "respaldo.soltar",
    ahora: number,
    escribir: (tx: Parameters<Parameters<Base["conTenant"]>[1]>[0], quien: string) => Promise<Rechazo | null>,
  ): Promise<Resultado<EstadoDeRespaldosDto>> {
    const r = await base.conTenant(ctx.tenantId, async (tx): Promise<EstadoDeRespaldosDto | Rechazo> => {
      const rechazo = await exigirPermiso(tx, ctx, "sistema.actualizar");
      if (rechazo) return rechazo;
      const quien = await nombreDe(tx, ctx);
      const fallo = await escribir(tx, quien.nombre);
      return fallo ?? leer(tx, ahora);
    });
    if ("ok" in r) {
      if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, reason: r.mensaje });
      return r;
    }
    return { ok: true, valor: r };
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

    async entrarPc(local, credencial, ip, ahora = Date.now(), informe = null) {
      if (!/^[0-9a-f]{64}$/.test(credencial)) return null;
      return base.conTenant(local.tenantId, async (tx) => {
        const pc = await tx.backupReceiver.findFirst({ where: { secretSha256: huellaDe(credencial), revokedAt: null } });
        if (!pc) return null;
        // Lo que la PC dice de sí misma (B7-6) se anota tal cual; lo que no dice, se queda como estaba.
        const dice = {
          ...(informe?.carpeta ? { folder: informe.carpeta } : {}),
          ...(informe?.tipoDeCarpeta ? { folderKind: informe.tipoDeCarpeta } : {}),
          ...(informe?.programa ? { programVersion: informe.programa } : {}),
        };
        await tx.backupReceiver.update({ where: { id: pc.id }, data: { lastSeenAt: new Date(ahora), lastSeenFrom: ip, ...dice } });
        return { ctx: { tenantId: local.tenantId, branchId: local.branchId, sistema: true, ip }, id: pc.id, nombre: pc.name } as const;
      });
    },

    async indice(pc) {
      const filas = await base.conTenant(pc.ctx.tenantId, (tx) =>
        tx.backupCopy.findMany({
          where: { state: "HECHO", removedAt: null },
          orderBy: { madeAt: "desc" },
          include: { fijados: { where: { releasedAt: null }, select: { name: true } } },
        }),
      );
      return {
        copias: filas.map((f) => ({ archivo: f.file!, bytes: Number(f.bytes), sha256: f.sha256!, hechoEn: f.madeAt.toISOString(), fijado: f.fijados[0]?.name ?? null })),
      };
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

    async fijar(ctx, entrada, ahora = Date.now()) {
      const v = FijarRespaldoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se fijó: falta su nombre.", problemas: problemasDe(v.error) };
      try {
        return await conPermiso(ctx, "respaldo.fijar", ahora, async (tx, quien) => {
          const copia = await tx.backupCopy.findFirst({ where: { id: v.data.id } });
          if (!copia || copia.state !== "HECHO") return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese respaldo no existe o no se hizo." };
          // Lo que ya no está en el servidor no se puede proteger desde aquí: la PC guarda lo suyo.
          if (copia.removedAt) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese respaldo ya no está en el servidor: no se puede fijar. Fija uno de los que siguen aquí." };
          const ya = await tx.backupPin.findFirst({ where: { copyId: copia.id, releasedAt: null } });
          if (ya) return { ok: false, motivo: "CONFLICTO", mensaje: `Ese respaldo ya está fijado como «${ya.name}».` };
          const pin = await tx.backupPin.create({
            data: { tenantId: ctx.tenantId, copyId: copia.id, name: v.data.nombre, pinnedAt: new Date(ahora), pinnedBy: ctx.quien?.userId ?? null, pinnedByName: quien },
          });
          await auditar(tx, ctx, { action: "respaldo.fijar", entityType: "backup_copy", entityId: copia.id, after: { archivo: copia.file, nombre: pin.name } });
          return null;
        });
      } catch (e) {
        // Dos a la vez fijando el mismo: la base deja uno.
        if (errorDeBase(e)?.motivo === "DUPLICADO") return { ok: false, motivo: "CONFLICTO", mensaje: "Otra persona acaba de fijarlo: vuelve a mirar." };
        throw e;
      }
    },

    async soltar(ctx, entrada, ahora = Date.now()) {
      const v = SoltarRespaldoCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Falta qué respaldo soltar.", problemas: problemasDe(v.error) };
      return conPermiso(ctx, "respaldo.soltar", ahora, async (tx, quien) => {
        const pin = await tx.backupPin.findFirst({ where: { copyId: v.data.id, releasedAt: null }, include: { copia: { select: { file: true } } } });
        if (!pin) return { ok: false, motivo: "CONFLICTO", mensaje: "Ese respaldo ya no estaba fijado." };
        await tx.backupPin.update({ where: { id: pin.id }, data: { releasedAt: new Date(Math.max(ahora, pin.pinnedAt.getTime())), releasedByName: quien } });
        await auditar(tx, ctx, { action: "respaldo.soltar", entityType: "backup_copy", entityId: pin.copyId, before: { archivo: pin.copia.file, nombre: pin.name } });
        return null;
      });
    },
  };
}
