"use client";

import { useActorEnSesion } from "../identity/sesion.ts";
import { MediosScreen } from "./MediosScreen.tsx";
import { can } from "@l2/domain-identity";

/**
 * Página de configuración de medios de pago.
 */
export function MediosPage() {
  const actor = useActorEnSesion();

  if (!actor) return null;

  const permiso = can(actor, "catalogo.modificar");
  const puedeModificar = permiso !== "DENEGADO";

  return <MediosScreen puedeModificar={puedeModificar} />;
}
