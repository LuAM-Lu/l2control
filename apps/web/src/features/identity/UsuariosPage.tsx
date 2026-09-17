"use client";

import { can, type Actor } from "@l2/domain-identity";
import { UsuariosScreen } from "./UsuariosScreen.tsx";
import type { UserSummaryDto } from "@l2/contracts";
import { useActorEnSesion } from "./sesion.ts";
import { useOperador } from "./operador.ts";

/**
 * Página de usuarios y permisos (F2-11), en el cliente.
 *
 * Decide QUIÉN puede cambiar permisos antes de pintar nada: la pantalla recibe
 * `puedeGestionar` ya resuelto por la matriz, con la sucursal como parte del
 * permiso. Sin él, se ve pero no se edita — fail-closed.
 *
 * El actor viaja entero además del booleano, porque cada cambio del equipo se
 * vuelve a juzgar en el dominio (`revisarCambio`): que la pantalla enseñe el
 * botón no es que la operación esté permitida.
 */
export function UsuariosPage({ usuarios }: { usuarios: readonly UserSummaryDto[] }) {
  // TODO(F2-12/backend): la sesión vendrá del servidor. La forma ya es la
  // definitiva, así que ese cambio no toca la pantalla (§11.4).
  const actor: Actor | null = useActorEnSesion();
  const operador = useOperador();

  // La cáscara del panel ya exige sesión (GuardiaAcceso): sin ella no se
  // llega aquí. Se comprueba igual, y sin inventar un actor: firmar un cambio
  // con una identidad falsa es peor que no pintar nada.
  if (!actor || !operador) return null;

  const puedeGestionar = can(actor, "usuarios.gestionar", { branchId: "b1" }) === "PERMITIDO";

  return (
    <UsuariosScreen
      usuarios={usuarios}
      autor={{ id: actor.id, nombre: operador.nombre }}
      actor={actor}
      branchId="b1"
      puedeGestionar={puedeGestionar}
    />
  );
}
