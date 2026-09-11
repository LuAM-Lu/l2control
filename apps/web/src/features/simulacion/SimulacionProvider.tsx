"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { escenarioPorId, type Escenario } from "./escenarios.ts";
import { ESTADO_VACIO, aplicar, reconstruir, type EstadoLocal } from "./proyeccion.ts";
import { ahoraSimulado, arrancar, conVelocidad, pausar, reanudar, vencidos, type Reloj } from "./motor.ts";

/**
 * El simulador de operación — F1-19, DEC-22.
 *
 * Reproduce una tarde del local como eventos del catálogo (F1-20) y mantiene
 * el estado del local para que las pantallas lo lean. Solo para demostración
 * y desarrollo: `NEXT_PUBLIC_SIMULADOR=off` lo apaga.
 *
 * VARIAS VENTANAS, UNA OPERACIÓN
 * La pestaña donde se pulsa «reproducir» lleva el reloj; las demás lo siguen
 * por un `BroadcastChannel`. Por el canal NO viajan eventos: solo el
 * escenario, cuántos eventos van y la hora simulada. Cada pestaña repite
 * los eventos de su propia copia del escenario —los mismos, porque son
 * deterministas y están validados contra el contrato— y reconstruye el local.
 * Una ventana que se abre tarde se pone al día sola.
 */

const CANAL = "l2-simulacion";
const TIC_MS = 250;

type Mensaje =
  | { tipo: "hola" }
  | { tipo: "tic"; escenarioId: string; indice: number; simNow: number; velocidad: number; pausado: boolean }
  | { tipo: "detenida" };

export type Simulacion = Readonly<{
  activa: boolean;
  escenario: Escenario | null;
  /** Instante simulado actual (ms). */
  simNow: number;
  estado: EstadoLocal;
  velocidad: number;
  pausado: boolean;
  /** Si esta pestaña lleva el reloj. */
  control: boolean;
  iniciar: (id: string) => void;
  alternarPausa: () => void;
  cambiarVelocidad: (v: number) => void;
  detener: () => void;
}>;

const INACTIVA: Simulacion = {
  activa: false,
  escenario: null,
  simNow: 0,
  estado: ESTADO_VACIO,
  velocidad: 10,
  pausado: false,
  control: false,
  iniciar: () => {},
  alternarPausa: () => {},
  cambiarVelocidad: () => {},
  detener: () => {},
};

const Contexto = createContext<Simulacion>(INACTIVA);

