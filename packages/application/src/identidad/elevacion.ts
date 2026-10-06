/**
 * La elevación de una sesión con contraseña y llave de acceso — F2-04, ADR-013, ADR-018 y ADR-020.
 *
 * En el piso se entra con PIN sobre un equipo aprobado. Para configuración, precios, personas y
 * reportes globales (`ACCIONES_ELEVADAS`) hace falta además confirmar identidad: la contraseña
 * (Argon2id) y una llave de acceso (WebAuthn) o, si no se tiene a mano, uno de los diez códigos
 * de recuperación. La elevación dura un rato y es de ESA sesión: cambiar de persona o salir la
 * pierde.
 *
 * Los fallos cuentan para el mismo bloqueo creciente que el PIN (son credenciales de la misma
 * persona) y cada intento queda en la auditoría. Sin la dirección pública del sistema
 * (`L2_URL_PUBLICA`) no hay con qué comprobar una llave, y la elevación no está disponible
 * (fail-closed).
 */
import { verify } from "@node-rs/argon2";
import { DEFAULT_LOCKOUT_POLICY, can, computeLockout, describeLockout } from "@l2/domain-identity";
import type { Rechazo, Resultado } from "@l2/contracts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import type { Bloqueo, CasosSesiones } from "./sesiones.ts";
import { cargarActor } from "./actor.ts";
import { codigoDeEmparejamiento, coincide, leerCredencial } from "./credenciales.ts";
import { SOLICITUD_CADUCADA, solicitudCaducada } from "./dispositivos.ts";
import { desafioDeFirma, leerSegundoFactor, reconocerFactor, type Desafio, type OpcionesDeFirma, type OrigenWeb } from "./llaves.ts";

/** Lo que dura una elevación. Corto: es para hacer el cambio, no para quedarse. */
export const ELEVACION_MS = 15 * 60_000;

/** Con qué se confirmó: sale en el asiento, y un código usado se dice aparte. */
const CON = { LLAVE: "llave de acceso", CODIGO: "código de recuperación" } as const;

export interface CasosElevacion {
  /** El desafío para firmar con una llave de quien tiene ESTA sesión abierta. */
  desafio(p: { sesion: string | undefined | null; ahora: number }): Promise<Resultado<Desafio<OpcionesDeFirma>>>;
  /**
   * Eleva la sesión con la contraseña y un segundo factor: `{ tipo: "LLAVE", desafioId, respuesta }`
   * o `{ tipo: "CODIGO", codigo }`.
   */
  elevar(p: {
    sesion: string | undefined | null;
    contrasena: unknown;
    factor: unknown;
    ip: string | null;
    ahora: number;
  }): Promise<Resultado<{ elevadaHasta: string }> & Readonly<{ bloqueo?: Bloqueo }>>;
  /**
   * El desafío para aprobar el equipo de la credencial desde él mismo. No dice de quién son las
   * llaves que valen: la que responda identifica a su dueña.
   */
  desafioDeEquipo(p: { dispositivo: string | undefined | null; ahora: number }): Promise<Resultado<Desafio<OpcionesDeFirma>>>;
  /**
   * Aprueba el equipo de la credencial desde él mismo, con la contraseña y la llave (o un código
   * de recuperación) de alguien que puede gestionar personas en su sucursal (M-7). Resuelve el
   * «perdí el único PC aprobado» sin pasar por la consola. Quien teclea no dice quién es: su
   * llave lo identifica, y un equipo sin aprobar nunca enseña nombres.
   */
  aprobarEquipo(p: {
    dispositivo: string | undefined | null;
    contrasena: unknown;
    factor: unknown;
    ip: string | null;
    ahora: number;
  }): Promise<Resultado<{ label: string; aprobadoPor: string }> & Readonly<{ bloqueo?: Bloqueo }>>;
}

