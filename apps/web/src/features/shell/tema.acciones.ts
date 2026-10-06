"use server";

import { refresh } from "next/cache";
import type { Resultado } from "@l2/contracts";
import { esTema, guardarTemaDelEquipo, type Tema } from "../../servidor/tema";

/**
 * Cambia el tema de ESTE equipo (oscuro o claro). No pide sesión ni permiso: es cómo se ve la
 * pantalla en este navegador, también en el acceso, y no toca ningún dato del local.
 */
export async function cambiarTema(tema: unknown): Promise<Resultado<{ tema: Tema }>> {
  if (!esTema(tema)) return { ok: false, motivo: "INVALIDO", mensaje: "Ese tema no existe." };
  await guardarTemaDelEquipo(tema);
  refresh();
  return { ok: true, valor: { tema } };
}
