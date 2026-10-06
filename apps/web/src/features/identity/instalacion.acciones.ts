"use server";

import { refresh } from "next/cache";
import type { Bloqueo, Desafio, OpcionesDeRegistro } from "@l2/application";
import type { Resultado } from "@l2/contracts";
import { aplicacion, contextoDelLocal, log } from "../../servidor/aplicacion";
import { guardarCookieEquipo, guardarCookieSesion, ipDeLaPeticion } from "../../servidor/sesion";

/**
 * «Instalar L2 Control» (ADR-020, M-12, JORNADA §2). Con la base vacía no hay sesión ni equipo:
 * lo único que autoriza estos dos pasos es el código de instalación que el servidor escribió en
 * su registro. El local sale del entorno del servidor, nunca de la página. Nada de lo tecleado
 * (código, contraseña, PIN) se registra.
 */

const lugar = () => {
  const { tenantId, branchId } = contextoDelLocal();
  return { tenantId, branchId };
};

/** Primer paso: valida el código y los datos, y devuelve el desafío para registrar la llave. */
export async function prepararInstalacion(datos: unknown): Promise<Resultado<Desafio<OpcionesDeRegistro>> & { bloqueo?: Bloqueo }> {
  const r = await (await aplicacion()).instalacion.preparar({ lugar: lugar(), datos, ahora: Date.now() });
  if (!r.ok && r.motivo === "NO_PERMITIDO") log().warn({ ip: await ipDeLaPeticion(), bloqueado: r.bloqueo?.bloqueado ?? false }, "instalación: código rechazado");
  return r;
}

/**
 * Segundo paso: con la llave registrada crea el local, la primera administración y este equipo,
 * y entra. Devuelve los códigos de recuperación, que se enseñan UNA vez. `pin` es el que la
 * persona acaba de elegir: sirve solo para abrirle la sesión sin pedírselo otra vez.
 */
export async function completarInstalacion(datos: unknown, pin: unknown): Promise<Resultado<{ nombre: string; codigos: readonly string[] }> & { bloqueo?: Bloqueo }> {
  const app = await aplicacion();
  const ip = await ipDeLaPeticion();
  const r = await app.instalacion.completar({ lugar: lugar(), datos, ip, ahora: Date.now() });
  if (!r.ok) {
    if (r.motivo === "NO_PERMITIDO") log().warn({ ip }, "instalación: no se completó");
    return r;
  }
  await guardarCookieEquipo(r.valor.credencialEquipo);
  log().info({ administracion: r.valor.nombre }, "local instalado");
  // Si el PIN no abre la sesión (no debería), la instalación ya está hecha: entrará por el acceso.
  if (typeof pin === "string") {
    const s = await app.sesiones.entrar({ dispositivo: r.valor.credencialEquipo, userId: r.valor.userId, pin, ip, ahora: Date.now() });
    if (s.ok) await guardarCookieSesion(s.credencial);
  }
  refresh();
  return { ok: true, valor: { nombre: r.valor.nombre, codigos: r.valor.codigos } };
}