export function SimulacionProvider({ children }: { children: React.ReactNode }) {
  const [escenarioId, setEscenarioId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoLocal>(ESTADO_VACIO);
  const [simNow, setSimNow] = useState(0);
  const [velocidad, setVelocidad] = useState(10);
  const [pausado, setPausado] = useState(false);
  const [control, setControl] = useState(false);

  const reloj = useRef<Reloj | null>(null);
  const indice = useRef(0);
  const actual = useRef<string | null>(null);
  const canal = useRef<BroadcastChannel | null>(null);

  const escenario = escenarioPorId(escenarioId);

  const emitir = useCallback((m: Mensaje) => canal.current?.postMessage(m), []);

  /** Lleva el local al índice pedido, repitiendo eventos de la copia propia. */
  const alcanzar = useCallback((id: string, hasta: number) => {
    const esc = escenarioPorId(id);
    if (!esc) return;
    if (actual.current !== id || hasta < indice.current) {
      actual.current = id;
      setEscenarioId(id);
      setEstado(reconstruir(esc.eventos.slice(0, hasta)));
    } else if (hasta > indice.current) {
      const nuevos = esc.eventos.slice(indice.current, hasta);
      setEstado((prev) => nuevos.reduce(aplicar, prev));
    }
    indice.current = hasta;
  }, []);

  /* ── el canal entre pestañas ── */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(CANAL);
    canal.current = c;
    c.onmessage = (m: MessageEvent<Mensaje>) => {
      const msg = m.data;
      if (msg.tipo === "hola") {
        // Alguien llegó tarde: si esta pestaña lleva el reloj, le cuenta dónde va.
        if (reloj.current && actual.current) {
          c.postMessage({
            tipo: "tic",
            escenarioId: actual.current,
            indice: indice.current,
            simNow: ahoraSimulado(reloj.current, Date.now()),
            velocidad: reloj.current.velocidad,
            pausado: reloj.current.pausado,
          } satisfies Mensaje);
        }
      } else if (msg.tipo === "tic") {
        // Otra pestaña lleva el reloj: esta pasa a seguirla.
        reloj.current = null;
        setControl(false);
        alcanzar(msg.escenarioId, msg.indice);
        setSimNow(msg.simNow);
        setVelocidad(msg.velocidad);
        setPausado(msg.pausado);
      } else if (msg.tipo === "detenida") {
        reloj.current = null;
        actual.current = null;
        indice.current = 0;
        setControl(false);
        setEscenarioId(null);
        setEstado(ESTADO_VACIO);
      }
    };
    c.postMessage({ tipo: "hola" } satisfies Mensaje);
    return () => {
      c.close();
      canal.current = null;
    };
  }, [alcanzar]);

  /* ── el latido, solo en la pestaña que lleva el reloj ── */
  useEffect(() => {
    if (!control || !escenario) return;
    const fin = Date.parse(escenario.inicio) + escenario.duracionMin * 60_000;
    const id = window.setInterval(() => {
      const r = reloj.current;
      if (!r) return;
      let ahora = ahoraSimulado(r, Date.now());
      if (ahora >= fin && !r.pausado) {
        // Al acabar la tarde, el reloj se para en el final.
        reloj.current = { ...pausar(r, Date.now()), anclaSimulada: fin };
        ahora = fin;
        setPausado(true);
      }
      const { indice: siguiente } = vencidos(escenario.eventos, indice.current, ahora);
      alcanzar(escenario.id, siguiente);
      setSimNow(ahora);
      emitir({
        tipo: "tic",
        escenarioId: escenario.id,
        indice: siguiente,
        simNow: ahora,
        velocidad: reloj.current!.velocidad,
        pausado: reloj.current!.pausado,
      });
    }, TIC_MS);
    return () => window.clearInterval(id);
  }, [control, escenario, alcanzar, emitir]);

  /* ── los mandos ── */
  const iniciar = useCallback(
    (id: string) => {
      const esc = escenarioPorId(id);
      if (!esc) return;
      const inicio = Date.parse(esc.inicio);
      reloj.current = arrancar(inicio, velocidad, Date.now());
      actual.current = null;
      indice.current = 0;
      setPausado(false);
      setSimNow(inicio);
      setControl(true);
      alcanzar(id, 0);
    },
    [velocidad, alcanzar],
  );

  const alternarPausa = useCallback(() => {
    const r = reloj.current;
    if (!r) return;
    reloj.current = r.pausado ? reanudar(r, Date.now()) : pausar(r, Date.now());
    setPausado(reloj.current.pausado);
  }, []);

  const cambiarVelocidad = useCallback((v: number) => {
    setVelocidad(v);
    if (reloj.current) reloj.current = conVelocidad(reloj.current, v, Date.now());
  }, []);

  const detener = useCallback(() => {
    reloj.current = null;
    actual.current = null;
    indice.current = 0;
    setControl(false);
    setEscenarioId(null);
    setEstado(ESTADO_VACIO);
    emitir({ tipo: "detenida" });
  }, [emitir]);

  const valor = useMemo<Simulacion>(
    () => ({
      activa: escenario !== null,
      escenario,
      simNow,
      estado,
      velocidad,
      pausado,
      control,
      iniciar,
      alternarPausa,
      cambiarVelocidad,
      detener,
    }),
    [escenario, simNow, estado, velocidad, pausado, control, iniciar, alternarPausa, cambiarVelocidad, detener],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSimulacion(): Simulacion {
  return useContext(Contexto);
}
