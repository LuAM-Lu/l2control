/**
 * La carga de lo anotado en papel en el servidor — B3-7, V-12, ADR-027, JORNADA §4, §5 y §7.
 *
 * Si caen los dos enlaces (ADR-021, N2) se trabaja en formularios. Al volver, la cajera abre una **carga** en
 * su turno con la ventana del corte, carga lo anotado —entradas, salidas y cobros— y la termina; supervisión la
 * **revisa** contra los formularios, con su PIN, antes del Z. Quién decide qué:
 *
 *  · el dominio (`@l2/domain-cash`): la ventana (`ventanaProblem`), que la hora de cada registro caiga dentro
 *    de ella (`horaRealProblem`) y los estados de la carga;
 *  · la matriz: abrir y terminar son de quien cobra (`documento.emitir`); cada registro, de lo suyo
 *    (`parque.checkIn`, `parque.checkOut`, `documento.emitir`); revisar es `papel.revisar` (supervisión y
 *    administración), y quien cargó no revisa su propia carga;
 *  · este archivo: abrir, terminar y revisar, y la puerta de los registros. Un registro no es una operación
 *    nueva: es `parque.entrar`, `parque.salir`, `cuentas.guardar` o `cuentas.cobrar` hechas con la hora real
 *    del formulario (`ahora`), dentro de la ventana de una carga abierta. La hora real es lo único que declara
 *    una pantalla (excepción explícita a ADR-017); el servidor guarda además cuándo se cargó.
 */
import {
  AbrirCargaCommandSchema,
  CargaDePapelSchema,
  CargasDePapelSchema,
  DesdePapelSchema,
  RegistroDePapelSchema,
  RevisarCargaCommandSchema,
  TerminarCargaCommandSchema,
  problemasDe,
  type CargaDePapelDto,
  type CargasDePapelDto,
  type CheckInResult,
  type CheckoutResult,
  type CuentaYLibroDto,
  type FamilyAccountDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { estadoAlTerminar, sePuedeRevisar, ventanaProblem, type EstadoDeCarga, type ProblemaDeVentana } from "@l2/domain-cash";
import { errorDeBase, type Base, type PaperLoad, type PaperLoadItem, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { confirmarPinPropio } from "../identidad/autorizacion.ts";
import { conflictoDeClave } from "../dinero/pagos.ts";
import type { CasosParque } from "../park/parque.ts";
import type { CasosCuentas } from "./cuentas.ts";
import type { EnPapel } from "./papel-en.ts";
import { turnoSinCorteDe } from "./turnos.ts";

export interface CasosPapel {
  /**
   * Las cargas que ve quien opera: las del turno de su equipo (en cualquier estado) y, para supervisión, todas
   * las que esperan revisión en la sucursal. Con el reloj del servidor, para acotar las horas en la pantalla.
   */
  leer(ctx: Contexto, ahora?: number): Promise<Resultado<CargasDePapelDto>>;
  /** Abre una carga en el turno del equipo, con la ventana del corte (`AbrirCargaCommandSchema`). */
  abrir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CargaDePapelDto>>;
  /** La cajera termina de cargar (`TerminarCargaCommandSchema`): queda a la espera de revisión, o se descarta si está vacía. */
  terminar(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<CargaDePapelDto>>;
  /** Supervisión da por buena una carga contra el papel (`RevisarCargaCommandSchema`), con su PIN en `autorizacion`. */
  revisar(ctx: Contexto, entrada: unknown, autorizacion: unknown, ahora?: number): Promise<Resultado<CargaDePapelDto>>;
  /** Una entrada anotada en el formulario: `parque.entrar` con la hora real de `desdePapel`. */
  entrar(ctx: Contexto, entrada: unknown, desdePapel: unknown, ahora?: number): Promise<Resultado<CheckInResult>>;
  /** Una salida anotada en el formulario: `parque.salir` con la hora real de `desdePapel`. */
  salir(ctx: Contexto, entrada: unknown, desdePapel: unknown, ahora?: number): Promise<Resultado<CheckoutResult>>;
  /** Una venta de mostrador anotada en el formulario: `cuentas.guardar` con la hora real de `desdePapel`. */
  guardar(ctx: Contexto, entrada: unknown, desdePapel: unknown, ahora?: number): Promise<Resultado<FamilyAccountDto>>;
  /** Un cobro anotado en el formulario: `cuentas.cobrar` con la hora real de `desdePapel`. */
  cobrar(ctx: Contexto, entrada: unknown, desdePapel: unknown, ahora?: number): Promise<Resultado<CuentaYLibroDto>>;
}

const MENSAJE_DE_VENTANA: Record<ProblemaDeVentana, string> = {
  AL_REVES: "El corte tiene que empezar antes de terminar.",
  EN_EL_FUTURO: "El corte no puede terminar después de ahora: no se carga lo que todavía no pasó.",
  DEMASIADO_LARGA: "Un corte de más de 24 horas no se carga de una vez: parte la carga en dos.",
  ANTES_DEL_TURNO: "El corte empieza más de 24 horas antes de abrirse este turno: cárgalo en el turno que corresponde.",
};

const noExiste: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa carga desde papel no existe en esta sucursal." };
const sinTurno: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Este equipo no tiene turno abierto: sin turno no se carga. Ábrelo en Turno." };

const QUE_ESTA: Record<EstadoDeCarga, string> = {
  ABIERTA: "abierta",
  CERRADA: "terminada y a la espera de revisión",
  REVISADA: "revisada",
  DESCARTADA: "descartada",
};

type CargaConRegistros = PaperLoad & { items: PaperLoadItem[] };

/** Las cargas en la forma del contrato, con sus registros en el orden en que ocurrieron. Revalidadas al salir (fail-closed). */
async function cargasDto(tx: Transaccion, filas: readonly PaperLoad[]): Promise<CargaDePapelDto[]> {
  if (filas.length === 0) return [];
  const registros = await tx.paperLoadItem.findMany({
    where: { loadId: { in: filas.map((f) => f.id) } },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  const turnos = await tx.cashShift.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.shiftId))] } }, select: { id: true, pointLabel: true } });
  const punto = new Map(turnos.map((t) => [t.id, t.pointLabel]));
  return filas.map((f) =>
    cargaDto({ ...f, items: registros.filter((r) => r.loadId === f.id) }, punto.get(f.shiftId) ?? "Caja"),
  );
}

