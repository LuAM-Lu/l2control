/**
 * La elevación de una sesión — F2-04, ADR-013, ADR-018, ADR-020 y ADR-029.
 *
 * En el piso se entra con PIN sobre un equipo aprobado. Para configuración, precios, personas y
 * reportes globales (`ACCIONES_ELEVADAS`) hace falta además confirmar identidad: la contraseña
 * (Argon2id) y un segundo factor. Desde ADR-029 hay cuatro, para que nadie se quede fuera por el
 * equipo que tiene delante:
 *
 *   - **el equipo de confianza** de esa persona: en él basta la contraseña (el equipo, aprobado y con
 *     su credencial, es lo que se tiene);
 *   - **su llave de acceso** (WebAuthn), donde el equipo puede usarla;
 *   - **el código de su app de autenticación** (TOTP), que se escribe en cualquier equipo;
 *   - **uno de sus diez códigos de recuperación**.
 *
 * Al confirmar con un factor en un equipo aprobado que todavía no es de confianza, se puede marcar
 * «Confiar en este equipo». La elevación dura un rato y es de ESA sesión: cambiar de persona o salir
 * la pierde. Los fallos cuentan para el mismo bloqueo creciente que el PIN y cada intento queda en la
 * auditoría. Sin la dirección pública (`L2_URL_PUBLICA`) no hay llave que comprobar, y sin la clave de
 * cifrado, app: los otros factores siguen.
 */
import { verify } from "@node-rs/argon2";
import { DEFAULT_LOCKOUT_POLICY, can, computeLockout, describeLockout } from "@l2/domain-identity";
import type { Rechazo, Resultado } from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import type { Bloqueo, CasosSesiones } from "./sesiones.ts";
import { cargarActor } from "./actor.ts";
import type { Cifrador } from "./cifrado.ts";
import { codigoDeEmparejamiento, coincide, leerCredencial } from "./credenciales.ts";
import { SOLICITUD_CADUCADA, solicitudCaducada } from "./dispositivos.ts";
import { desafioDeFirma, leerSegundoFactor, reconocerFactor, type Desafio, type OpcionesDeFirma, type OrigenWeb } from "./llaves.ts";

/** Lo que dura una elevación. Corto: es para hacer el cambio, no para quedarse. */
export const ELEVACION_MS = 15 * 60_000;

/** Con qué se confirmó: sale en el asiento, y un código de recuperación usado se dice aparte. */
const CON = { LLAVE: "llave de acceso", APP: "app de autenticación", CODIGO: "código de recuperación", EQUIPO: "equipo de confianza" } as const;

/** Cómo puede confirmar identidad quien tiene ESTA sesión, para que la pantalla ofrezca lo que vale. */
export interface OpcionesDeConfirmacion {
  /** Este equipo es de confianza para esta persona: basta la contraseña. */
  readonly deConfianza: boolean;
  /** Este equipo está aprobado y no es todavía de confianza: se puede marcar al confirmar. */
  readonly puedeConfiar: boolean;
  readonly llaves: boolean;
  readonly app: boolean;
  readonly codigos: number;
}

