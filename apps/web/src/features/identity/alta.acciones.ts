"use server";

import type { AltaCompletada, Desafio, OpcionesDeRegistro } from "@l2/application";
import type { EnlaceAbiertoDto, Resultado } from "@l2/contracts";
import { aplicacion } from "../../servidor/aplicacion";
import { ipDeLaPeticion } from "../../servidor/sesion";

/**
 * El alta de credenciales con un enlace (ADR-020, punto 4). Quien la hace no tiene sesión: lo que
 * la autoriza es el enlace, que llega en el cuerpo de la petición (vive en el fragmento de la
 * dirección, que el navegador no envía) y que el servidor comprueba entero cada vez. Ni el enlace
 * ni la contraseña se registran.
 */

/** De quién es el enlace y para qué. `null` si ya no vale: no se dice por qué. */
export async function abrirEnlace(enlace: unknown): Promise<EnlaceAbiertoDto | null> {
  return (await aplicacion()).enlaces.abrir(enlace, Date.now());
}

/** Primer paso: la contraseña. Devuelve el desafío para registrar la llave. */
export async function prepararAlta(enlace: unknown, datos: unknown): Promise<Resultado<Desafio<OpcionesDeRegistro>>> {
  return (await aplicacion()).enlaces.preparar({ enlace, datos, ahora: Date.now() });
}

/** Segundo paso: la llave. En un alta devuelve los códigos de recuperación, UNA vez. */
export async function completarAlta(enlace: unknown, datos: unknown): Promise<Resultado<AltaCompletada>> {
  return (await aplicacion()).enlaces.completar({ enlace, datos, ip: await ipDeLaPeticion(), ahora: Date.now() });
}
