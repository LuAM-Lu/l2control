/**
 * La instalación inicial de un local — ADR-020 (punto 3), M-12, JORNADA §2.
 *
 * En producción la base arranca vacía: no hay local, ni personas, ni equipos. Con ella vacía, el
 * acceso ofrece «Instalar L2 Control», que en un solo paso deja el local con su sucursal, la
 * primera persona de administración (contraseña, PIN, llave de acceso y diez códigos de
 * recuperación) y ESTE equipo aprobado. Nadie toca la consola.
 *
 * Para que nadie se adelante a instalarlo, pide un **código de instalación** de un solo uso que
 * el servidor escribe en su registro al arrancar sin instalar (lo lee quien despliega). La base
 * guarda su SHA-256, y cada código errado cuenta para un bloqueo creciente.
 *
 * Hecha la instalación, esto deja de existir: `estado` responde «instalado» para siempre (la
 * base no deja deshacer la constancia) y los dos pasos se niegan. Un local que ya tenía sucursal
 * antes de este paso (los que nacieron con la semilla o la consola) cuenta como instalado.
 *
 * Aquí no hay asientos de rechazo: la auditoría cuelga de la sucursal, que todavía no existe. Los
 * intentos fallidos quedan contados en `installation` y el servidor web los escribe en su registro.
 */
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { DEFAULT_LOCKOUT_POLICY, checkNewPassword, checkNewPin, computeLockout, describeLockout } from "@l2/domain-identity";
import { CompletarInstalacionSchema, PrepararInstalacionSchema, problemasDe, type Rechazo, type Resultado } from "@l2/contracts";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar } from "../auditoria/auditar.ts";
import { crearLocal } from "../sucursal/sucursal.ts";
import { coincide, componer, huella, nuevoSecreto } from "./credenciales.ts";
import type { Lugar } from "./dispositivos.ts";
import type { Bloqueo } from "./sesiones.ts";
import {
  desafioDeRegistro,
  guardarLlave,
  normalizarCodigo,
  nuevoCodigo,
  reponerCodigos,
  tomarDesafio,
  verificarRegistro,
  type Desafio,
  type OpcionesDeRegistro,
  type OrigenWeb,
} from "./llaves.ts";

export interface InstalacionHecha {
  readonly userId: string;
  readonly nombre: string;
  /** La credencial de ESTE equipo, ya aprobado: el servidor web la guarda en su cookie. */
  readonly credencialEquipo: string;
  /** Se enseñan UNA vez, para imprimirlos. */
  readonly codigos: readonly string[];
}

export interface CasosInstalacion {
  /** ¿Este local ya está instalado? Es lo que decide si el acceso ofrece instalar o entrar. */
  estado(lugar: Lugar): Promise<{ instalado: boolean }>;
  /**
   * Al arrancar el servidor: si el local no está instalado, emite un código nuevo (el anterior
   * deja de valer) y lo devuelve EN CLARO para escribirlo en el registro. `null` si ya lo está.
   */
  emitirCodigo(lugar: Lugar, ahora: number): Promise<string | null>;
  /** Primer paso: el código, el local y la primera administración. Devuelve el desafío de su llave. */
  preparar(p: { lugar: Lugar; datos: unknown; ahora: number }): Promise<Resultado<Desafio<OpcionesDeRegistro>> & Readonly<{ bloqueo?: Bloqueo }>>;
  /** Segundo paso: la llave. Crea todo en una transacción y aprueba este equipo. */
  completar(p: { lugar: Lugar; datos: unknown; ip: string | null; ahora: number }): Promise<Resultado<InstalacionHecha> & Readonly<{ bloqueo?: Bloqueo }>>;
}

const YA_INSTALADO: Rechazo = { ok: false, motivo: "NO_PERMITIDO", mensaje: "Este local ya está instalado. Entra con tu PIN." };

async function instalado(tx: Transaccion, lugar: Lugar): Promise<boolean> {
  const fila = await tx.installation.findUnique({ where: { tenantId: lugar.tenantId }, select: { completedAt: true } });
  if (fila?.completedAt) return true;
  return (await tx.branch.findUnique({ where: { id: lugar.branchId }, select: { id: true } })) !== null;
}