function cargaDto(c: CargaConRegistros, punto: string): CargaDePapelDto {
  return CargaDePapelSchema.parse({
    id: c.id,
    turnoId: c.shiftId,
    punto,
    estado: c.status,
    desde: c.windowFrom.toISOString(),
    hasta: c.windowTo.toISOString(),
    nota: c.note,
    abiertaEn: c.openedAt.toISOString(),
    abiertaPor: c.openedByName,
    terminadaEn: c.closedAt?.toISOString() ?? null,
    terminadaPor: c.closedByName,
    revisadaEn: c.reviewedAt?.toISOString() ?? null,
    revisadaPor: c.reviewedByName,
    notaDeRevision: c.reviewNote,
    registros: c.items.map((i) =>
      RegistroDePapelSchema.parse({
        ...(i.detail as object),
        id: i.id,
        tipo: i.kind,
        cuentaId: i.accountId,
        ocurrioEn: i.occurredAt.toISOString(),
        cargadoEn: i.loadedAt.toISOString(),
        cargadoPor: i.loadedByName,
      }),
    ),
  });
}

/** Una carga con su turno y sus registros, ya leída dentro de la transacción. */
async function cargaDe(tx: Transaccion, id: string): Promise<CargaDePapelDto> {
  const fila = await tx.paperLoad.findUniqueOrThrow({ where: { id } });
  return (await cargasDto(tx, [fila]))[0]!;
}

/** El turno sin corte Z del equipo de `ctx`, o `null`. */
const turnoDelEquipo = (tx: Transaccion, ctx: Contexto) => (ctx.quien?.deviceId ? turnoSinCorteDe(tx, ctx.quien.deviceId) : Promise.resolve(null));

/** Lo que pasa cuando el estado de una carga ya no es el que la operación necesita. */
const yaEsta = (estado: string): Rechazo => ({
  ok: false,
  motivo: "CONFLICTO",
  mensaje: `Esa carga ya está ${QUE_ESTA[estado as EstadoDeCarga] ?? estado.toLowerCase()}.`,
});