export function casosElevacion(base: Base, sesiones: CasosSesiones, web: OrigenWeb | null): CasosElevacion {
  const noDisponible: Rechazo = {
    ok: false,
    motivo: "NO_DISPONIBLE",
    mensaje: "La confirmación con llave de acceso no está configurada en este servidor (falta L2_URL_PUBLICA).",
  };
  const incompleto: Rechazo = {
    ok: false,
    motivo: "INVALIDO",
    mensaje: "Escribe tu contraseña y usa tu llave de acceso o un código de recuperación.",
  };
  const aBloqueo = (l: ReturnType<typeof computeLockout>): Bloqueo => ({
    bloqueado: l.locked,
    hasta: l.lockedUntil === null ? null : new Date(l.lockedUntil).toISOString(),
    intentosRestantes: l.attemptsRemaining,
    texto: describeLockout(l),
  });

  return {
    async desafio({ sesion: credencial, ahora }) {
      if (!web) return noDisponible;
      const s = await sesiones.consultar(credencial, ahora);
      if (!s) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
      return base.conTenant(s.tenantId, async (tx) => {
        const llaves = await tx.passkey.count({ where: { userId: s.userId, retiredAt: null } });
        if (llaves === 0) {
          return {
            ok: false as const,
            motivo: "NO_DISPONIBLE" as const,
            mensaje: "No tienes ninguna llave de acceso. Usa un código de recuperación o pide un enlace de alta a administración.",
          };
        }
        return { ok: true as const, valor: await desafioDeFirma(tx, web, { tenantId: s.tenantId, proposito: "ELEVAR", userId: s.userId, ahora }) };
      });
    },

    async elevar({ sesion: credencial, contrasena, factor: crudo, ip, ahora }) {
      if (!web) return noDisponible;
      const s = await sesiones.consultar(credencial, ahora);
      if (!s) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
      const factor = leerSegundoFactor(crudo);
      if (typeof contrasena !== "string" || contrasena.length === 0 || !factor) return incompleto;
      const ctx: Contexto = { tenantId: s.tenantId, branchId: s.branchId, quien: { userId: s.userId, deviceId: s.deviceId }, ip };

      return base.conTenant(s.tenantId, async (tx) => {
        const u = await tx.staffUser.findUnique({ where: { id: s.userId } });
        if (!u?.passwordHash) {
          return {
            ok: false as const,
            motivo: "NO_DISPONIBLE" as const,
            mensaje: "No tienes contraseña ni llave de acceso. Pide un enlace de alta a administración.",
          };
        }

        const bloqueo = computeLockout(u.pinFailures, u.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
        if (bloqueo.locked) {
          await auditar(tx, ctx, { action: "sesion.elevar_fallido", outcome: "NEGADO", reason: describeLockout(bloqueo) ?? "Bloqueada" });
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: describeLockout(bloqueo) ?? "Bloqueado.", bloqueo: aBloqueo(bloqueo) };
        }

        // Los dos se comprueban siempre: lo que tarda la respuesta no dice cuál falló.
        const contrasenaBien = await verify(u.passwordHash, contrasena).catch(() => false);
        const reconocido = await reconocerFactor(tx, web, { factor, proposito: "ELEVAR", userId: u.id, ahora });

        if (!contrasenaBien || !reconocido) {
          const f = await tx.staffUser.update({
            where: { id: u.id },
            data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) },
            select: { pinFailures: true },
          });
          // No se dice cuál de las dos falló: eso le ahorraría la mitad del trabajo a un atacante.
          await auditar(tx, ctx, { action: "sesion.elevar_fallido", outcome: "NEGADO", after: { fallosSeguidos: f.pinFailures, con: CON[factor.tipo] } });
          const tras = computeLockout(f.pinFailures, ahora, ahora, DEFAULT_LOCKOUT_POLICY);
          return {
            ok: false as const,
            motivo: "NO_PERMITIDO" as const,
            mensaje: describeLockout(tras) ?? (factor.tipo === "LLAVE" ? "Contraseña o llave incorrectas." : "Contraseña o código incorrectos."),
            bloqueo: aBloqueo(tras),
          };
        }

        await reconocido.consumir();
        const hasta = new Date(ahora + ELEVACION_MS);
        await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: 0, pinLastFailureAt: null } });
        await tx.staffSession.update({ where: { id: s.id }, data: { elevatedUntil: hasta } });
        if (reconocido.tipo === "CODIGO") {
          await auditar(tx, ctx, { action: "usuario.codigo_recuperacion", entityType: "staff_user", entityId: u.id, reason: "Código de recuperación usado para confirmar identidad" });
        }
        await auditar(tx, ctx, {
          action: "sesion.elevar",
          entityType: "staff_session",
          entityId: s.id,
          after: { hasta: hasta.toISOString(), con: CON[reconocido.tipo] },
        });
        return { ok: true as const, valor: { elevadaHasta: hasta.toISOString() } };
      });
    },

    async desafioDeEquipo({ dispositivo, ahora }) {
      if (!web) return noDisponible;
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
      if (!web) return noDisponible;
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

        // La llave (o el código) dice de quién es; la contraseña tiene que ser la de ESA persona.
        const reconocido = await reconocerFactor(tx, web, { factor, proposito: "APROBAR_EQUIPO", deviceId: d.id, ahora });
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
          // No se dice cuál falló, ni si la llave era de alguien.
          return {
            ok: false as const,
            motivo: "NO_PERMITIDO" as const,
            mensaje: describeLockout(tras) ?? (factor.tipo === "LLAVE" ? "Contraseña o llave incorrectas." : "Contraseña o código incorrectos."),
            bloqueo: aBloqueo(tras),
          };
        }

        const ctx: Contexto = { ...ctxEquipo, quien: { userId: dueña.id, deviceId: d.id } };
        const actor = await cargarActor(tx, dueña.id, d.branchId);
        if (!actor || can(actor, "usuarios.gestionar", { branchId: d.branchId }) !== "PERMITIDO") {
          // Credenciales buenas de alguien que no aprueba equipos: se registra, no se cuenta como ataque.
          await auditar(tx, ctx, { action: "dispositivo.aprobar", outcome: "NEGADO", entityType: "device", entityId: d.id, reason: "Sin permiso para aprobar equipos" });
          return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Tu puesto no permite aprobar equipos. Pídeselo a administración." };
        }

        await reconocido.consumir();
        const motivo = `Aprobado en el propio equipo con la contraseña y ${reconocido.tipo === "LLAVE" ? "la llave de acceso" : "un código de recuperación"} de ${dueña.fullName} (código ${codigoDeEmparejamiento(d.id)})`;
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
