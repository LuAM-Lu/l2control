/**
 * Los equipos del local — F2-02, ADR-013 y ADR-018.
 *
 * El dispositivo es el PRIMER factor: el PIN solo abre sesión en un equipo aprobado. Un equipo
 * nuevo pide su registro desde la pantalla de acceso (queda PENDIENTE, con su credencial en una
 * cookie) y la administración lo aprueba. Revocar cierra en el acto las sesiones abiertas en él.
 * Nada se borra: un equipo revocado se queda, porque sus sesiones y asientos lo nombran.
 *
 * El alta sigue las buenas prácticas de M-7: cada equipo enseña un código de emparejamiento que
 * quien aprueba compara; una solicitud caduca a las 24 h y se renueva desde el propio equipo; y
 * hay tope de solicitudes por dirección y de pendientes por sucursal. El primer equipo de un local
 * se aprueba desde la consola del servidor o, con credenciales de administración, desde él mismo
 * (`elevacion.aprobarEquipo`).
 *
 * El punto de cobro (B3-9, M-31) es una marca del equipo: en él el turno se abre como siempre; en otro, con el PIN de
 * administración. Marcarlo y quitarlo queda en la auditoría, no en la historia del equipo: una versión anterior que
 * vuelva tras una actualización fallida no conoce ese tipo de cambio y dejaría de leer la lista (ADR-028).
 */
