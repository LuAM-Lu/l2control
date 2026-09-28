"use client";

import { useCallback, useState } from "react";
import type { DirectorioRepresentantesDto, RepresentanteCommand } from "@l2/contracts";
import { EmptyState } from "@l2/ui";
import { TriangleAlert } from "lucide-react";
import { useActorEnSesion } from "../identity/sesion.ts";
import { corregirDirectorio } from "./parque.acciones";
import { RepresentantesScreen } from "./RepresentantesScreen.tsx";

/**
 * Directorio de familias (F5-01), del servidor desde B4-1.
 *
 * La página lo lee en el servidor y aquí se corrige con la acción: el servidor revalida, audita y
 * devuelve el directorio como quedó. `null` si quien entra no puede ver contactos o el servidor no
 * lo dio: se dice, no se enseña una lista vacía que parezca un local sin familias.
 */
export function RepresentantesPage({ inicial }: { inicial: DirectorioRepresentantesDto | null }) {
  const actor = useActorEnSesion();
  const [directorio, setDirectorio] = useState(inicial);

  const corregir = useCallback(async (cmd: RepresentanteCommand): Promise<string | null> => {
    const r = await corregirDirectorio(cmd).catch(() => null);
    if (!r) return "Sin conexión con el servidor: el cambio no se guardó.";
    if (!r.ok) return r.mensaje;
    setDirectorio(r.valor);
    return null;
  }, []);

  if (!actor) return null;
  if (!directorio) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} aria-hidden="true" />}
        title="El directorio no está disponible"
        hint="Tu puesto no puede ver los contactos de las familias, o el servidor no respondió. Vuelve a cargar la página."
      />
    );
  }
  return <RepresentantesScreen directorio={directorio} corregir={corregir} />;
}
