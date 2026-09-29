"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EstanciaDto, MonitorSnapshotDto } from "@l2/contracts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerSala } from "./parque.acciones";

/**
 * La sala del parque, compartida por las estaciones — en el servidor desde B4-2.
 *
 * Los niños dentro los dice el servidor, con su hora (ADR-010): entrada, sala, salida, caja, salón e
 * Inicio leen la misma. El layout la lee en el servidor; aquí se vuelve a leer cuando el canal en
 * vivo dice que la sala cambió (B5-1), en menos de 2 s, sin sondeo. Nada se guarda en el navegador.
 *
 * Una entrada o una salida de ESTE equipo se ven al momento (`adoptar`, `quitar`); lo de los demás
 * equipos llega por el canal.
 */

type Valor = Readonly<{
  /** La sala con la hora del servidor, o `null` si no se tiene: sin permiso o sin servidor. */
  sala: MonitorSnapshotDto | null;
  /** La última lectura no llegó: lo que se enseña puede estar atrasado. */
  sinConexion: boolean;
  /** Pregunta ya al servidor. */
  refrescar: () => Promise<void>;
  /** Añade las estancias que acaba de abrir este equipo (o sustituye las que ya estaban). */
  adoptar: (estancias: readonly EstanciaDto[]) => void;
  /** Quita las estancias que este equipo acaba de cerrar. */
  quitar: (ids: readonly string[]) => void;
}>;

const Contexto = createContext<Valor>({
  sala: null,
  sinConexion: false,
  refrescar: async () => {},
  adoptar: () => {},
  quitar: () => {},
});

export function SalaProvider({ inicial, children }: { inicial: MonitorSnapshotDto | null; children: React.ReactNode }) {
  const [sala, setSala] = useState<MonitorSnapshotDto | null>(inicial);
  const [sinConexion, setSinConexion] = useState(false);
  /** Si quien opera no puede ver la sala, no se le pregunta más al servidor. */
  const vetada = useRef(inicial === null);

  // Cuando el layout se vuelve a pintar (se navegó o cambió la persona), manda lo que leyó.
  useEffect(() => {
    vetada.current = inicial === null;
    setSala(inicial);
  }, [inicial?.serverNow, inicial === null]);

  const refrescar = useCallback(async () => {
    const r = await leerSala().catch(() => null);
    if (!r) {
      setSinConexion(true);
      return;
    }
    setSinConexion(false);
    if (r.ok) setSala(r.valor);
    else if (r.motivo === "NO_PERMITIDO") {
      vetada.current = true;
      setSala(null);
    }
  }, []);

  // En vivo (B5-1). Un fallo de red no borra lo que se tenía: se dice, y se vuelve a leer con el
  // siguiente cambio o al reconectarse.
  useAlCambiar(["sala"], () => {
    if (!vetada.current) void refrescar();
  });

  const adoptar = useCallback((estancias: readonly EstanciaDto[]) => {
    const ids = new Set(estancias.map((e) => e.id));
    setSala((prev) => prev && { ...prev, sessions: [...prev.sessions.filter((s) => !ids.has(s.id)), ...estancias] });
  }, []);

  const quitar = useCallback((cerradas: readonly string[]) => {
    const ids = new Set(cerradas);
    setSala((prev) => prev && { ...prev, sessions: prev.sessions.filter((s) => !ids.has(s.id)) });
  }, []);

  const valor = useMemo(() => ({ sala, sinConexion, refrescar, adoptar, quitar }), [sala, sinConexion, refrescar, adoptar, quitar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSala(): Valor {
  return useContext(Contexto);
}
