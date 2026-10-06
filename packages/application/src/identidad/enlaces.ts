/**
 * Las credenciales de administración desde el panel: el enlace de alta — ADR-020, punto 4.
 *
 * Administración le genera a una persona un enlace de un solo uso (24 h, con QR en pantalla). Esa
 * persona lo abre en SU equipo o SU teléfono, pone su contraseña, registra su llave de acceso y
 * recibe sus diez códigos de recuperación. Quien genera el enlace nunca ve la contraseña ni toca
 * la llave: no puede hacerse pasar por ella.
 *
 * Dos tipos:
 *  · ALTA  da contraseña, llave y códigos. Si la persona ya tenía, los REPONE: sus llaves y sus
 *          códigos anteriores quedan retirados (es la puerta de quien lo perdió todo).
 *  · LLAVE añade otra llave a quien ya tiene contraseña (la regla es tener dos: ADR-020). Pide la
 *          contraseña actual, así que un enlace interceptado no basta.
 *
 * El enlace es `tenant.id.secreto`, como una credencial de equipo: la base guarda el SHA-256 del
 * secreto y un volcado no sirve para usarlo. Generar otro para la misma persona revoca el anterior.
 * La consola del servidor (`pnpm credenciales`) usa este mismo caso como puerta de emergencia.
 */
