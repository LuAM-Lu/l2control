/**
 * La elevación de una sesión con contraseña y código TOTP — F2-04, ADR-013 y ADR-018.
 *
 * En el piso se entra con PIN sobre un equipo aprobado. Para configuración, precios, personas y
 * reportes globales (`ACCIONES_ELEVADAS`) hace falta además confirmar identidad: la contraseña
 * (Argon2id) y el código de un autenticador (TOTP, RFC 6238). La elevación dura un rato y es de
 * ESA sesión: cambiar de persona o salir la pierde.
 *
 * Los fallos cuentan para el mismo bloqueo creciente que el PIN (son credenciales de la misma
 * persona) y cada intento queda en la auditoría. El secreto TOTP se guarda cifrado; sin la clave
 * de cifrado del servidor, la elevación no está disponible (fail-closed).
 */
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { Secret, TOTP } from "otpauth";
import { DEFAULT_LOCKOUT_POLICY, computeLockout, describeLockout } from "@l2/domain-identity";
import type { Rechazo, Resultado } from "@l2/contracts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import type { Cifrador } from "./cifrado.ts";
import type { Bloqueo, CasosSesiones } from "./sesiones.ts";

/** Lo que dura una elevación. Corto: es para hacer el cambio, no para quedarse. */
export const ELEVACION_MS = 15 * 60_000;
const CONTRASEÑA_MINIMA = 12;
const CODIGO = /^\d{6}$/;

const totpDe = (secreto: string, etiqueta: string) =>
  new TOTP({ issuer: "L2 Control", label: etiqueta, secret: Secret.fromBase32(secreto), algorithm: "SHA1", digits: 6, period: 30 });

export interface CredencialesNuevas {
  /** Se enseña UNA vez, al crearla. En la base solo queda su Argon2id. */
  readonly contrasena: string;
  /** `otpauth://…` para el autenticador (se puede convertir en QR). */
  readonly otpauth: string;
  readonly secretoBase32: string;
}

export interface CasosElevacion {
  elevar(p: {
    sesion: string | undefined | null;
    contrasena: unknown;
    codigo: unknown;
    ip: string | null;
    ahora: number;
  }): Promise<Resultado<{ elevadaHasta: string }> & Readonly<{ bloqueo?: Bloqueo }>>;
  /**
   * Da (o repone) contraseña y autenticador a una persona. Solo el sistema: la consola del
   * servidor, o la semilla de desarrollo con valores fijos.
   */
  credenciales(
    ctx: Contexto,
    p: { nombre: string; contrasena?: string; secretoBase32?: string },
  ): Promise<Resultado<CredencialesNuevas>>;
}