export function casosPapel(base: Base, parque: CasosParque, cuentas: CasosCuentas): CasosPapel {
  /**
   * La hora real y la carga de un registro, revalidadas: es lo único que declara la pantalla (ADR-027). Lo
   * demás —que la carga esté abierta, que sea de este turno, que la hora caiga en su ventana— lo comprueba
   * la operación dentro de su transacción.
   */
  function conPapel<T>(desdePapel: unknown, ahora: number, hacer: (horaReal: number, papel: EnPapel) => Promise<Resultado<T>>): Promise<Resultado<T>> {
    const d = DesdePapelSchema.safeParse(desdePapel);
    if (!d.success) {
      return Promise.resolve({
        ok: false,
        motivo: "INVALIDO",
        mensaje: "Falta la hora real que se anotó en el formulario.",
        problemas: problemasDe(d.error).map((p) => ({ ...p, path: ["desdePapel", ...p.path] })),
      });
    }
    return hacer(Date.parse(d.data.ocurrioEn), { cargaId: d.data.cargaId, cargadoEn: ahora });
  }

  return {
    async leer(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CargasDePapelDto | Rechazo> => {
        const carga = (await permisoEn(tx, ctx, "documento.emitir")) !== "DENEGADO";
        const revisa = (await permisoEn(tx, ctx, "papel.revisar")) !== "DENEGADO";
        if (!carga && !revisa) return rechazoDePermiso("DENEGADO");
        const turno = await turnoDelEquipo(tx, ctx);
        // La de este turno, en cualquier estado, y para quien revisa, todas las que esperan en la sucursal.
        const quiero = [...(turno ? [{ shiftId: turno.id }] : []), ...(revisa ? [{ status: { in: ["ABIERTA", "CERRADA"] } }] : [])];
        const filas = quiero.length
          ? await tx.paperLoad.findMany({ where: { branchId: ctx.branchId, OR: quiero }, orderBy: [{ openedAt: "desc" }, { id: "desc" }] })
          : [];
        return CargasDePapelSchema.parse({
          ahora: new Date(ahora).toISOString(),
          turnoId: turno?.id ?? null,
          turnoAbiertoEn: turno?.openedAt.toISOString() ?? null,
          cargas: await cargasDto(tx, filas),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async abrir(ctx, entrada, ahora = Date.now()) {
      const v = AbrirCargaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La carga no se abrió: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CargaDePapelDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
          if (rechazo) return rechazo;
          // Un doble clic devuelve la carga que ya se abrió con esta clave (I-11).
          const previa = await tx.paperLoad.findFirst({ where: { operationKey: cmd.idempotencyKey } });
          if (previa) return previa.branchId === ctx.branchId && previa.openedBy === ctx.quien?.userId ? cargaDe(tx, previa.id) : conflictoDeClave;

          const turno = await turnoDelEquipo(tx, ctx);
          if (!turno || !ctx.quien?.userId) return sinTurno;
          const abierta = await tx.paperLoad.findFirst({ where: { shiftId: turno.id, status: "ABIERTA" }, select: { id: true } });
          if (abierta) {
            return { ok: false, motivo: "CONFLICTO", mensaje: "Este turno ya tiene una carga abierta: termínala antes de abrir otra." };
          }
          const desde = Date.parse(cmd.desde);
          const hasta = Date.parse(cmd.hasta);
          const problema = ventanaProblem({ desde, hasta }, { ahora, turnoAbiertoEn: turno.openedAt.getTime() });
          if (problema) {
            return { ok: false, motivo: "INVALIDO", mensaje: MENSAJE_DE_VENTANA[problema], problemas: [{ path: [problema === "AL_REVES" ? "hasta" : "desde"], message: problema }] };
          }

          const quien = await nombreDe(tx, ctx);
          const fila = await tx.paperLoad.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              shiftId: turno.id,
              windowFrom: new Date(desde),
              windowTo: new Date(hasta),
              note: cmd.nota ?? null,
              status: "ABIERTA",
              operationKey: cmd.idempotencyKey,
              openedAt: new Date(ahora),
              openedBy: ctx.quien.userId,
              openedByName: quien.nombre,
              deviceId: ctx.quien.deviceId ?? null,
            },
          });
          await auditar(tx, ctx, {
            action: "papel.abrir",
            entityType: "paper_load",
            entityId: fila.id,
            ...(cmd.nota ? { reason: cmd.nota } : {}),
            after: { turno: turno.id, punto: turno.pointLabel, desde: cmd.desde, hasta: cmd.hasta },
          });
          return cargaDe(tx, fila.id);
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "papel.abrir", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos aperturas a la vez en el mismo turno: la base deja una.
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Este turno ya tiene una carga abierta: termínala antes de abrir otra." };
        }
        throw e;
      }
    },

    async terminar(ctx, entrada, ahora = Date.now()) {
      const v = TerminarCargaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La carga no se terminó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CargaDePapelDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const c = await tx.paperLoad.findUnique({ where: { id: v.data.cargaId } });
        if (!c || c.branchId !== ctx.branchId) return noExiste;
        if (c.status !== "ABIERTA") return yaEsta(c.status);
        const turno = await turnoDelEquipo(tx, ctx);
        if (!turno || turno.id !== c.shiftId || !ctx.quien?.userId) {
          return { ok: false, motivo: "CONFLICTO", mensaje: "Esa carga es de otro turno: se termina desde el equipo donde se abrió." };
        }
        const registros = await tx.paperLoadItem.count({ where: { loadId: c.id } });
        const estado = estadoAlTerminar(registros);
        const quien = await nombreDe(tx, ctx);
        await tx.paperLoad.update({
          where: { id: c.id },
          data: { status: estado, closedAt: new Date(ahora), closedBy: ctx.quien.userId, closedByName: quien.nombre },
        });
        await auditar(tx, ctx, {
          action: "papel.cerrar",
          entityType: "paper_load",
          entityId: c.id,
          after: { estado, registros },
        });
        return cargaDe(tx, c.id);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "papel.cerrar", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },

    async revisar(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = RevisarCargaCommandSchema.safeParse(entrada);
      if (!v.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La carga no se revisó: hay datos que corregir.", problemas: problemasDe(v.error) };
      }
      const cmd = v.data;
      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CargaDePapelDto | Rechazo> => {
          const rechazo = await exigirPermiso(tx, ctx, "papel.revisar");
          if (rechazo) return rechazo;
          const c = await tx.paperLoad.findUnique({ where: { id: cmd.cargaId } });
          if (!c || c.branchId !== ctx.branchId) return noExiste;
          if (!sePuedeRevisar(c.status as EstadoDeCarga)) {
            return c.status === "ABIERTA"
              ? { ok: false, motivo: "CONFLICTO", mensaje: "La cajera todavía está cargando: se revisa cuando la termine." }
              : yaEsta(c.status);
          }
          // Quien cargó no se revisa a sí misma: lo comprueba otra persona, contra el papel.
          const quien = await nombreDe(tx, ctx);
          const yo = ctx.quien?.userId ?? null;
          const cargo = yo !== null && (c.openedBy === yo || (await tx.paperLoadItem.count({ where: { loadId: c.id, loadedBy: yo } })) > 0);
          if (cargo) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Quien cargó no revisa su propia carga: la revisa otra persona de supervisión." };
          }
          // La identidad se confirma con el PIN propio, después de lo que se sabe sin él.
          const permiso = await confirmarPinPropio(tx, ctx, "papel.revisar", autorizacion, ahora);
          if (!permiso.ok) return permiso;

          const registros = await tx.paperLoadItem.count({ where: { loadId: c.id } });
          await tx.paperLoad.update({
            where: { id: c.id },
            data: {
              status: "REVISADA",
              reviewedAt: new Date(ahora),
              reviewedBy: ctx.quien!.userId!,
              reviewedByName: quien.nombre,
              reviewNote: cmd.nota ?? null,
            },
          });
          await auditar(tx, ctx, {
            action: "papel.revisar",
            entityType: "paper_load",
            entityId: c.id,
            ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
            ...(cmd.nota ? { reason: cmd.nota } : {}),
            after: { registros, cargadaPor: c.openedByName },
          });
          return cargaDe(tx, c.id);
        });
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "papel.revisar", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos revisiones a la vez: la base deja una.
        if (errorDeBase(e)?.motivo === "SOLO_AGREGAR") return { ok: false, motivo: "CONFLICTO", mensaje: "Otra persona acaba de revisar esa carga." };
        throw e;
      }
    },

    entrar: (ctx, entrada, desdePapel, ahora = Date.now()) => conPapel(desdePapel, ahora, (hora, papel) => parque.entrar(ctx, entrada, hora, papel)),
    salir: (ctx, entrada, desdePapel, ahora = Date.now()) => conPapel(desdePapel, ahora, (hora, papel) => parque.salir(ctx, entrada, hora, papel)),
    guardar: (ctx, entrada, desdePapel, ahora = Date.now()) => conPapel(desdePapel, ahora, (hora, papel) => cuentas.guardar(ctx, entrada, hora, papel)),
    cobrar: (ctx, entrada, desdePapel, ahora = Date.now()) => conPapel(desdePapel, ahora, (hora, papel) => cuentas.cobrar(ctx, entrada, hora, papel)),
  };
}