import { hash, verify } from "@node-rs/argon2";
import { can, checkNewPassword } from "@l2/domain-identity";
import {
  CompletarAltaSchema,
  CredencialesDePersonaSchema,
  EnlaceDeAltaCommandSchema,
  PrepararAltaSchema,
  problemasDe,
  type CredencialesDePersonaDto,
  type EnlaceAbiertoDto,
  type EnlaceDeAltaDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { ACCIONES_ELEVADAS, cargarActor, exigirPermiso, nombreDe } from "./actor.ts";
import { coincide, componer, huella, leerCredencial, nuevoSecreto } from "./credenciales.ts";
import {
  desafioDeRegistro,
  guardarLlave,
  reponerCodigos,
  retirarLlaves,
  tomarDesafio,
  verificarRegistro,
  type Desafio,
  type OpcionesDeRegistro,
  type OrigenWeb,
} from "./llaves.ts";

/** Lo que vale un enlace de alta (ADR-020). */
export const ENLACE_MS = 24 * 60 * 60_000;
/** Contraseñas erradas que aguanta un enlace LLAVE antes de dejar de valer. */
const FALLOS_DEL_ENLACE = 5;

export interface AltaCompletada {
  readonly nombre: string;
  /** Solo en ALTA: se enseñan UNA vez, para imprimirlos. La base guarda su huella. */
  readonly codigos: readonly string[] | null;
}

export interface CasosEnlaces {
  /** Las credenciales de cada persona de la sucursal, sin ningún secreto (`usuarios.gestionar`). */
  resumen(ctx: Contexto): Promise<Resultado<CredencialesDePersonaDto[]>>;
  /** Genera el enlace de una persona (`EnlaceDeAltaCommand`) y revoca el que tuviera sin usar. */
  crear(ctx: Contexto, comando: unknown, ahora: number): Promise<Resultado<EnlaceDeAltaDto>>;
  /** De quién es un enlace y para qué, o `null` si ya no vale. No dice por qué no vale. */
  abrir(enlace: unknown, ahora: number): Promise<EnlaceAbiertoDto | null>;
  /** Primer paso: la contraseña. Devuelve el desafío para registrar la llave. */
  preparar(p: { enlace: unknown; datos: unknown; ahora: number }): Promise<Resultado<Desafio<OpcionesDeRegistro>>>;
  /** Segundo paso: la llave. Deja las credenciales puestas y gasta el enlace. */
  completar(p: { enlace: unknown; datos: unknown; ip: string | null; ahora: number }): Promise<Resultado<AltaCompletada>>;
}

/** ¿El puesto de esta persona hace algo que exige confirmar identidad? */
async function necesitaCredenciales(tx: Transaccion, userId: string, branchId: string): Promise<boolean> {
  const actor = await cargarActor(tx, userId, branchId);
  return actor !== null && ACCIONES_ELEVADAS.some((a) => can(actor, a, { branchId }) !== "DENEGADO");
}

export function casosEnlaces(base: Base, web: OrigenWeb | null): CasosEnlaces {
  const noDisponible: Rechazo = {
    ok: false,
    motivo: "NO_DISPONIBLE",
    mensaje: "Las llaves de acceso no están configuradas en este servidor (falta L2_URL_PUBLICA).",
  };
  const noVale: Rechazo = {
    ok: false,
    motivo: "NO_PERMITIDO",
    mensaje: "Este enlace ya no vale: se usó, caducó o se generó otro. Pide uno nuevo a administración.",
  };

  /** El enlace vigente de esta credencial, con su persona. `null` si no existe o ya no vale. */
  async function vigente(tx: Transaccion, cred: { id: string; secreto: string }, ahora: number) {
    const e = await tx.enrollmentLink.findUnique({ where: { id: cred.id }, include: { user: true } });
    if (!e || !coincide(cred.secreto, e.secretHash)) return null;
    if (e.usedAt || e.revokedAt || e.expiresAt.getTime() <= ahora || e.failures >= FALLOS_DEL_ENLACE) return null;
    if (!e.user.active) return null;
    return e;
  }

  return {
    async resumen(ctx) {
      return base.conTenant(ctx.tenantId, async (tx) => {
        const negado = await exigirPermiso(tx, ctx, "usuarios.gestionar");
        if (negado) return negado;
        const personas = await tx.staffUser.findMany({
          where: { branches: { some: { branchId: ctx.branchId } } },
          select: { id: true, role: true, active: true, passwordHash: true },
          orderBy: { fullName: "asc" },
        });
        const ids = personas.map((p) => p.id);
        const ahora = new Date();
        const llaves = await tx.passkey.findMany({ where: { userId: { in: ids }, retiredAt: null }, orderBy: { createdAt: "asc" } });
        const codigos = await tx.recoveryCode.groupBy({ by: ["userId"], where: { userId: { in: ids }, usedAt: null, retiredAt: null }, _count: true });
        const enlaces = await tx.enrollmentLink.findMany({
          where: { userId: { in: ids }, usedAt: null, revokedAt: null, expiresAt: { gt: ahora }, failures: { lt: FALLOS_DEL_ENLACE } },
          orderBy: { createdAt: "desc" },
        });
        const valor: CredencialesDePersonaDto[] = [];
        for (const p of personas) {
          const enlace = enlaces.find((e) => e.userId === p.id);
          valor.push(
            CredencialesDePersonaSchema.parse({
              userId: p.id,
              lasNecesita: p.active && (await necesitaCredenciales(tx, p.id, ctx.branchId)),
              tieneContrasena: p.passwordHash !== null,
              llaves: llaves
                .filter((l) => l.userId === p.id)
                .map((l) => ({ id: l.id, etiqueta: l.label, creada: l.createdAt.toISOString(), ultimoUso: l.lastUsedAt?.toISOString() ?? null })),
              codigosRestantes: codigos.find((c) => c.userId === p.id)?._count ?? 0,
              enlacePendiente: enlace ? { kind: enlace.kind, caduca: enlace.expiresAt.toISOString() } : null,
            }),
          );
        }
        return { ok: true as const, valor };
      });
    },

    async crear(ctx, comando, ahora) {
      if (!web) return noDisponible;
      const leido = EnlaceDeAltaCommandSchema.safeParse(comando);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "El enlace pedido no tiene la forma esperada.", problemas: problemasDe(leido.error) };
      const { userId, kind } = leido.data;

      const negado = await base.conTenant(ctx.tenantId, (tx) => exigirPermiso(tx, ctx, "usuarios.gestionar"));
      if (negado) {
        if (negado.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "usuario.enlace", entityType: "staff_user", entityId: userId, reason: negado.mensaje });
        return negado;
      }

      return base.conTenant(ctx.tenantId, async (tx) => {
        const u = await tx.staffUser.findFirst({ where: { id: userId, branches: { some: { branchId: ctx.branchId } } } });
        if (!u) return { ok: false as const, motivo: "NO_DISPONIBLE" as const, mensaje: "Esa persona no existe en esta sucursal." };
        if (!u.active) return { ok: false as const, motivo: "INVALIDO" as const, mensaje: `${u.fullName} está de baja: no se le dan credenciales.` };
        // Desde el panel solo se dan a quien las va a usar. La consola (puerta de emergencia) no pregunta.
        if (!ctx.sistema && !(await necesitaCredenciales(tx, u.id, ctx.branchId))) {
          return {
            ok: false as const,
            motivo: "INVALIDO" as const,
            mensaje: `El puesto de ${u.fullName} no usa contraseña ni llave de acceso: entra con su PIN.`,
          };
        }
        if (kind === "LLAVE" && !u.passwordHash) {
          return { ok: false as const, motivo: "INVALIDO" as const, mensaje: `${u.fullName} todavía no tiene contraseña: dale primero un enlace de alta.` };
        }

        const quien = await nombreDe(tx, ctx);
        await tx.enrollmentLink.updateMany({ where: { userId: u.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date(ahora) } });
        const secreto = nuevoSecreto();
        const caduca = new Date(ahora + ENLACE_MS);
        const e = await tx.enrollmentLink.create({
          data: {
            tenantId: ctx.tenantId,
            userId: u.id,
            kind,
            secretHash: huella(secreto),
            createdBy: ctx.quien?.userId ?? null,
            createdByName: quien.nombre,
            createdAt: new Date(ahora),
            expiresAt: caduca,
          },
        });
        // El secreto no va al asiento: solo que se generó, para quién y de qué tipo.
        await auditar(tx, ctx, {
          action: "usuario.enlace",
          entityType: "staff_user",
          entityId: u.id,
          after: { kind, caduca: caduca.toISOString(), repone: kind === "ALTA" && u.passwordHash !== null },
          reason: kind === "ALTA" ? "Enlace de alta de credenciales" : "Enlace para añadir otra llave de acceso",
        });
        // En el fragmento (#), que el navegador no envía al servidor: el secreto no llega a ningún log.
        const url = `${web.origen}/alta#${componer({ tenantId: ctx.tenantId, id: e.id, secreto })}`;
        return { ok: true as const, valor: { userId: u.id, nombre: u.fullName, kind, url, caduca: caduca.toISOString() } };
      });
    },

    async abrir(enlace, ahora) {
      const cred = leerCredencial(typeof enlace === "string" ? enlace : null);
      if (!cred) return null;
      return base.conTenant(cred.tenantId, async (tx) => {
        const e = await vigente(tx, cred, ahora);
        return e ? { nombre: e.user.fullName, kind: e.kind as EnlaceAbiertoDto["kind"], caduca: e.expiresAt.toISOString() } : null;
      });
    },

    async preparar({ enlace, datos, ahora }) {
      if (!web) return noDisponible;
      const cred = leerCredencial(typeof enlace === "string" ? enlace : null);
      if (!cred) return noVale;
      const leido = PrepararAltaSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "Escribe tu contraseña.", problemas: problemasDe(leido.error) };
      const { contrasena } = leido.data;

      return base.conTenant(cred.tenantId, async (tx) => {
        const e = await vigente(tx, cred, ahora);
        if (!e) return noVale;

        if (e.kind === "LLAVE") {
          // Añadir una llave exige la contraseña que ya tiene: el enlace solo no basta.
          if (!e.user.passwordHash || !(await verify(e.user.passwordHash, contrasena).catch(() => false))) {
            const f = await tx.enrollmentLink.update({ where: { id: e.id }, data: { failures: { increment: 1 } }, select: { failures: true } });
            return {
              ok: false as const,
              motivo: "NO_PERMITIDO" as const,
              mensaje: f.failures >= FALLOS_DEL_ENLACE ? noVale.mensaje : "Contraseña incorrecta.",
            };
          }
          return { ok: true as const, valor: await desafioDeRegistro(tx, web, { tenantId: e.tenantId, proposito: "LLAVE", userId: e.userId, nombre: e.user.fullName, payload: { enlace: e.id }, ahora }) };
        }

        const revision = checkNewPassword(contrasena);
        if (!revision.ok) return { ok: false as const, motivo: "INVALIDO" as const, mensaje: revision.message };
        // Entre los dos pasos solo viaja el Argon2id de la contraseña, nunca ella.
        const passwordHash = await hash(contrasena);
        return {
          ok: true as const,
          valor: await desafioDeRegistro(tx, web, {
            tenantId: e.tenantId,
            proposito: "ALTA",
            userId: e.userId,
            nombre: e.user.fullName,
            // Al reponer, las llaves anteriores se retiran: no tiene sentido excluirlas del registro.
            excluirLasSuyas: false,
            payload: { enlace: e.id, passwordHash },
            ahora,
          }),
        };
      });
    },

    async completar({ enlace, datos, ip, ahora }) {
      if (!web) return noDisponible;
      const cred = leerCredencial(typeof enlace === "string" ? enlace : null);
      if (!cred) return noVale;
      const leido = CompletarAltaSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "La respuesta de la llave no llegó completa.", problemas: problemasDe(leido.error) };
      const { desafioId, respuesta, etiqueta } = leido.data;

      return base.conTenant(cred.tenantId, async (tx) => {
        const e = await vigente(tx, cred, ahora);
        if (!e) return noVale;
        const llaveNoVale = {
          ok: false as const,
          motivo: "NO_PERMITIDO" as const,
          mensaje: "No se pudo registrar la llave de acceso. Vuelve a escribir tu contraseña e inténtalo otra vez.",
        };
        const d = await tomarDesafio(tx, { desafioId, proposito: e.kind as "ALTA" | "LLAVE", ahora });
        const recordado = d?.payload && typeof d.payload === "object" && !Array.isArray(d.payload) ? d.payload : null;
        if (!d || d.userId !== e.userId || recordado?.enlace !== e.id) return llaveNoVale;
        const llave = await verificarRegistro(web, d.desafio, respuesta);
        if (!llave) return llaveNoVale;
        if (await tx.passkey.findUnique({ where: { credentialId: llave.credentialId }, select: { id: true } })) {
          return { ok: false as const, motivo: "CONFLICTO" as const, mensaje: "Esa llave de acceso ya está registrada. Usa otra." };
        }

        // Quien hace el alta es la propia persona, desde su equipo: todavía sin sesión.
        const sucursal = await tx.staffUserBranch.findFirst({ where: { userId: e.userId }, select: { branchId: true } });
        if (!sucursal) return noVale;
        const ctx: Contexto = { tenantId: e.tenantId, branchId: sucursal.branchId, quien: { userId: e.userId, deviceId: null }, ip };

        let codigos: string[] | null = null;
        if (e.kind === "ALTA") {
          const passwordHash = typeof recordado.passwordHash === "string" ? recordado.passwordHash : null;
          if (!passwordHash) return llaveNoVale;
          const repone = e.user.passwordHash !== null;
          const retiradas = await retirarLlaves(tx, { userId: e.userId, ahora });
          await tx.staffUser.update({ where: { id: e.userId }, data: { passwordHash, pinFailures: 0, pinLastFailureAt: null } });
          codigos = await reponerCodigos(tx, { tenantId: e.tenantId, userId: e.userId, ahora });
          // Reponer credenciales cierra lo que estuviera elevado con las anteriores.
          await tx.staffSession.updateMany({ where: { userId: e.userId, closedAt: null }, data: { elevatedUntil: null } });
          await auditar(tx, ctx, {
            action: "usuario.contrasena",
            entityType: "staff_user",
            entityId: e.userId,
            after: { repone, llavesRetiradas: retiradas, codigos: codigos.length },
            reason: `${repone ? "Credenciales repuestas" : "Alta de credenciales"} con el enlace que generó ${e.createdByName}`,
          });
        }
        const llaveId = await guardarLlave(tx, { tenantId: e.tenantId, userId: e.userId, llave, etiqueta, ahora });
        await tx.enrollmentLink.update({ where: { id: e.id }, data: { usedAt: new Date(ahora) } });
        await auditar(tx, ctx, {
          action: "usuario.llave",
          entityType: "staff_user",
          entityId: e.userId,
          after: { llave: llaveId, etiqueta },
          reason: `Llave de acceso registrada con el enlace que generó ${e.createdByName}`,
        });
        return { ok: true as const, valor: { nombre: e.user.fullName, codigos } };
      });
    },
  };
}

