"use client";

import type { Actor } from "@l2/domain-identity";
import { useActorDelServidor } from "./operador.ts";

/**
 * Quién está operando este equipo, en la forma que entiende el dominio.
 *
 * Desde B1-5 es el actor que calculó el SERVIDOR al leer la sesión: rol, sucursales,
 * concesiones y revocaciones de la persona y ajustes de su rol en la sucursal. La web ya no lo
 * reconstruye con datos propios, así que lo que se pinta coincide con lo que el servidor exigirá.
 * Devuelve `null` si no ha entrado nadie.
 */
export function useActorEnSesion(): Actor | null {
  return useActorDelServidor();
}
