"use client";

import { can } from "@l2/domain-identity";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useSucursalDeSesion } from "../identity/operador.ts";
import { TasasScreen } from "./TasasScreen.tsx";

/**
 * Tasas de cambio (F3-03 a F3-05), en el servidor desde B2-1. El permiso que se pinta aquí es
 * solo para no ofrecer lo que no se puede: quien decide al capturar y al confirmar es el servidor.
 */
export function TasasPage({ autorizadores }: { autorizadores: { id: string; nombre: string }[] }) {
  const actor = useActorEnSesion();
  const branchId = useSucursalDeSesion();
  if (!actor || !branchId) return null;

  return (
    <TasasScreen permiso={can(actor, "tasa.confirmar", { branchId })} autorizadores={autorizadores} />
  );
}
