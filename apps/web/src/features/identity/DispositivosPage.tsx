"use client";

import { useActorEnSesion } from "./sesion.ts";
import { useOperador } from "./operador.ts";
import { DispositivosScreen } from "./DispositivosScreen.tsx";
import { can } from "@l2/domain-identity";

/**
 * Dispositivos (F2-02), envuelta para el cliente.
 *
 * Existe para que el mapa de pantallas del panel siga siendo de servidor.
 */
export function DispositivosPage() {
  const actor = useActorEnSesion();
  const operador = useOperador();

  if (!actor || !operador) return null;

  const puedeGestionar = can(actor, "usuarios.gestionar", { branchId: "b1" }) === "PERMITIDO";

  return <DispositivosScreen autor={{ id: actor.id, nombre: operador.nombre }} puedeGestionar={puedeGestionar} />;
}
