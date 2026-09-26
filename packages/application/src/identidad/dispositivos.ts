/**
 * Los equipos del local — F2-02, ADR-013 y ADR-018.
 *
 * El dispositivo es el PRIMER factor: el PIN solo abre sesión en un equipo aprobado. Un equipo
 * nuevo pide su registro desde la pantalla de acceso (queda PENDIENTE, con su credencial en una
 * cookie) y la administración lo aprueba. Revocar cierra en el acto las sesiones abiertas en él.
 * Nada se borra: un equipo revocado se queda, porque sus sesiones y asientos lo nombran.
 */
import {
  DeviceCommandSchema,
  DeviceSchema,
  problemasDe,
  type DeviceDto,
  type DevicesDirectoryDto,
  type Resultado,
} from "@l2/contracts";
import { errorDeBase, type Base, type Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "./actor.ts";
import { coincide, componer, huella, leerCredencial, nuevoSecreto } from "./credenciales.ts";
import { SESION_INACTIVA_MS } from "./plazos.ts";

export type EstadoDispositivo =
  | Readonly<{ estado: "DESCONOCIDO" }>
  | Readonly<{
      estado: "PENDIENTE" | "APROBADO" | "REVOCADO";
      id: string;
      tenantId: string;
      branchId: string;
      label: string;
    }>;

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
  /** Aprobar, revocar o renombrar (`usuarios.gestionar`), con motivo y su asiento. */
  ordenar(ctx: Contexto, comando: unknown): Promise<Resultado<DeviceDto>>;
}

const NOMBRE_REPETIDO = "Ya hay un equipo con ese nombre. Usa uno que diga dónde está: «Tablet taquilla».";

export function casosDispositivos(base: Base): CasosDispositivos {
  async function directorio(tx: Transaccion, branchId: string, soloId?: string): Promise<DeviceDto[]> {
    const filas = await tx.device.findMany({
      where: { branchId, ...(soloId ? { id: soloId } : {}) },
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
      return { estado: d.status, id: d.id, tenantId: d.tenantId, branchId: d.branchId, label: d.label };
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
        return {
          ok: true,
          valor: {
            credencial: componer({ tenantId: d.tenantId, id: d.id, secreto }),
            dispositivo: { estado: "PENDIENTE", id: d.id, tenantId: d.tenantId, branchId: d.branchId, label: d.label },
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

    async ordenar(ctx, entrada) {
      const cmd = DeviceCommandSchema.safeParse(entrada);
      if (!cmd.success) {
        return { ok: false, motivo: "INVALIDO", mensaje: "La orden no es válida.", problemas: problemasDe(cmd.error) };
      }
      const c = cmd.data;
      const accion = c.kind === "APROBAR" ? "dispositivo.aprobar" : c.kind === "REVOCAR" ? "dispositivo.revocar" : "dispositivo.renombrar";

      try {
        const r = await base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<DeviceDto>> => {
          const rechazo = await exigirPermiso(tx, ctx, "usuarios.gestionar");
          if (rechazo) return rechazo;

          const d = await tx.device.findUnique({ where: { id: c.deviceId } });
          if (!d || d.branchId !== ctx.branchId) {
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese equipo no está en esta sucursal." };
          }
          const quien = await nombreDe(tx, ctx);
          const cambio = { tenantId: ctx.tenantId, deviceId: d.id, reason: c.reason, byUserId: ctx.quien?.userId ?? null, byName: quien.nombre };

          if (c.kind === "APROBAR") {
            if (d.status !== "PENDIENTE") {
              return { ok: false, motivo: "INVALIDO", mensaje: "Solo se aprueba un equipo pendiente. Uno revocado vuelve a pedir su registro." };
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
  };
}