import {
  DeviceCommandSchema,
  DeviceSchema,
  DispositivosQuerySchema,
  PaginaDeDispositivosSchema,
  problemasDe,
  type DeviceDto,
  type DevicesDirectoryDto,
  type FiltroDispositivos,
  type PaginaDeDispositivosDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "./actor.ts";
import { codigoDeEmparejamiento, coincide, componer, huella, leerCredencial, nuevoSecreto } from "./credenciales.ts";
import { PENDIENTES_MAXIMAS, SESION_INACTIVA_MS, SOLICITUDES_POR_HORA, SOLICITUD_EQUIPO_MS } from "./plazos.ts";

export type EstadoDispositivo =
  | Readonly<{ estado: "DESCONOCIDO" }>
  | Readonly<{
      estado: "PENDIENTE" | "APROBADO" | "REVOCADO";
      id: string;
      tenantId: string;
      branchId: string;
      label: string;
      /** Código de emparejamiento: lo enseña la pantalla del equipo y lo compara quien aprueba. */
      codigo: string;
      /** Solo PENDIENTE: la solicitud pasó su plazo y hay que renovarla antes de aprobarla. */
      caducada: boolean;
    }>;

/** ¿Pasó el plazo de esta solicitud? Solo tiene sentido para un equipo PENDIENTE. */
export function solicitudCaducada(d: { status: string; requestedAt: Date }, ahora: number = Date.now()): boolean {
  return d.status === "PENDIENTE" && d.requestedAt.getTime() + SOLICITUD_EQUIPO_MS <= ahora;
}

/** Dónde se registra un equipo nuevo: el local que sirve este servidor. */
export interface Lugar {
  readonly tenantId: string;
  readonly branchId: string;
}

export interface CasosDispositivos {
  /** Qué equipo es el de esta credencial (la cookie), sin creer nada de lo que diga el cliente. */
  identificar(credencial: string | undefined | null): Promise<EstadoDispositivo>;
  /** Un equipo nuevo pide registro. Devuelve la credencial que el servidor guarda en su cookie. */
  solicitar(lugar: Lugar, label: unknown, ip: string | null): Promise<Resultado<{ credencial: string; dispositivo: EstadoDispositivo }>>;
  /** Los equipos de la sucursal, con quién tiene sesión en cada uno (`usuarios.gestionar`). */
  listar(ctx: Contexto): Promise<Resultado<DevicesDirectoryDto>>;
  /**
   * Una página de los equipos de la sucursal (T-7, `DispositivosQuerySchema`): primero los pendientes,
   * después los más nuevos; con lo que cuenta cada filtro. `usuarios.gestionar`, como `listar`.
   */
  pagina(ctx: Contexto, entrada: unknown): Promise<Resultado<PaginaDeDispositivosDto>>;
  /** Aprobar, revocar, renombrar o marcar el punto de cobro (`usuarios.gestionar`), con motivo y su asiento. */
  ordenar(ctx: Contexto, comando: unknown): Promise<Resultado<DeviceDto>>;
  /** El propio equipo renueva su solicitud caducada (M-7). Conserva su historia y sus fallos. */
  renovar(credencial: string | undefined | null, ip: string | null): Promise<Resultado<{ estado: "PENDIENTE" }>>;
}

const NOMBRE_REPETIDO = "Ya hay un equipo con ese nombre. Usa uno que diga dónde está: «Tablet taquilla».";

export function casosDispositivos(base: Base): CasosDispositivos {
  async function directorio(tx: Transaccion, branchId: string, soloId?: string | readonly string[]): Promise<DeviceDto[]> {
    const filas = await tx.device.findMany({
      where: { branchId, ...(typeof soloId === "string" ? { id: soloId } : soloId ? { id: { in: [...soloId] } } : {}) },
      orderBy: { registeredAt: "asc" },
      include: {
        changes: { orderBy: { at: "desc" } },
        // Una sesión sin actividad más allá del plazo está muerta aunque nadie la haya cerrado
        // todavía (se cierra en su próxima consulta): no se enseña como abierta.
        sessions: {
          where: { closedAt: null, lastSeenAt: { gt: new Date(Date.now() - SESION_INACTIVA_MS) } },
          include: { user: { select: { fullName: true } } },
        },
      },
    });
    return filas.map((d) => {
      const abierta = d.sessions[0];
      return DeviceSchema.parse({
        id: d.id,
        label: d.label,
        branchId: d.branchId,
        status: d.status,
        registeredAt: d.registeredAt.toISOString(),
        pairingCode: codigoDeEmparejamiento(d.id),
        puntoDeCobro: d.cashPoint,
        ...(d.status === "PENDIENTE"
          ? { requestExpiresAt: new Date(d.requestedAt.getTime() + SOLICITUD_EQUIPO_MS).toISOString() }
          : {}),
        ...(abierta
          ? { session: { userId: abierta.userId, userName: abierta.user.fullName, since: abierta.openedAt.toISOString() } }
          : {}),
        changes: d.changes.map((c) => ({
          kind: c.kind,
          ...(c.kind === "RENOMBRADO" ? { label: c.label ?? d.label } : {}),
          by: c.byUserId ?? "sistema",
          byName: c.byName,
          reason: c.reason,
          at: c.at.toISOString(),
        })),
      });
    });
  }

  return {
    async identificar(texto) {
      const cred = leerCredencial(texto);
      if (!cred) return { estado: "DESCONOCIDO" };
      const d = await base.conTenant(cred.tenantId, (tx) => tx.device.findUnique({ where: { id: cred.id } }));
      if (!d || !coincide(cred.secreto, d.secretHash)) return { estado: "DESCONOCIDO" };
      if (d.status !== "PENDIENTE" && d.status !== "APROBADO" && d.status !== "REVOCADO") return { estado: "DESCONOCIDO" };
      return {
        estado: d.status,
        id: d.id,
        tenantId: d.tenantId,
        branchId: d.branchId,
        label: d.label,
        codigo: codigoDeEmparejamiento(d.id),
        caducada: solicitudCaducada(d),
      };
    },

    async solicitar(lugar, label, ip) {
      const nombre = DeviceSchema.shape.label.safeParse(label);
      if (!nombre.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "El nombre del equipo no es válido.", problemas: problemasDe(nombre.error) };
      }
      const secreto = nuevoSecreto();
      const ctx: Contexto = { tenantId: lugar.tenantId, branchId: lugar.branchId, ip };
      try {
        const d = await base.conTenant(lugar.tenantId, async (tx) => {
          const tope = await topeDeSolicitudes(tx, lugar.branchId, ip);
          if (tope) return tope;
          const nuevo = await tx.device.create({
            data: { tenantId: lugar.tenantId, branchId: lugar.branchId, label: nombre.data, status: "PENDIENTE", secretHash: huella(secreto) },
          });
          await tx.deviceChange.create({
            data: {
              tenantId: lugar.tenantId,
              deviceId: nuevo.id,
              kind: "ALTA",
              reason: "Registro pedido desde la pantalla de acceso del propio equipo",
              byName: "El propio equipo",
            },
          });
          await auditar(tx, ctx, { action: "dispositivo.solicitar", entityType: "device", entityId: nuevo.id, after: { label: nuevo.label } });
          return nuevo;
        });
        if ("ok" in d) {
          await auditarRechazo(base, ctx, { action: "dispositivo.solicitar", reason: d.mensaje });
          return d;
        }
        return {
          ok: true,
          valor: {
            credencial: componer({ tenantId: d.tenantId, id: d.id, secreto }),
            dispositivo: {
              estado: "PENDIENTE",
              id: d.id,
              tenantId: d.tenantId,
              branchId: d.branchId,
              label: d.label,
              codigo: codigoDeEmparejamiento(d.id),
              caducada: false,
            },
          },
        };
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "INVALIDO", mensaje: NOMBRE_REPETIDO, problemas: [{ path: ["label"], message: NOMBRE_REPETIDO }] };
        }
        throw e;
      }
    },

    async listar(ctx) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        return { ok: true, valor: { devices: await directorio(tx, ctx.branchId) } };
      });
    },

    async pagina(ctx, entrada) {
      const v = DispositivosQuerySchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La consulta no es válida.", problemas: problemasDe(v.error) };
      const q = v.data;
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<PaginaDeDispositivosDto>> => {
        const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (rechazo) return rechazo;
        // Pocos cientos de equipos a lo sumo: se filtran y ordenan aquí y solo la página se lee entera.
        const filas = await tx.device.findMany({ where: { branchId: ctx.branchId }, select: { id: true, label: true, status: true, registeredAt: true } });
        const conSesion = new Set(
          (
            await tx.staffSession.findMany({
              where: { branchId: ctx.branchId, closedAt: null, lastSeenAt: { gt: new Date(Date.now() - SESION_INACTIVA_MS) } },
              select: { deviceId: true },
            })
          ).map((x) => x.deviceId),
        );
        const texto = q.busqueda?.toLowerCase() ?? "";
        const buscados = texto ? filas.filter((d) => d.label.toLowerCase().includes(texto) || codigoDeEmparejamiento(d.id).toLowerCase().includes(texto)) : filas;
        const cumple: Record<FiltroDispositivos, (d: (typeof filas)[number]) => boolean> = {
          TODOS: () => true,
          PENDIENTES: (d) => d.status === "PENDIENTE",
          APROBADOS: (d) => d.status === "APROBADO",
          REVOCADOS: (d) => d.status === "REVOCADO",
          EN_SESION: (d) => d.status === "APROBADO" && conSesion.has(d.id),
        };
        const conteos = Object.fromEntries(
          (Object.keys(cumple) as FiltroDispositivos[]).map((f) => [f, buscados.filter(cumple[f]).length]),
        ) as Record<FiltroDispositivos, number>;
        const RANGO: Record<string, number> = { PENDIENTE: 0, APROBADO: 1, REVOCADO: 2 };
        const elegidos = buscados
          .filter(cumple[q.filtro])
          .sort((a, b) => (RANGO[a.status] ?? 3) - (RANGO[b.status] ?? 3) || b.registeredAt.getTime() - a.registeredAt.getTime());
        const paginas = Math.max(1, Math.ceil(elegidos.length / q.porPagina));
        const pagina = Math.min(q.pagina, paginas);
        const ids = elegidos.slice((pagina - 1) * q.porPagina, pagina * q.porPagina).map((d) => d.id);
        const porId = new Map((await directorio(tx, ctx.branchId, ids)).map((d) => [d.id, d]));
        return {
          ok: true,
          valor: PaginaDeDispositivosSchema.parse({ dispositivos: ids.map((id) => porId.get(id)!), total: elegidos.length, pagina, conteos }),
        };
      });
    },

    async ordenar(ctx, entrada) {
      const cmd = DeviceCommandSchema.safeParse(entrada);
      if (!cmd.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La orden no es válida.", problemas: problemasDe(cmd.error) };
      }
      const c = cmd.data;
      const accion =
        c.kind === "APROBAR" ? "dispositivo.aprobar" : c.kind === "REVOCAR" ? "dispositivo.revocar" : c.kind === "RENOMBRAR" ? "dispositivo.renombrar" : "dispositivo.punto_de_cobro";

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<DeviceDto>> => {
          const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
          if (rechazo) return rechazo;

          const d = await tx.device.findUnique({ where: { id: c.deviceId } });
          if (!d || d.branchId !== ctx.branchId) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese equipo no está en esta sucursal." };
          }
          if (c.kind === "PUNTO_DE_COBRO") {
            if (c.puntoDeCobro && d.status !== "APROBADO") {
              return { ok: false, motivo: "INVALIDO", mensaje: "Solo un equipo aprobado puede ser punto de cobro." };
            }
            if (d.cashPoint === c.puntoDeCobro) {
              return { ok: false, motivo: "INVALIDO", mensaje: c.puntoDeCobro ? "Ese equipo ya es punto de cobro." : "Ese equipo no es punto de cobro." };
            }
            await tx.device.update({ where: { id: d.id }, data: { cashPoint: c.puntoDeCobro } });
            await auditar(tx, ctx, {
              action: accion,
              entityType: "device",
              entityId: d.id,
              before: { label: d.label, puntoDeCobro: d.cashPoint },
              after: { label: d.label, puntoDeCobro: c.puntoDeCobro },
              reason: c.reason,
            });
            const [marcado] = await directorio(tx, ctx.branchId, d.id);
            return { ok: true, valor: marcado! };
          }
          const quien = await nombreDe(tx, ctx);
          const cambio = { tenantId: ctx.tenantId, deviceId: d.id, reason: c.reason, byUserId: ctx.quien?.userId ?? null, byName: quien.nombre };

          if (c.kind === "APROBAR") {
            if (d.status !== "PENDIENTE") {
              return { ok: false, motivo: "INVALIDO", mensaje: "Solo se aprueba un equipo pendiente. Uno revocado vuelve a pedir su registro." };
            }
            if (solicitudCaducada(d)) {
              return { ok: false, motivo: "INVALIDO", mensaje: SOLICITUD_CADUCADA };
            }
            await tx.device.update({ where: { id: d.id }, data: { status: "APROBADO" } });
            await tx.deviceChange.create({ data: { ...cambio, kind: "APROBADO" } });
          } else if (c.kind === "REVOCAR") {
            if (d.status === "REVOCADO") return { ok: false, motivo: "INVALIDO", mensaje: "Ese equipo ya está revocado." };
            await tx.device.update({ where: { id: d.id }, data: { status: "REVOCADO" } });
            await tx.deviceChange.create({ data: { ...cambio, kind: "REVOCADO" } });
            // F2-02: revocarlo cierra sus sesiones, en el acto.
            await tx.staffSession.updateMany({
              where: { deviceId: d.id, closedAt: null },
              data: { closedAt: new Date(), closedReason: "DISPOSITIVO_REVOCADO" },
            });
          } else {
            await tx.device.update({ where: { id: d.id }, data: { label: c.label } });
            await tx.deviceChange.create({ data: { ...cambio, kind: "RENOMBRADO", label: c.label } });
          }

          await auditar(tx, ctx, {
            action: accion,
            entityType: "device",
            entityId: d.id,
            before: { status: d.status, label: d.label },
            after: c.kind === "RENOMBRAR" ? { status: d.status, label: c.label } : { status: c.kind === "APROBAR" ? "APROBADO" : "REVOCADO", label: d.label },
            reason: c.reason,
          });
          const [actualizado] = await directorio(tx, ctx.branchId, d.id);
          return { ok: true, valor: actualizado! };
        });
        if (!r.ok && r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: accion, entityType: "device", entityId: c.deviceId, reason: r.mensaje });
        return r;
      } catch (e) {
        if (errorDeBase(e)?.motivo === "DUPLICADO") {
          return { ok: false, motivo: "INVALIDO", mensaje: NOMBRE_REPETIDO, problemas: [{ path: ["label"], message: NOMBRE_REPETIDO }] };
        }
        throw e;
      }
    },

    async renovar(texto, ip) {
      const cred = leerCredencial(texto);
      const desconocido: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Este equipo no está registrado." };
      if (!cred) return desconocido;
      return base.conTenant(cred.tenantId, async (tx): Promise<Resultado<{ estado: "PENDIENTE" }>> => {
        const d = await tx.device.findUnique({ where: { id: cred.id } });
        if (!d || !coincide(cred.secreto, d.secretHash)) return desconocido;
        if (!solicitudCaducada(d)) {
          return { ok: false, motivo: "INVALIDO", mensaje: "Solo se renueva una solicitud pendiente que ya caducó." };
        }
        const tope = await topeDeSolicitudes(tx, d.branchId, ip);
        if (tope) return tope;
        const ctx: Contexto = { tenantId: d.tenantId, branchId: d.branchId, quien: { userId: null, deviceId: d.id }, ip };
        await tx.device.update({ where: { id: d.id }, data: { requestedAt: new Date() } });
        await tx.deviceChange.create({
          data: {
            tenantId: d.tenantId,
            deviceId: d.id,
            kind: "RENOVADO",
            reason: "Solicitud renovada desde el propio equipo al caducar",
            byName: "El propio equipo",
          },
        });
        // Cuenta como una solicitud más para el tope por dirección.
        await auditar(tx, ctx, { action: "dispositivo.solicitar", entityType: "device", entityId: d.id, after: { label: d.label, renovada: true } });
        return { ok: true, valor: { estado: "PENDIENTE" } };
      });
    },
  };
}

