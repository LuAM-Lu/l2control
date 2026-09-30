"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EstanciaDto, MonitorSnapshotDto } from "@l2/contracts";
import { becomesOrphanAt, epochMs, orphanAfterMs } from "@l2/domain-park";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider";
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
 *
 * Lo único que cambia sin que nadie haga nada es que una estancia pase a huérfana (D9): nada lo avisa,
 * solo pasa el tiempo. Así que se vuelve a leer una vez, justo en ese instante (B4-4), con las horas y
 * la zona de los ajustes de la sucursal y el reloj del servidor. Un temporizador, no un sondeo.
 */

/** Margen tras el instante en que pasa a huérfana: que el servidor ya lo vea al preguntarle. */
const MARGEN_MS = 1_000;
/** Nunca antes de esto, aunque el reloj del equipo vaya adelantado: no se pregunta en bucle. */
const MINIMO_MS = 5_000;

/** El primer instante (del servidor) en que alguna de estas estancias pasa a huérfana. */
export function proximaHuerfana(sesiones: readonly EstanciaDto[], horas: number, zona: string): number | null {
  const umbral = orphanAfterMs(horas);
  let primera: number | null = null;
  for (const s of sesiones) {
    const desde = Date.parse(s.startedAt);
    const manana = startOfDay(addDays(calendarDay(s.startedAt, zona), 1), zona);
    const t = becomesOrphanAt(epochMs(desde), umbral, epochMs(manana));
    if (primera === null || t < primera) primera = t;
  }
  return primera;
}

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

  // Cuándo pasa a huérfana la primera estancia (D9, B4-4): se relee justo entonces. El desfase entre
  // el reloj del equipo y el del servidor se mide con la hora que trajo la lectura.
  const { ajustes } = useSucursal();
  useEffect(() => {
    if (!sala || vetada.current) return;
    const t = proximaHuerfana(sala.sessions, ajustes.horasHuerfana, ajustes.zonaHoraria);
    if (t === null) return;
    const desfase = Date.parse(sala.serverNow) - Date.now();
    const espera = Math.max(MINIMO_MS, t - (Date.now() + desfase) + MARGEN_MS);
    // setTimeout no admite más de ~24,8 días; una estancia pasa a huérfana mucho antes.
    const id = window.setTimeout(() => void refrescar(), Math.min(espera, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [sala, ajustes.horasHuerfana, ajustes.zonaHoraria, refrescar]);

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
