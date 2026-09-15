"use client";

import type { Actor } from "@l2/domain-identity";
import { useAjustes } from "./accesos.ts";
import { useOperador } from "./operador.ts";
import { actorDe } from "./visibilidad.ts";

/**
 * Quién está operando este equipo, en la forma que entiende el dominio.
 *
 * Junta las dos mitades —la sesión y los ajustes que la sucursal le ha hecho a
 * su rol— en un solo sitio, para que ninguna pantalla se olvide de una de
 * ellas. Devuelve `null` si no ha entrado nadie.
 *
 * Vive en su propio archivo y no en `accesos.ts` para no cerrar un ciclo:
 * `visibilidad` necesita los ajustes, así que no puede depender de quien los
 * junta con la sesión.
 */
export function useActorEnSesion(): Actor | null {
  const operador = useOperador();
  const ajustes = useAjustes();
  return operador ? actorDe(operador, ajustes) : null;
}
