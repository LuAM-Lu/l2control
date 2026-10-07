/**
 * Los factores de cada persona de administración: la app de autenticación y los equipos de confianza
 * — ADR-029, M-23.
 *
 * Cada persona configura SU app desde su sesión: el servidor genera el secreto, la pantalla lo enseña
 * una vez como QR y la app queda en vigor cuando la persona escribe el primer código (así se sabe
 * que la tiene bien puesta). Configurarla, cambiarla o quitarla exige la sesión con la identidad
 * confirmada (elevada): nadie añade un factor a otra persona con solo su PIN.
 *
 * Quitar la app o retirar la confianza de un equipo lo puede hacer la propia persona o quien
 * gestiona personas (con la identidad confirmada): es lo que se hace si se pierde el teléfono o se
 * cambia de PC. Nada se borra: se pone `retired_at` o `revoked_at`, y queda en la auditoría.
 */
import { ConfirmarAppSchema, RetirarAppSchema, RetirarConfianzaSchema, problemasDe, type AppNuevaDto, type Rechazo, type Resultado } from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "./actor.ts";
import { intervaloDelCodigo, secretoNuevo } from "./app.ts";
import type { Cifrador } from "./cifrado.ts";

export interface CasosFactores {
  /** Empieza a configurar la app de quien opera: el QR y el secreto, que se enseñan una vez. */
  iniciarApp(ctx: Contexto, ahora: number): Promise<Resultado<AppNuevaDto>>;
  /** La deja en vigor con el primer código (y retira la anterior, si la había). */
  confirmarApp(ctx: Contexto, datos: unknown, ahora: number): Promise<Resultado<{ confirmada: true }>>;
  /** Quita la app de una persona (la propia, o cualquiera con `usuarios.gestionar`). */
  retirarApp(ctx: Contexto, datos: unknown, ahora: number): Promise<Resultado<{ retirada: true }>>;
  /** Retira la confianza en un equipo (la propia, o cualquiera con `usuarios.gestionar`). */
  retirarConfianza(ctx: Contexto, datos: unknown, ahora: number): Promise<Resultado<{ retirada: true }>>;
}

const SIN_APP: Rechazo = {
  ok: false,
  motivo: "NO_DISPONIBLE",
  mensaje: "La app de autenticación no está disponible en este servidor (falta la clave de cifrado).",
};
const CONFIRMA: Rechazo = { ok: false, motivo: "ELEVACION_REQUERIDA", mensaje: "Confirma que eres tú antes de cambiar cómo confirmas." };

/** ¿Tiene la sesión de quien opera la identidad confirmada ahora mismo? */
const elevada = (ctx: Contexto, ahora: number) => {
  const hasta = ctx.elevadaHasta ? Date.parse(ctx.elevadaHasta) : Number.NaN;
  return Number.isFinite(hasta) && hasta > ahora;
};

/**
 * Sobre la propia persona basta tener la identidad confirmada; sobre otra, además, gestionar personas
 * (que ya exige la elevación). `null` = adelante.
 */
async function puedeTocar(tx: Transaccion, ctx: Contexto, userId: string, ahora: number): Promise<Rechazo | null> {
  if (ctx.quien?.userId && ctx.quien.userId === userId) return elevada(ctx, ahora) ? null : CONFIRMA;
  return exigirPermiso(tx, ctx, "usuarios.gestionar");
}

