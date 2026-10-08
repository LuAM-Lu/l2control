"use server";

import type { Resultado } from "@l2/contracts";
import { esVistaDePrecios, guardarVistaDePrecios, type VistaDePrecios } from "../../servidor/vista-precios";

/**
 * Cambia cómo enseña los precios la carta de la caja en ESTE equipo (T-15, P-12). No pide permiso: es cómo se ve la
 * pantalla en este navegador y no toca ningún dato del local.
 */
export async function cambiarVistaDePrecios(vista: unknown): Promise<Resultado<{ vista: VistaDePrecios }>> {
  if (!esVistaDePrecios(vista)) return { ok: false, motivo: "INVALIDO", mensaje: "Esa vista de precios no existe." };
  await guardarVistaDePrecios(vista);
  return { ok: true, valor: { vista } };
}
