"use client";

import { can } from "@l2/domain-identity";
import type { CredencialesDePersonaDto, Resultado, UsersDirectoryDto } from "@l2/contracts";
import { UsuariosScreen } from "./UsuariosScreen.tsx";
import { SinDatos } from "./ConfirmarIdentidad";
import { useActorEnSesion } from "./sesion.ts";
import { useOperador, useSucursalDeSesion } from "./operador.ts";

/**
 * Usuarios y permisos (F2-10, F2-11). El directorio lo manda el servidor y cada cambio lo juzga
 * y lo guarda él (las cinco puertas del dominio, sobre el equipo real). Sin sesión no se pinta
 * nada: una identidad inventada en un asiento es peor que una pantalla vacía.
 */
export function UsuariosPage({
  directorio,
  credenciales,
}: {
  directorio: Resultado<UsersDirectoryDto>;
  /** Las credenciales de administración de cada persona, sin secretos (ADR-020). Mismo permiso que el directorio. */
  credenciales: Resultado<CredencialesDePersonaDto[]>;
}) {
  const actor = useActorEnSesion();
  const operador = useOperador();
  const branchId = useSucursalDeSesion();
  if (!actor || !operador || !branchId) return null;
  if (!directorio.ok) return <SinDatos rechazo={directorio} />;
  if (!credenciales.ok) return <SinDatos rechazo={credenciales} />;

  return (
    <UsuariosScreen
      usuarios={directorio.valor.users}
      credenciales={credenciales.valor}
      autor={{ id: actor.id, nombre: operador.nombre }}
      branchId={branchId}
      puedeGestionar={can(actor, "usuarios.gestionar", { branchId }) === "PERMITIDO"}
    />
  );
}
