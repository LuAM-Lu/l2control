"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EstanciaDto, MonitorSnapshotDto } from "@l2/contracts";
import { becomesOrphanAt, epochMs, orphanAfterMs } from "@l2/domain-park";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider";
import { leerSala } from "./parque.acciones";
import { ahoraSegun, esMasNueva, horaDeLectura, type HoraDeLectura } from "./reloj-de-la-sala.ts";

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
 *
 * **El reloj de la sala (B4-13, M-34).** El desfase entre el reloj del equipo y el del servidor se mide al
 * RECIBIR cada lectura, nunca al pintar: una tarjeta que se pinta diez minutos después con una lectura de
 * hace diez minutos se quedaba diez minutos atrás hasta recargar («queda pegado», lo vio el local). Toda la
 * sala late con `useAhoraDeLaSala`, un solo reloj: la cifra, el estado de cada niño, las cuentas de arriba y
 * el orden. Una lectura más vieja que la que ya se tiene (la caché de la navegación) no pisa a la nueva, y
 * al volver a la pestaña o a la red se vuelve a leer.
 */

/** Margen tras el instante en que pasa a huérfana: que el servidor ya lo vea al preguntarle. */
const MARGEN_MS = 1_000;
/** Nunca antes de esto, aunque el reloj del equipo vaya adelantado: no se pregunta en bucle. */
const MINIMO_MS = 5_000;
/** Al volver a la pestaña o a la red, se relee si la última lectura tiene al menos esto. */
const RELEER_AL_VOLVER_MS = 5_000;


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
  /** La hora del servidor de la última lectura y su desfase con este equipo; `null` sin sala. */
  hora: HoraDeLectura | null;
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
  hora: null,
  refrescar: async () => {},
  adoptar: () => {},
  quitar: () => {},
});

export function SalaProvider({ inicial, children }: { inicial: MonitorSnapshotDto | null; children: React.ReactNode }) {
  const [sala, setSala] = useState<MonitorSnapshotDto | null>(inicial);
  const [sinConexion, setSinConexion] = useState(false);
  // En el servidor y al hidratar, la hora es la de la lectura tal cual (sin desfase): las dos pintan lo mismo.
  // Al montar se mide de verdad.
  const [hora, setHora] = useState<HoraDeLectura | null>(() =>
    inicial ? { serverNow: Date.parse(inicial.serverNow), desfase: 0, leidaEn: Date.parse(inicial.serverNow) } : null,
  );
  /** Si quien opera no puede ver la sala, no se le pregunta más al servidor. */
  const vetada = useRef(inicial === null);
  /** La hora del servidor de la lectura más nueva que se aceptó: una más vieja no la pisa. */
  const ultima = useRef(0);

  /** Toma una lectura si es más nueva que la que se tiene. */
  const aceptar = useCallback((nueva: MonitorSnapshotDto, h: HoraDeLectura) => {
    if (!esMasNueva(ultima.current, h.serverNow)) return;
    ultima.current = h.serverNow;
    setSala(nueva);
    setHora(h);
  }, []);

  // Cuando el layout se vuelve a pintar (se navegó o cambió la persona), manda lo que leyó. Lo que trae
  // el layout se acaba de leer en el servidor: se mide con la hora de ahora.
  useEffect(() => {
    vetada.current = inicial === null;
    if (inicial === null) {
      setSala(null);
      setHora(null);
      return;
    }
    const ahora = Date.now();
    aceptar(inicial, horaDeLectura(Date.parse(inicial.serverNow), ahora, ahora));
  }, [inicial?.serverNow, inicial === null, aceptar]);

  const refrescar = useCallback(async () => {
    const pedidaEn = Date.now();
    const r = await leerSala().catch(() => null);
    if (!r) {
      setSinConexion(true);
      return;
    }
    setSinConexion(false);
    if (r.ok) aceptar(r.valor, horaDeLectura(Date.parse(r.valor.serverNow), pedidaEn, Date.now()));
    else if (r.motivo === "NO_PERMITIDO") {
      vetada.current = true;
      setSala(null);
      setHora(null);
    }
  }, [aceptar]);

  // Al volver a la pestaña, al despertar el equipo o al volver la red, se relee: mientras dormía pudo
  // pasar cualquier cosa y el canal tarda en contarlo.
  const leidaEn = hora?.leidaEn ?? 0;
  useEffect(() => {
    const alVolver = (e: Event) => {
      if (vetada.current || document.visibilityState !== "visible") return;
      // Al volver la red se relee siempre: es lo que quita el aviso.
      if (e.type === "online" || Date.now() - leidaEn >= RELEER_AL_VOLVER_MS) void refrescar();
    };
    // Sin red se dice en el acto: el canal tarda en notar que se cayó.
    const alPerderLaRed = () => setSinConexion(true);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    window.addEventListener("pageshow", alVolver);
    window.addEventListener("offline", alPerderLaRed);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("pageshow", alVolver);
      window.removeEventListener("offline", alPerderLaRed);
    };
  }, [leidaEn, refrescar]);

  // Cuándo pasa a huérfana la primera estancia (D9, B4-4): se relee justo entonces, con el desfase medido
  // al recibir la lectura.
  const { ajustes } = useSucursal();
  const desfase = hora?.desfase ?? 0;
  useEffect(() => {
    if (!sala || vetada.current) return;
    const t = proximaHuerfana(sala.sessions, ajustes.horasHuerfana, ajustes.zonaHoraria);
    if (t === null) return;
    const espera = Math.max(MINIMO_MS, t - (Date.now() + desfase) + MARGEN_MS);
    // setTimeout no admite más de ~24,8 días; una estancia pasa a huérfana mucho antes.
    const id = window.setTimeout(() => void refrescar(), Math.min(espera, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [sala, desfase, ajustes.horasHuerfana, ajustes.zonaHoraria, refrescar]);

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

  const valor = useMemo(() => ({ sala, sinConexion, hora, refrescar, adoptar, quitar }), [sala, sinConexion, hora, refrescar, adoptar, quitar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSala(): Valor {
  return useContext(Contexto);
}

/**
 * La hora del servidor ahora, para todo lo que cuenta tiempo en la sala (B4-13): la de la última lectura más lo
 * que corrió el reloj del equipo desde que llegó. Late cada `pasoMs` y en cuanto la pestaña vuelve a verse (en
 * segundo plano el navegador frena los temporizadores). Sin sala, 0.
 */
export function useAhoraDeLaSala(pasoMs = 1000): number {
  const { hora } = useContext(Contexto);
  // Al pintar en el servidor y al hidratar, la hora de la lectura: los dos dicen lo mismo.
  const [ahora, setAhora] = useState(() => hora?.serverNow ?? 0);
  useEffect(() => {
    if (hora === null) return;
    const latir = () => setAhora(ahoraSegun(hora, Date.now()));
    latir();
    const id = window.setInterval(latir, pasoMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") latir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [hora, pasoMs]);
  return hora === null ? 0 : ahora;
}