export const SOLICITUD_CADUCADA =
  "La solicitud de este equipo caducó (pasaron más de 24 horas). Renuévala desde la pantalla del propio equipo y apruébala.";

/**
 * El tope de solicitudes (M-7), o `null` si se puede pedir otra. Se cuenta sobre la auditoría y la
 * tabla, no en memoria: vale igual con uno o con varios procesos del servidor.
 */
async function topeDeSolicitudes(tx: Transaccion, branchId: string, ip: string | null): Promise<Rechazo | null> {
  const haceUnaHora = new Date(Date.now() - 60 * 60_000);
  const desdeAqui = await tx.auditEntry.count({
    where: { action: "dispositivo.solicitar", outcome: "HECHO", occurredAt: { gt: haceUnaHora }, ip },
  });
  if (desdeAqui >= SOLICITUDES_POR_HORA) {
    return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Demasiadas solicitudes de registro desde esta red. Espera una hora." };
  }
  const vigentes = await tx.device.count({
    where: { branchId, status: "PENDIENTE", requestedAt: { gt: new Date(Date.now() - SOLICITUD_EQUIPO_MS) } },
  });
  if (vigentes >= PENDIENTES_MAXIMAS) {
    return {
      ok: false,
      motivo: "NO_PERMITIDO",
      mensaje: "Hay demasiadas solicitudes de registro sin atender. Administración debe aprobarlas o revocarlas primero.",
    };
  }
  return null;
}