export interface CasosElevacion {
  /** Qué factores tiene quien tiene esta sesión, y si este equipo es de su confianza. */
  opciones(p: { sesion: string | undefined | null; ahora: number }): Promise<Resultado<OpcionesDeConfirmacion>>;
  /** El desafío para firmar con una llave de quien tiene ESTA sesión abierta. */
  desafio(p: { sesion: string | undefined | null; ahora: number }): Promise<Resultado<Desafio<OpcionesDeFirma>>>;
  /**
   * Eleva la sesión con la contraseña y un segundo factor: `{ tipo: "LLAVE", desafioId, respuesta }`,
   * `{ tipo: "APP", codigo }` o `{ tipo: "CODIGO", codigo }`. Sin factor (`null`), solo vale en un
   * equipo de confianza. Con `confiar`, y si se confirmó con un factor, este equipo pasa a serlo.
   */
  elevar(p: {
    sesion: string | undefined | null;
    contrasena: unknown;
    factor: unknown;
    confiar?: boolean;
    ip: string | null;
    ahora: number;
  }): Promise<Resultado<{ elevadaHasta: string; deConfianza: boolean }> & Readonly<{ bloqueo?: Bloqueo }>>;
  /**
   * El desafío para aprobar el equipo de la credencial desde él mismo. No dice de quién son las
   * llaves que valen: la que responda identifica a su dueña.
   */
  desafioDeEquipo(p: { dispositivo: string | undefined | null; ahora: number }): Promise<Resultado<Desafio<OpcionesDeFirma>>>;
  /**
   * Aprueba el equipo de la credencial desde él mismo, con la contraseña y la llave, el código de la
   * app o un código de recuperación de alguien que puede gestionar personas en su sucursal (M-7).
   * Resuelve el «perdí el único PC aprobado» sin pasar por la consola. Quien teclea no dice quién
   * es: su factor lo identifica, y un equipo sin aprobar nunca enseña nombres.
   */
  aprobarEquipo(p: {
    dispositivo: string | undefined | null;
    contrasena: unknown;
    factor: unknown;
    ip: string | null;
    ahora: number;
  }): Promise<Resultado<{ label: string; aprobadoPor: string }> & Readonly<{ bloqueo?: Bloqueo }>>;
}

/** ¿Es este equipo de confianza para esta persona? Solo mientras el equipo siga aprobado. */
export async function esDeConfianza(tx: Transaccion, userId: string, deviceId: string | null | undefined): Promise<boolean> {
  if (!deviceId) return false;
  const fila = await tx.trustedDevice.findFirst({ where: { userId, deviceId, revokedAt: null, device: { status: "APROBADO" } }, select: { id: true } });
  return fila !== null;
}

/** Marca un equipo aprobado como de confianza de una persona (si no lo era ya) y lo deja en la auditoría. */
export async function confiarEnEquipo(tx: Transaccion, ctx: Contexto, p: { userId: string; deviceId: string; motivo: string; ahora: number }): Promise<boolean> {
  const d = await tx.device.findUnique({ where: { id: p.deviceId }, select: { status: true, label: true } });
  if (d?.status !== "APROBADO" || (await esDeConfianza(tx, p.userId, p.deviceId))) return false;
  const fila = await tx.trustedDevice.create({ data: { tenantId: ctx.tenantId, userId: p.userId, deviceId: p.deviceId, reason: p.motivo, createdAt: new Date(p.ahora) } });
  await auditar(tx, ctx, { action: "usuario.confianza", entityType: "staff_user", entityId: p.userId, after: { confianza: fila.id, equipo: d.label }, reason: p.motivo });
  return true;
}

