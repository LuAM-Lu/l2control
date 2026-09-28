"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EstanciaDto, MonitorSnapshotDto } from "@l2/contracts";
import { leerSala } from "./parque.acciones";

/**
 * La sala del parque, compartida por las estaciones — en el servidor desde B4-2.
 *
 * Los niños dentro los dice el servidor, con su hora (ADR-010): entrada, sala, salida, caja, salón e
 * Inicio leen la misma. El layout la lee en el servidor; aquí se pregunta cada 5 s y al volver el
 * foco, hasta que el tiempo real (B5-1) la empuje. Nada se guarda en el navegador.
 *
 * Una entrada o una salida de ESTE equipo se ven al momento (`adoptar`, `quitar`) sin esperar al
 * sondeo; lo de los demás equipos llega con él.
 */

/** Cada cuánto se pregunta al servidor por la sala. */
const SONDEO_MS = 5_000;

type Valor = Readonly<{
  /** La sala con la hora del servidor, o `null` si no se tiene: sin permiso o sin servidor. */
  sala: MonitorSnapshotDto | null;
  /** El último sondeo no llegó: lo que se enseña puede estar atrasado. */
  sinConexion: boolean;
  /** Pregunta ya, sin esperar al sondeo. */
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

  // El sondeo. Un fallo de red no borra lo que se tenía: se dice, y se vuelve a preguntar.
  useEffect(() => {
    let enCurso = false;
    const preguntar = async () => {
      if (enCurso || vetada.current || document.visibilityState === "hidden") return;
      enCurso = true;
      try {
        await refrescar();
      } finally {
        enCurso = false;
      }
    };
    const id = window.setInterval(() => void preguntar(), SONDEO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void preguntar();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [refrescar]);

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
