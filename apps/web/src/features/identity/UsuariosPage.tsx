"use client";

import { can } from "@l2/domain-identity";
import type { Resultado, UsersDirectoryDto } from "@l2/contracts";
import { UsuariosScreen } from "./UsuariosScreen.tsx";
import { SinDatos } from "./ConfirmarIdentidad";
import { useActorEnSesion } from "./sesion.ts";
import { useOperador, useSucursalDeSesion } from "./operador.ts";

/**
 * Usuarios y permisos (F2-10, F2-11). El directorio lo manda el servidor y cada cambio lo juzga
 * y lo guarda él (las cinco puertas del dominio, sobre el equipo real). Sin sesión no se pinta
 * nada: una identidad inventada en un asiento es peor que una pantalla vacía.
 */
export function UsuariosPage({ directorio }: { directorio: Resultado<UsersDirectoryDto> }) {
  const actor = useActorEnSesion();
  const operador = useOperador();
  const branchId = useSucursalDeSesion();
  if (!actor || !operador || !branchId) return null;
  if (!directorio.ok) return <SinDatos rechazo={directorio} />;

  return (
    <UsuariosScreen
      usuarios={directorio.valor.users}
      autor={{ id: actor.id, nombre: operador.nombre }}
      branchId={branchId}
      puedeGestionar={can(actor, "usuarios.gestionar", { branchId }) === "PERMITIDO"}
    />
  );
}