export function casosElevacion(base: Base, sesiones: CasosSesiones, web: OrigenWeb | null, cifrador: Cifrador | null = null): CasosElevacion {
  const sinLlaves: Rechazo = {
    ok: false,
    motivo: "NO_DISPONIBLE",
    mensaje: "La confirmación con llave de acceso no está configurada en este servidor (falta L2_URL_PUBLICA).",
  };
  const incompleto: Rechazo = {
    ok: false,
    motivo: "INVALIDO",
    mensaje: "Escribe tu contraseña y usa tu llave, el código de tu app o un código de recuperación.",
  };
  const sesionTerminada: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
  const aBloqueo = (l: ReturnType<typeof computeLockout>): Bloqueo => ({
    bloqueado: l.locked,
    hasta: l.lockedUntil === null ? null : new Date(l.lockedUntil).toISOString(),
    intentosRestantes: l.attemptsRemaining,
    texto: describeLockout(l),
  });
  const malMensaje = (tipo: keyof typeof CON) =>
    tipo === "LLAVE" ? "Contraseña o llave incorrectas." : tipo === "EQUIPO" ? "Contraseña incorrecta." : "Contraseña o código incorrectos.";

  return {
    async opciones({ sesion: credencial, ahora }) {
      const s = await sesiones.consultar(credencial, ahora);
      if (!s) return sesionTerminada;
      return base.conTenant(s.tenantId, async (tx) => {
        const deConfianza = await esDeConfianza(tx, s.userId, s.deviceId);
        const equipo = await tx.device.findUnique({ where: { id: s.deviceId }, select: { status: true } });
        const llaves = web ? await tx.passkey.count({ where: { userId: s.userId, retiredAt: null } }) : 0;
        const app = cifrador ? await tx.totpCredential.count({ where: { userId: s.userId, confirmedAt: { not: null }, retiredAt: null } }) : 0;
        const codigos = await tx.recoveryCode.count({ where: { userId: s.userId, usedAt: null, retiredAt: null } });
        return {
          ok: true as const,
          valor: { deConfianza, puedeConfiar: !deConfianza && equipo?.status === "APROBADO", llaves: llaves > 0, app: app > 0, codigos },
        };
      });
    },

    async desafio({ sesion: credencial, ahora }) {
      if (!web) return sinLlaves;
      const s = await sesiones.consultar(credencial, ahora);
      if (!s) return sesionTerminada;
      return base.conTenant(s.tenantId, async (tx) => {
        const llaves = await tx.passkey.count({ where: { userId: s.userId, retiredAt: null } });
        if (llaves === 0) {
          return {
            ok: false as const,
            motivo: "NO_DISPONIBLE" as const,
            mensaje: "No tienes ninguna llave de acceso. Usa el código de tu app o un código de recuperación.",
          };
        }
        return { ok: true as const, valor: await desafioDeFirma(tx, web, { tenantId: s.tenantId, proposito: "ELEVAR", userId: s.userId, ahora }) };
      });
    },

    async elevar({ sesion: credencial, contrasena, factor: crudo, confiar = false, ip, ahora }) {
      const s = await sesiones.consultar(credencial, ahora);
      if (!s) return sesionTerminada;
      const factor = crudo === null || crudo === undefined ? null : leerSegundoFactor(crudo);
      if (typeof contrasena !== "string" || contrasena.length === 0 || (crudo !== null && crudo !== undefined && !factor)) return incompleto;
      const ctx: Contexto = { tenantId: s.tenantId, branchId: s.branchId, quien: { userId: s.userId, deviceId: s.deviceId }, ip };

      return base.conTenant(s.tenantId, async (tx) => {
        const u = await tx.staffUser.findUnique({ where: { id: s.userId } });
        if (!u?.passwordHash) {
          return {
            ok: false as const,
            motivo: "NO_DISPONIBLE" as const,
            mensaje: "No tienes contraseña. Pide un enlace de alta a administración.",
          };
        }

        const deConfianza = await esDeConfianza(tx, u.id, s.deviceId);
        // Sin factor y fuera de su equipo de confianza no hay nada que comprobar: no cuenta como fallo.
        if (!factor && !deConfianza) {
          return {
            ok: false as const,
            motivo: "INVALIDO" as const,
            mensaje: "Este equipo no es de tu confianza: usa el código de tu app, tu llave o un código de recuperación.",
          };
        }

        const bloqueo = computeLockout(u.pinFailures, u.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
        if (bloqueo.locked) {
          await auditar(tx, ctx, { action: "sesion.elevar_fallido", outcome: "NEGADO", reason: describeLockout(bloqueo) ?? "Bloqueada" });
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: describeLockout(bloqueo) ?? "Bloqueado.", bloqueo: aBloqueo(bloqueo) };
        }

        // Los dos se comprueban siempre: lo que tarda la respuesta no dice cuál falló.
        const contrasenaBien = await verify(u.passwordHash, contrasena).catch(() => false);
        const reconocido = factor ? await reconocerFactor(tx, web, { factor, proposito: "ELEVAR", userId: u.id, cifrador, ahora }) : null;
        const con: keyof typeof CON = factor ? factor.tipo : "EQUIPO";

        if (!contrasenaBien || (factor !== null && !reconocido)) {
          const f = await tx.staffUser.update({
            where: { id: u.id },
            data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) },
            select: { pinFailures: true },
          });
          // No se dice cuál de las dos falló: eso le ahorraría la mitad del trabajo a un atacante.
          await auditar(tx, ctx, { action: "sesion.elevar_fallido", outcome: "NEGADO", after: { fallosSeguidos: f.pinFailures, con: CON[con] } });
          const tras = computeLockout(f.pinFailures, ahora, ahora, DEFAULT_LOCKOUT_POLICY);
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: describeLockout(tras) ?? malMensaje(con), bloqueo: aBloqueo(tras) };
        }

        await reconocido?.consumir();
        const hasta = new Date(ahora + ELEVACION_MS);
        await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: 0, pinLastFailureAt: null } });
        await tx.staffSession.update({ where: { id: s.id }, data: { elevatedUntil: hasta } });
        if (reconocido?.tipo === "CODIGO") {
          await auditar(tx, ctx, { action: "usuario.codigo_recuperacion", entityType: "staff_user", entityId: u.id, reason: "Código de recuperación usado para confirmar identidad" });
        }
        await auditar(tx, ctx, {
          action: "sesion.elevar",
          entityType: "staff_session",
          entityId: s.id,
          after: { hasta: hasta.toISOString(), con: CON[con] },
        });
        // Confiar en el equipo exige haberlo confirmado con un factor de verdad AHORA, no con la confianza.
        const confiado =
          confiar && reconocido !== null
            ? await confiarEnEquipo(tx, ctx, { userId: u.id, deviceId: s.deviceId, motivo: `Al confirmar identidad con ${CON[reconocido.tipo]}`, ahora })
            : false;
        return { ok: true as const, valor: { elevadaHasta: hasta.toISOString(), deConfianza: deConfianza || confiado } };
      });
    },

    async desafioDeEquipo({ dispositivo, ahora }) {
      if (!web) return sinLlaves;
      const cred = leerCredencial(dispositivo);
      const desconocido = { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Este equipo no está registrado." };
      if (!cred) return desconocido;
      return base.conTenant(cred.tenantId, async (tx) => {
        const d = await tx.device.findUnique({ where: { id: cred.id } });
        if (!d || !coincide(cred.secreto, d.secretHash)) return desconocido;
        if (d.status !== "PENDIENTE") return { ok: false as const, motivo: "INVALIDO" as const, mensaje: "Solo se aprueba un equipo pendiente." };
        return { ok: true as const, valor: await desafioDeFirma(tx, web, { tenantId: d.tenantId, proposito: "APROBAR_EQUIPO", deviceId: d.id, ahora }) };
      });
    },

    async aprobarEquipo({ dispositivo, contrasena, factor: crudo, ip, ahora }) {
      const cred = leerCredencial(dispositivo);
      const desconocido = { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Este equipo no está registrado." };
      if (!cred) return desconocido;
      const factor = leerSegundoFactor(crudo);
      if (typeof contrasena !== "string" || contrasena.length === 0 || !factor) return incompleto;

      return base.conTenant(cred.tenantId, async (tx) => {
        const d = await tx.device.findUnique({ where: { id: cred.id } });
        if (!d || !coincide(cred.secreto, d.secretHash)) return desconocido;
        if (d.status !== "PENDIENTE") {
          return { ok: false as const, motivo: "INVALIDO" as const, mensaje: "Solo se aprueba un equipo pendiente." };
        }
        if (solicitudCaducada(d, ahora)) return { ok: false as const, motivo: "INVALIDO" as const, mensaje: SOLICITUD_CADUCADA };

        const ctxEquipo: Contexto = { tenantId: d.tenantId, branchId: d.branchId, quien: { userId: null, deviceId: d.id }, ip };

        // El bloqueo es del EQUIPO: quien teclea todavía no tiene identidad.
        const bloqueo = computeLockout(d.approvalFailures, d.approvalLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
        if (bloqueo.locked) {
          await auditar(tx, ctxEquipo, { action: "dispositivo.aprobar", outcome: "NEGADO", entityType: "device", entityId: d.id, reason: describeLockout(bloqueo) ?? "Bloqueado" });
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: describeLockout(bloqueo) ?? "Bloqueado.", bloqueo: aBloqueo(bloqueo) };
        }

        // El factor dice de quién es; la contraseña tiene que ser la de ESA persona. El código de la app
        // se busca entre quienes tienen contraseña en esta sucursal.
        const candidatos =
          factor.tipo === "APP"
            ? (await tx.staffUser.findMany({ where: { active: true, passwordHash: { not: null }, branches: { some: { branchId: d.branchId } } }, select: { id: true } })).map((u) => u.id)
            : [];
        const reconocido = await reconocerFactor(tx, web, { factor, proposito: "APROBAR_EQUIPO", deviceId: d.id, cifrador, candidatos, ahora });
        const dueña = reconocido
          ? await tx.staffUser.findFirst({
              where: { id: reconocido.userId, active: true, passwordHash: { not: null }, branches: { some: { branchId: d.branchId } } },
            })
          : null;
        const personaBloqueada =
          dueña !== null && computeLockout(dueña.pinFailures, dueña.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY).locked;
        const contrasenaBien = dueña !== null && !personaBloqueada && (await verify(dueña.passwordHash!, contrasena).catch(() => false));

        if (!reconocido || !dueña || !contrasenaBien) {
          const f = await tx.device.update({
            where: { id: d.id },
            data: { approvalFailures: { increment: 1 }, approvalLastFailureAt: new Date(ahora) },
            select: { approvalFailures: true },
          });
          // Si el factor era de alguien, el fallo cuenta también para su bloqueo (como elevar).
          if (dueña && !personaBloqueada) {
            await tx.staffUser.update({ where: { id: dueña.id }, data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) } });
          }
          await auditar(tx, { ...ctxEquipo, quien: { userId: dueña?.id ?? null, deviceId: d.id } }, {
            action: "dispositivo.aprobar",
            outcome: "NEGADO",
            entityType: "device",
            entityId: d.id,
            reason: "Credenciales de administración incorrectas en el propio equipo",
            after: { fallosSeguidos: f.approvalFailures, con: CON[factor.tipo] },
          });
          const tras = computeLockout(f.approvalFailures, ahora, ahora, DEFAULT_LOCKOUT_POLICY);
          // No se dice cuál falló, ni si el factor era de alguien.
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: describeLockout(tras) ?? malMensaje(factor.tipo), bloqueo: aBloqueo(tras) };
        }

        const ctx: Contexto = { ...ctxEquipo, quien: { userId: dueña.id, deviceId: d.id } };
        const actor = await cargarActor(tx, dueña.id, d.branchId);
        if (!actor || can(actor, "usuarios.gestionar", { branchId: d.branchId }) !== "PERMITIDO") {
          // Credenciales buenas de alguien que no aprueba equipos: se registra, no se cuenta como ataque.
          await auditar(tx, ctx, { action: "dispositivo.aprobar", outcome: "NEGADO", entityType: "device", entityId: d.id, reason: "Sin permiso para aprobar equipos" });
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Tu puesto no permite aprobar equipos. Pídeselo a administración." };
        }

        await reconocido.consumir();
        const conQue = { LLAVE: "la llave de acceso", APP: "el código de la app de autenticación", CODIGO: "un código de recuperación" }[reconocido.tipo];
        const motivo = `Aprobado en el propio equipo con la contraseña y ${conQue} de ${dueña.fullName} (código ${codigoDeEmparejamiento(d.id)})`;
        await tx.device.update({ where: { id: d.id }, data: { status: "APROBADO", approvalFailures: 0, approvalLastFailureAt: null } });
        await tx.deviceChange.create({
          data: { tenantId: d.tenantId, deviceId: d.id, kind: "APROBADO", reason: motivo, byUserId: dueña.id, byName: dueña.fullName },
        });
        await tx.staffUser.update({ where: { id: dueña.id }, data: { pinFailures: 0, pinLastFailureAt: null } });
        if (reconocido.tipo === "CODIGO") {
          await auditar(tx, ctx, { action: "usuario.codigo_recuperacion", entityType: "staff_user", entityId: dueña.id, reason: "Código de recuperación usado para aprobar un equipo" });
        }
        await auditar(tx, ctx, {
          action: "dispositivo.aprobar",
          entityType: "device",
          entityId: d.id,
          before: { status: "PENDIENTE", label: d.label },
          after: { status: "APROBADO", label: d.label },
          reason: motivo,
        });
        return { ok: true as const, valor: { label: d.label, aprobadoPor: dueña.fullName } };
      });
    },
  };
}
