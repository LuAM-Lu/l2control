"use client";

import { can } from "@l2/domain-identity";
import type { PaginaDeTasasDto, Resultado } from "@l2/contracts";
import { SinDatos } from "../identity/ConfirmarIdentidad";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useSucursalDeSesion } from "../identity/operador.ts";
import { TasasScreen } from "./TasasScreen.tsx";

/**
 * Tasas de cambio (F3-03 a F3-05), en el servidor desde B2-1. El permiso que se pinta aquí es
 * solo para no ofrecer lo que no se puede: quien decide al capturar y al confirmar es el servidor.
 */
export function TasasPage({ autorizadores, historial }: { autorizadores: { id: string; nombre: string }[]; historial: Resultado<PaginaDeTasasDto> }) {
  const actor = useActorEnSesion();
  const branchId = useSucursalDeSesion();
  if (!actor || !branchId) return null;
  if (!historial.ok) return <SinDatos rechazo={historial} />;

  return (
    <TasasScreen permiso={can(actor, "tasa.confirmar", { branchId })} autorizadores={autorizadores} inicial={historial.valor} />
  );
}
