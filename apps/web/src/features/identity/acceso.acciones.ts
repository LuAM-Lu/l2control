"use server";

import { refresh } from "next/cache";
import type { Bloqueo, Desafio, OpcionesDeFirma } from "@l2/application";
import type { Actor } from "@l2/domain-identity";
import type { Rechazo, Resultado } from "@l2/contracts";
import { aplicacion, log } from "../../servidor/aplicacion";
import { entorno } from "../../servidor/entorno";
import {
  borrarCookieSesion,
  credencialEquipo,
  credencialSesion,
  guardarCookieEquipo,
  guardarCookieSesion,
  ipDeLaPeticion,
} from "../../servidor/sesion";

/**
 * El acceso (F2-02, F2-03, ADR-018). Lo que llega del navegador es `unknown` y el servidor lo
 * comprueba todo: el equipo sale de SU cookie, nunca de lo que diga la página.
 */

/** Un equipo nuevo pide su registro. Queda PENDIENTE hasta que administración lo apruebe. */
export async function solicitarRegistro(nombre: unknown): Promise<Resultado<{ estado: "PENDIENTE" }>> {
  const e = entorno();
  const r = await (await aplicacion()).dispositivos.solicitar(
    { tenantId: e.L2_TENANT_ID, branchId: e.L2_BRANCH_ID },
    nombre,
    await ipDeLaPeticion(),
  );
  if (!r.ok) return r;
  await guardarCookieEquipo(r.valor.credencial);
  log().info({ deviceId: r.valor.dispositivo.estado === "PENDIENTE" ? r.valor.dispositivo.id : null }, "equipo pide registro");
  refresh();
  return { ok: true, valor: { estado: "PENDIENTE" } };
}

export type ResultadoEntrar =
  | Readonly<{ ok: true; valor: { nombre: string; actor: Actor } }>
  | (Rechazo & Readonly<{ bloqueo?: Bloqueo; debeElegirPin?: true }>);

/**
 * Entrar con PIN. El PIN viaja en el cuerpo del POST (nunca en la URL) y no se registra. Con un
 * PIN temporal, el servidor pide `pinNuevo` antes de abrir la sesión.
 */
export async function entrar(userId: unknown, pin: unknown, pinNuevo?: unknown): Promise<ResultadoEntrar> {
  if (typeof userId !== "string" || typeof pin !== "string" || (pinNuevo !== undefined && typeof pinNuevo !== "string")) {
    return { ok: false, motivo: "INVALIDO", mensaje: "Datos de acceso incompletos." };
  }
  const r = await (await aplicacion()).sesiones.entrar({
    dispositivo: await credencialEquipo(),
    userId,
    pin,
    pinNuevo,
    ip: await ipDeLaPeticion(),
    ahora: Date.now(),
  });
  if (!r.ok) return r;
  await guardarCookieSesion(r.credencial);
  refresh();
  return { ok: true, valor: { nombre: r.sesion.nombre, actor: r.sesion.actor } };
}

/** Salir: cierra la sesión EN EL SERVIDOR y borra la cookie. El corte Z también la cierra. */
export async function salir(motivo: "SALIDA" | "CORTE_Z" = "SALIDA"): Promise<void> {
  await (await aplicacion()).sesiones.salir(await credencialSesion(), motivo === "CORTE_Z" ? "CORTE_Z" : "SALIDA", await ipDeLaPeticion());
  await borrarCookieSesion();
  refresh();
}

/**
 * El desafío para firmar con la llave de acceso de quien tiene ESTA sesión (ADR-020). No es un
 * secreto: es lo que el navegador le pasa a Windows Hello o al teléfono para que firme.
 */
export async function desafioParaElevar(): Promise<Resultado<Desafio<OpcionesDeFirma>>> {
  return (await aplicacion()).elevacion.desafio({ sesion: await credencialSesion(), ahora: Date.now() });
}

/**
 * Confirmar identidad con la contraseña y la llave de acceso, o un código de recuperación
 * (F2-04): eleva ESTA sesión durante un rato para configuración, precios, personas y reportes
 * globales. Nada de lo tecleado se registra.
 */
export async function elevar(contrasena: unknown, factor: unknown): Promise<Resultado<{ elevadaHasta: string }> & { bloqueo?: Bloqueo }> {
  const r = await (await aplicacion()).elevacion.elevar({
    sesion: await credencialSesion(),
    contrasena,
    factor,
    ip: await ipDeLaPeticion(),
    ahora: Date.now(),
  });
  if (r.ok) refresh();
  return r;
}

/** El desafío para aprobar ESTE equipo con una llave: la que responda dirá de quién es. */
export async function desafioParaAprobarEsteEquipo(): Promise<Resultado<Desafio<OpcionesDeFirma>>> {
  return (await aplicacion()).elevacion.desafioDeEquipo({ dispositivo: await credencialEquipo(), ahora: Date.now() });
}

/**
 * Aprobar ESTE equipo con las credenciales de administración (M-7): la contraseña y la llave de
 * acceso (o un código de recuperación) de quien gestiona personas. Resuelve el equipo perdido sin
 * la consola. El equipo sale de su cookie; nada de lo tecleado se registra.
 */
export async function aprobarEsteEquipo(
  contrasena: unknown,
  factor: unknown,
): Promise<Resultado<{ label: string; aprobadoPor: string }> & { bloqueo?: Bloqueo }> {
  const r = await (await aplicacion()).elevacion.aprobarEquipo({
    dispositivo: await credencialEquipo(),
    contrasena,
    factor,
    ip: await ipDeLaPeticion(),
    ahora: Date.now(),
  });
  if (r.ok) {
    log().info({ aprobadoPor: "credenciales de administración" }, "equipo aprobado desde sí mismo");
    refresh();
  }
  return r;
}

/** Renovar la solicitud de registro de ESTE equipo cuando caducó (M-7). */
export async function renovarSolicitud(): Promise<Resultado<{ estado: "PENDIENTE" }>> {
  const r = await (await aplicacion()).dispositivos.renovar(await credencialEquipo(), await ipDeLaPeticion());
  if (r.ok) refresh();
  return r;
}
