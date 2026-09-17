"use client";

import { useActorEnSesion } from "./sesion.ts";
import { useOperador } from "./operador.ts";
import { AccesosScreen } from "./AccesosScreen.tsx";

/**
 * Roles y accesos (F2-05, F2-13), envuelta para el cliente.
 *
 * Existe para que el mapa de pantallas del panel siga siendo de servidor: los
 * ganchos de sesión solo se pueden llamar en el cliente, y meterlos en el mapa
 * obligaría a convertir la ruta entera.
 *
 * Quien ajusta los roles del local firma cada cambio, así que el autor sale de
 * la sesión y nunca de una constante. La cáscara del panel ya exige sesión
 * (GuardiaAcceso): si no la hubiera, no se pinta nada — una identidad
 * inventada en un asiento de auditoría es peor que una pantalla vacía.
 */
export function AccesosPage({ branchId }: { branchId: string }) {
  const actor = useActorEnSesion();
  const operador = useOperador();

  if (!actor || !operador) return null;

  return <AccesosScreen autor={{ id: actor.id, nombre: operador.nombre }} branchId={branchId} />;
}
