"use client";

import type { BranchAccessDto, Resultado } from "@l2/contracts";
import { useActorEnSesion } from "./sesion.ts";
import { useOperador } from "./operador.ts";
import { AccesosScreen } from "./AccesosScreen.tsx";
import { SinDatos } from "./ConfirmarIdentidad";

/**
 * Roles y accesos (F2-05, F2-13). Los ajustes los manda el servidor, que también los impone:
 * guardar un ajuste cambia el actor de quien lo tenga en su siguiente petición. Sin sesión no
 * se pinta nada.
 */
export function AccesosPage({ accesos }: { accesos: Resultado<BranchAccessDto> }) {
  const actor = useActorEnSesion();
  const operador = useOperador();
  if (!actor || !operador) return null;
  if (!accesos.ok) return <SinDatos rechazo={accesos} />;
  return <AccesosScreen autor={{ id: actor.id, nombre: operador.nombre }} branchId={accesos.valor.branchId} inicial={accesos.valor} />;
}
