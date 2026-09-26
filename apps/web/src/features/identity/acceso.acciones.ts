"use server";

import { refresh } from "next/cache";
import type { Bloqueo } from "@l2/application";
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
  | Readonly<{ ok: true; valor: { nombre: string } }>
  | (Rechazo & Readonly<{ bloqueo?: Bloqueo }>);

/** Entrar con PIN. El PIN viaja en el cuerpo del POST (nunca en la URL) y no se registra. */
export async function entrar(userId: unknown, pin: unknown): Promise<ResultadoEntrar> {
  if (typeof userId !== "string" || typeof pin !== "string") {
    return { ok: false, motivo: "INVALIDO", mensaje: "Datos de acceso incompletos." };
  }
  const r = await (await aplicacion()).sesiones.entrar({
    dispositivo: await credencialEquipo(),
    userId,
    pin,
    ip: await ipDeLaPeticion(),
    ahora: Date.now(),
  });
  if (!r.ok) return r;
  await guardarCookieSesion(r.credencial);
  refresh();
  return { ok: true, valor: { nombre: r.sesion.nombre } };
}

/** Salir: cierra la sesión EN EL SERVIDOR y borra la cookie. El corte Z también la cierra. */
export async function salir(motivo: "SALIDA" | "CORTE_Z" = "SALIDA"): Promise<void> {
  await (await aplicacion()).sesiones.salir(await credencialSesion(), motivo === "CORTE_Z" ? "CORTE_Z" : "SALIDA", await ipDeLaPeticion());
  await borrarCookieSesion();
  refresh();
}