export function casosInstalacion(base: Base, web: OrigenWeb | null): CasosInstalacion {
  const noDisponible: Rechazo = {
    ok: false,
    motivo: "NO_DISPONIBLE",
    mensaje: "Las llaves de acceso no están configuradas en este servidor (falta L2_URL_PUBLICA).",
  };
  const aBloqueo = (l: ReturnType<typeof computeLockout>): Bloqueo => ({
    bloqueado: l.locked,
    hasta: l.lockedUntil === null ? null : new Date(l.lockedUntil).toISOString(),
    intentosRestantes: l.attemptsRemaining,
    texto: describeLockout(l),
  });

  /** Comprueba el código de instalación. `null` = vale; si no, el rechazo (con su bloqueo). */
  async function revisarCodigo(tx: Transaccion, lugar: Lugar, codigo: string, ahora: number): Promise<(Rechazo & { bloqueo?: Bloqueo }) | null> {
    const fila = await tx.installation.findUnique({ where: { tenantId: lugar.tenantId } });
    if (!fila?.codeHash) {
      return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El servidor todavía no ha emitido un código de instalación. Reinícialo y léelo en su registro." };
    }
    const bloqueo = computeLockout(fila.failures, fila.lastFailureAt?.getTime() ?? null, ahora, DEFAULT_LOCKOUT_POLICY);
    if (bloqueo.locked) return { ok: false, motivo: "NO_PERMITIDO", mensaje: describeLockout(bloqueo) ?? "Bloqueado.", bloqueo: aBloqueo(bloqueo) };
    const normal = normalizarCodigo(codigo);
    if (normal !== null && coincide(normal, fila.codeHash)) return null;
    const f = await tx.installation.update({
      where: { tenantId: lugar.tenantId },
      data: { failures: { increment: 1 }, lastFailureAt: new Date(ahora) },
      select: { failures: true },
    });
    const tras = computeLockout(f.failures, ahora, ahora, DEFAULT_LOCKOUT_POLICY);
    return {
      ok: false,
      motivo: "NO_PERMITIDO",
      mensaje: describeLockout(tras) ?? "Ese no es el código de instalación. Está en el registro del servidor.",
      bloqueo: aBloqueo(tras),
    };
  }

  return {
    estado(lugar) {
      return base.conTenant(lugar.tenantId, async (tx) => ({ instalado: await instalado(tx, lugar) }));
    },

    emitirCodigo(lugar, ahora) {
      return base.conTenant(lugar.tenantId, async (tx) => {
        if (await instalado(tx, lugar)) return null;
        const codigo = nuevoCodigo();
        const datos = { codeHash: huella(normalizarCodigo(codigo)!), issuedAt: new Date(ahora), failures: 0, lastFailureAt: null };
        await tx.installation.upsert({ where: { tenantId: lugar.tenantId }, create: { tenantId: lugar.tenantId, ...datos }, update: datos });
        return codigo;
      });
    },

    async preparar({ lugar, datos, ahora }) {
      if (!web) return noDisponible;
      const leido = PrepararInstalacionSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "Revisa los datos de la instalación.", problemas: problemasDe(leido.error) };
      const d = leido.data;
      const pin = checkNewPin(d.pin);
      if (!pin.ok) return { ok: false, motivo: "INVALIDO", mensaje: pin.message, problemas: [{ path: ["pin"], message: pin.message }] };
      const contrasena = checkNewPassword(d.contrasena);
      if (!contrasena.ok) return { ok: false, motivo: "INVALIDO", mensaje: contrasena.message, problemas: [{ path: ["contrasena"], message: contrasena.message }] };

      return base.conTenant(lugar.tenantId, async (tx) => {
        if (await instalado(tx, lugar)) return YA_INSTALADO;
        const mal = await revisarCodigo(tx, lugar, d.codigo, ahora);
        if (mal) return mal;
        // La persona todavía no existe: su id nace aquí y viaja en el desafío, con los Argon2id de
        // su contraseña y de su PIN (nunca ellos) y los nombres. Nada se crea hasta tener la llave.
        const userId = randomUUID();
        const valor = await desafioDeRegistro(tx, web, {
          tenantId: lugar.tenantId,
          proposito: "INSTALACION",
          userId,
          nombre: d.nombre,
          excluirLasSuyas: false,
          payload: { local: d.local, sucursal: d.sucursal, nombre: d.nombre, passwordHash: await hash(d.contrasena), pinHash: await hash(d.pin) },
          ahora,
        });
        return { ok: true as const, valor };
      });
    },

    async completar({ lugar, datos, ip, ahora }) {
      if (!web) return noDisponible;
      const leido = CompletarInstalacionSchema.safeParse(datos);
      if (!leido.success) return { ok: false, motivo: "INVALIDO", mensaje: "Revisa los datos de la instalación.", problemas: problemasDe(leido.error) };
      const c = leido.data;

      return base.conTenant(lugar.tenantId, async (tx) => {
        if (await instalado(tx, lugar)) return YA_INSTALADO;
        const mal = await revisarCodigo(tx, lugar, c.codigo, ahora);
        if (mal) return mal;

        const llaveNoVale = {
          ok: false as const,
          motivo: "NO_PERMITIDO" as const,
          mensaje: "No se pudo registrar la llave de acceso. Vuelve al paso anterior e inténtalo otra vez.",
        };
        const d = await tomarDesafio(tx, { desafioId: c.desafioId, proposito: "INSTALACION", ahora });
        const r = d?.payload && typeof d.payload === "object" && !Array.isArray(d.payload) ? d.payload : null;
        if (!d?.userId || !r) return llaveNoVale;
        const { local, sucursal, nombre, passwordHash, pinHash } = r;
        if (typeof local !== "string" || typeof sucursal !== "string" || typeof nombre !== "string" || typeof passwordHash !== "string" || typeof pinHash !== "string") {
          return llaveNoVale;
        }
        const llave = await verificarRegistro(web, d.desafio, c.respuesta);
        if (!llave) return llaveNoVale;

        // Todo o nada: si algo de aquí falla, la transacción se deshace y el local sigue sin instalar.
        const hecha = await tx.installation.updateMany({
          where: { tenantId: lugar.tenantId, completedAt: null },
          data: { completedAt: new Date(ahora), completedByName: nombre, codeHash: null, issuedAt: null },
        });
        if (hecha.count !== 1) return YA_INSTALADO;

        await crearLocal(tx, lugar, { tenant: local, sucursal });
        const userId = d.userId;
        await tx.staffUser.create({ data: { id: userId, tenantId: lugar.tenantId, fullName: nombre, role: "ADMIN", pinHash, passwordHash } });
        await tx.staffUserBranch.create({ data: { tenantId: lugar.tenantId, userId, branchId: lugar.branchId } });
        await tx.staffUserChange.create({
          data: { tenantId: lugar.tenantId, userId, kind: "ALTA", toRole: "ADMIN", reason: "Primera administración, en la instalación inicial", byUserId: userId, byName: nombre },
        });
        const llaveId = await guardarLlave(tx, { tenantId: lugar.tenantId, userId, llave, etiqueta: c.etiqueta, ahora });
        const codigos = await reponerCodigos(tx, { tenantId: lugar.tenantId, userId, ahora });

        const secreto = nuevoSecreto();
        const equipo = await tx.device.create({
          data: { tenantId: lugar.tenantId, branchId: lugar.branchId, label: c.equipo, status: "APROBADO", secretHash: huella(secreto), requestedAt: new Date(ahora) },
        });
        const motivo = "Primer equipo del local, aprobado en la instalación inicial";
        await tx.deviceChange.create({ data: { tenantId: lugar.tenantId, deviceId: equipo.id, kind: "ALTA", reason: motivo, byUserId: userId, byName: nombre } });
        await tx.deviceChange.create({ data: { tenantId: lugar.tenantId, deviceId: equipo.id, kind: "APROBADO", reason: motivo, byUserId: userId, byName: nombre } });

        const ctx: Contexto = { tenantId: lugar.tenantId, branchId: lugar.branchId, quien: { userId, deviceId: equipo.id }, ip };
        await auditar(tx, ctx, {
          action: "instalacion.completar",
          entityType: "branch",
          entityId: lugar.branchId,
          after: { local, sucursal, administracion: nombre, equipo: equipo.label },
          reason: "Instalación inicial con el código del servidor",
        });
        await auditar(tx, ctx, { action: "usuario.alta", entityType: "staff_user", entityId: userId, after: { nombre, role: "ADMIN" }, reason: "Primera administración, en la instalación inicial" });
        await auditar(tx, ctx, { action: "usuario.llave", entityType: "staff_user", entityId: userId, after: { llave: llaveId, etiqueta: c.etiqueta }, reason: "Llave de acceso registrada en la instalación inicial" });
        await auditar(tx, ctx, { action: "dispositivo.aprobar", entityType: "device", entityId: equipo.id, after: { status: "APROBADO", label: equipo.label }, reason: motivo });

        return {
          ok: true as const,
          valor: { userId, nombre, credencialEquipo: componer({ tenantId: lugar.tenantId, id: equipo.id, secreto }), codigos },
        };
      });
    },
  };
}
