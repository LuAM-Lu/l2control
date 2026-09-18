"use client";

import { useActorEnSesion } from "../identity/sesion.ts";
import { useRepresentantes } from "./RepresentantesProvider.tsx";
import { RepresentantesScreen } from "./RepresentantesScreen.tsx";

/**
 * Directorio de familias (F5-01), envuelta para el cliente.
 *
 * Existe para que el mapa de pantallas del panel siga siendo de servidor.
 * La cáscara del panel ya exige sesión: si no la hubiera, no se pinta nada.
 */
export function RepresentantesPage() {
  const actor = useActorEnSesion();
  const { directorio, corregir } = useRepresentantes();

  if (!actor) return null;

  return <RepresentantesScreen directorio={directorio} corregir={corregir} />;
}