export function casosFactores(base: Base, cifrador: Cifrador | null): CasosFactores {
  return {
    async iniciarApp(ctx, ahora) {
      if (!cifrador) return SIN_APP;
      const yo = ctx.quien?.userId;
      if (!yo) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para configurar tu app." };
      if (!elevada(ctx, ahora)) return CONFIRMA;
      return base.conTenant(ctx.tenantId, async (tx) => {
        const u = await tx.staffUser.findUnique({ where: { id: yo }, select: { fullName: true, active: true } });
        if (!u?.active) return { ok: false as const, motivo: "NO_PERMITIDO" as const, mensaje: "Tu usuario no está activo." };
        // Una configuración a medias a la vez: la nueva retira la que no se terminó.
        await tx.totpCredential.updateMany({ where: { userId: yo, confirmedAt: null, retiredAt: null }, data: { retiredAt: new Date(ahora) } });
        const { secretoBase32, otpauth } = secretoNuevo(u.fullName);
        await tx.totpCredential.create({ data: { tenantId: ctx.tenantId, userId: yo, secretEnc: cifrador.cifrar(secretoBase32), createdAt: new Date(ahora) } });
        return { ok: true as const, valor: { otpauth, secreto: secretoBase32 } };
      });
    },

    async confirmarApp(ctx, datos, ahora) {
      if (!cifrador) return SIN_APP;
      const yo = ctx.quien?.userId;
      if (!yo) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para configurar tu app." };
      if (!elevada(ctx, ahora)) return CONFIRMA;
      const leido = ConfirmarAppSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "Escribe el código de seis cifras que da la app.", problemas: problemasDe(leido.error) };
      return base.conTenant(ctx.tenantId, async (tx) => {
        const pendiente = await tx.totpCredential.findFirst({ where: { userId: yo, confirmedAt: null, retiredAt: null }, orderBy: { createdAt: "desc" } });
        if (!pendiente) return { ok: false as const, motivo: "INVALIDO" as const, mensaje: "Empieza otra vez: escanea el código QR de nuevo." };
        const intervalo = intervaloDelCodigo(cifrador.descifrar(pendiente.secretEnc), leido.data.codigo, ahora);
        if (intervalo === null) {
          return {
            ok: false as const,
            motivo: "INVALIDO" as const,
            mensaje: "Ese código no coincide. Mira que la hora del teléfono sea la correcta y escribe el que sale ahora.",
            problemas: [{ path: ["codigo"], message: "No coincide con la app." }],
          };
        }
        const anteriores = await tx.totpCredential.updateMany({
          where: { userId: yo, confirmedAt: { not: null }, retiredAt: null },
          data: { retiredAt: new Date(ahora) },
        });
        await tx.totpCredential.update({
          where: { id: pendiente.id },
          data: { confirmedAt: new Date(ahora), lastStep: BigInt(intervalo), lastUsedAt: new Date(ahora) },
        });
        await auditar(tx, ctx, {
          action: "usuario.app",
          entityType: "staff_user",
          entityId: yo,
          after: { app: pendiente.id, cambia: anteriores.count > 0 },
          reason: anteriores.count > 0 ? "App de autenticación cambiada" : "App de autenticación configurada",
        });
        return { ok: true as const, valor: { confirmada: true as const } };
      });
    },

    async retirarApp(ctx, datos, ahora) {
      const leido = RetirarAppSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "Falta de quién es la app.", problemas: problemasDe(leido.error) };
      const { userId } = leido.data;
      return base.conTenant(ctx.tenantId, async (tx) => {
        const negado = await puedeTocar(tx, ctx, userId, ahora);
        if (negado) return negado;
        const r = await tx.totpCredential.updateMany({ where: { userId, retiredAt: null }, data: { retiredAt: new Date(ahora) } });
        if (r.count === 0) return { ok: false as const, motivo: "CONFLICTO" as const, mensaje: "No tenía la app configurada." };
        const quien = await nombreDe(tx, ctx);
        await auditar(tx, ctx, { action: "usuario.app", entityType: "staff_user", entityId: userId, after: { retirada: true }, reason: `App de autenticación quitada por ${quien.nombre}` });
        return { ok: true as const, valor: { retirada: true as const } };
      });
    },

    async retirarConfianza(ctx, datos, ahora) {
      const leido = RetirarConfianzaSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "Falta qué confianza retirar.", problemas: problemasDe(leido.error) };
      return base.conTenant(ctx.tenantId, async (tx) => {
        const fila = await tx.trustedDevice.findUnique({ where: { id: leido.data.id }, include: { device: { select: { label: true } } } });
        if (!fila || fila.revokedAt) return { ok: false as const, motivo: "CONFLICTO" as const, mensaje: "Ese equipo ya no era de confianza." };
        const negado = await puedeTocar(tx, ctx, fila.userId, ahora);
        if (negado) return negado;
        const quien = await nombreDe(tx, ctx);
        await tx.trustedDevice.update({ where: { id: fila.id }, data: { revokedAt: new Date(ahora), revokedByName: quien.nombre } });
        await auditar(tx, ctx, {
          action: "usuario.confianza",
          entityType: "staff_user",
          entityId: fila.userId,
          before: { confianza: fila.id, equipo: fila.device.label },
          after: { retirada: true },
          reason: `Confianza en «${fila.device.label}» retirada por ${quien.nombre}`,
        });
        return { ok: true as const, valor: { retirada: true as const } };
      });
    },
  };
}
