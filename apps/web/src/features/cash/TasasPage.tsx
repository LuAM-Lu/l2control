"use client";

import { useActorEnSesion } from "../identity/sesion.ts";
import { useOperador } from "../identity/operador.ts";
import { TasasScreen } from "./TasasScreen.tsx";
import { can } from "@l2/domain-identity";

/**
 * Página de administración de tasas de cambio (F3-03, F3-04, F3-05).
 */
export function TasasPage() {
  const actor = useActorEnSesion();
  const operador = useOperador();

  if (!actor || !operador) return null;

  const permiso = can(actor, "tasa.confirmar");
  const puedeConfirmar = permiso !== "DENEGADO";

  return <TasasScreen puedeConfirmar={puedeConfirmar} actorName={operador.nombre} />;
}