export function casosElevacion(base: Base, sesiones: CasosSesiones, cifrador: Cifrador | null): CasosElevacion {
  const noDisponible: Rechazo = {
    ok: false,
    motivo: "NO_DISPONIBLE",
    mensaje: "La confirmación con contraseña no está configurada en este servidor (falta L2_CLAVE_CIFRADO).",
  };

  return {
    async elevar({ sesion: credencial, contrasena, codigo, ip, ahora }) {
      if (!cifrador) return noDisponible;
      const s = await sesiones.consultar(credencial, ahora);
      if (!s) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Tu sesión terminó. Vuelve a entrar." };
      if (typeof contrasena !== "string" || typeof codigo !== "string" || !CODIGO.test(codigo.trim())) {
        return { ok: false, motivo: "INVALIDO", mensaje: "Escribe tu contraseña y los 6 números del autenticador." };
      }
      const ctx: Contexto = { tenantId: s.tenantId, branchId: s.branchId, quien: { userId: s.userId, deviceId: s.deviceId }, ip };

      return base.conTenant(s.tenantId, async (tx) => {
        const u = await tx.staffUser.findUnique({ where: { id: s.userId } });
        if (!u?.passwordHash || !u.totpSecretEnc) {
          return {
            ok: false as const,
            motivo: "NO_DISPONIBLE" as const,
            mensaje: "No tienes contraseña ni autenticador configurados. Pídelos a administración.",
          };
        }

        const bloqueo = computeLockout(u.pinFailures, u.pinLastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
        if (bloqueo.locked) {
          await auditar(tx, ctx, { action: "sesion.elevar_fallido", outcome: "NEGADO", reason: describeLockout(bloqueo) ?? "Bloqueada" });
          return {
            ok: false as const,
            motivo: "NO_PERMITIDO" as const,
            mensaje: describeLockout(bloqueo) ?? "Bloqueado.",
            bloqueo: { bloqueado: true, hasta: new Date(bloqueo.lockedUntil!).toISOString(), intentosRestantes: 0, texto: describeLockout(bloqueo) },
          };
        }

        const contrasenaBien = await verify(u.passwordHash, contrasena).catch(() => false);
        const codigoBien =
          totpDe(cifrador.descifrar(u.totpSecretEnc), u.fullName).validate({ token: codigo.trim(), timestamp: ahora, window: 1 }) !== null;

        if (!contrasenaBien || !codigoBien) {
          const f = await tx.staffUser.update({
            where: { id: u.id },
            data: { pinFailures: { increment: 1 }, pinLastFailureAt: new Date(ahora) },
            select: { pinFailures: true },
          });
          // No se dice cuál de las dos falló: eso le ahorraría la mitad del trabajo a un atacante.
          await auditar(tx, ctx, { action: "sesion.elevar_fallido", outcome: "NEGADO", after: { fallosSeguidos: f.pinFailures } });
          const tras = computeLockout(f.pinFailures, ahora, ahora, DEFAULT_LOCKOUT_POLICY);
          return {
            ok: false as const,
            motivo: "NO_PERMITIDO" as const,
            mensaje: describeLockout(tras) ?? "Contraseña o código incorrectos.",
            bloqueo: {
              bloqueado: tras.locked,
              hasta: tras.lockedUntil === null ? null : new Date(tras.lockedUntil).toISOString(),
              intentosRestantes: tras.attemptsRemaining,
              texto: describeLockout(tras),
            },
          };
        }

        const hasta = new Date(ahora + ELEVACION_MS);
        await tx.staffUser.update({ where: { id: u.id }, data: { pinFailures: 0, pinLastFailureAt: null } });
        await tx.staffSession.update({ where: { id: s.id }, data: { elevatedUntil: hasta } });
        await auditar(tx, ctx, { action: "sesion.elevar", entityType: "staff_session", entityId: s.id, after: { hasta: hasta.toISOString() } });
        return { ok: true as const, valor: { elevadaHasta: hasta.toISOString() } };
      });
    },

    async credenciales(ctx, p) {
      if (!ctx.sistema) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Solo la consola del servidor da credenciales." };
      if (!cifrador) return noDisponible;
      const contrasena = p.contrasena ?? randomBytes(15).toString("base64url");
      if (contrasena.length < CONTRASEÑA_MINIMA) {
        return { ok: false, motivo: "INVALIDO", mensaje: `La contraseña necesita al menos ${CONTRASEÑA_MINIMA} caracteres.` };
      }
      const secretoBase32 = p.secretoBase32 ?? new Secret({ size: 20 }).base32;

      return base.conTenant(ctx.tenantId, async (tx) => {
        const u = await tx.staffUser.findFirst({ where: { fullName: p.nombre, active: true } });
        if (!u) return { ok: false as const, motivo: "NO_DISPONIBLE" as const, mensaje: `No hay ninguna persona activa llamada «${p.nombre}».` };
        await tx.staffUser.update({
          where: { id: u.id },
          data: { passwordHash: await hash(contrasena), totpSecretEnc: cifrador.cifrar(secretoBase32), pinFailures: 0, pinLastFailureAt: null },
        });
        // Nada de la credencial va al asiento: ni la contraseña ni el secreto.
        await auditar(tx, ctx, { action: "usuario.contrasena", entityType: "staff_user", entityId: u.id, reason: "Contraseña y autenticador desde la consola del servidor" });
        return { ok: true as const, valor: { contrasena, otpauth: totpDe(secretoBase32, u.fullName).toString(), secretoBase32 } };
      });
    },
  };
}
