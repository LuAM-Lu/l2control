"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { OperationEventSchema, type OperationEventDto } from "@l2/contracts";
import { escenarioPorId, type Escenario } from "./escenarios.ts";
import { ESTADO_VACIO, aplicar, reconstruir, type EstadoLocal, type EventoSinSello } from "./proyeccion.ts";
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
 * por un `BroadcastChannel`. Por el canal NO viajan los eventos del guion:
 * solo el escenario, cuántos eventos van y la hora simulada. Cada pestaña
 * repite los eventos de su propia copia del escenario —los mismos, porque son
 * deterministas y están validados contra el contrato— y reconstruye el local.
 * Una ventana que se abre tarde se pone al día sola.
 *
 * LO QUE HACEN LAS PERSONAS
 * Las pantallas también emiten: el mesero abre una mesa, confirma un pedido.
 * Esos eventos no están en ningún guion, así que ellos SÍ viajan por el canal,
 * y quien los recibe los valida contra el contrato como si vinieran del
 * servidor: otra pestaña es una entrada no confiable. Se aplican encima del
 * guion y sobreviven a la reconstrucción. Funcionan también sin escenario:
 * el local vacío, atendido solo por quien esté usando las pantallas.
 */

const CANAL = "l2-simulacion";
const TIC_MS = 250;

type Mensaje =
  | { tipo: "hola" }
  | { tipo: "tic"; escenarioId: string; indice: number; simNow: number; velocidad: number; pausado: boolean }
  | { tipo: "detenida" }
  | { tipo: "eventos"; eventos: unknown[] };

export type ResultadoEmision =
  | Readonly<{ ok: true; evento: OperationEventDto }>
  | Readonly<{ ok: false; motivo: string }>;

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
  /**
   * Emite un evento hecho por una persona. Se sella con id e instante, se
   * valida contra el contrato y, si pasa, llega a todas las pestañas. Si no
   * pasa, no se aplica en ninguna: fail-closed.
   */
  emitir: (evento: EventoSinSello) => ResultadoEmision;
  /** Si el panel de mandos está desplegado. Lo abre el chip «Demo» de cada barra. */
  panelAbierto: boolean;
  alternarPanel: (abierto?: boolean) => void;
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
  emitir: () => ({ ok: false, motivo: "El simulador no está disponible" }),
  panelAbierto: false,
  alternarPanel: () => {},
};

const Contexto = createContext<Simulacion>(INACTIVA);

/** Valida lo que llega por el canal; lo que no cumple el contrato se descarta. */
function validos(eventos: unknown[]): OperationEventDto[] {
  return eventos.flatMap((e) => {
    const r = OperationEventSchema.safeParse(e);
    return r.success ? [r.data] : [];
  });
}

export function SimulacionProvider({ children }: { children: React.ReactNode }) {
  const [escenarioId, setEscenarioId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoLocal>(ESTADO_VACIO);
  const [simNow, setSimNow] = useState(0);
  const [velocidad, setVelocidad] = useState(10);
  const [pausado, setPausado] = useState(false);
  const [control, setControl] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const alternarPanel = useCallback((abierto?: boolean) => setPanelAbierto((v) => abierto ?? !v), []);

  const reloj = useRef<Reloj | null>(null);
  const indice = useRef(0);
  const actual = useRef<string | null>(null);
  const canal = useRef<BroadcastChannel | null>(null);
  /** Eventos emitidos por personas, en orden de llegada. */
  const propios = useRef<OperationEventDto[]>([]);
  /** Última hora simulada conocida, para sellar eventos en una pestaña que sigue. */
  const ultimoSimNow = useRef(0);

  const escenario = escenarioPorId(escenarioId);

  const enviar = useCallback((m: Mensaje) => canal.current?.postMessage(m), []);

  /** Lleva el local al índice pedido, repitiendo eventos de la copia propia. */
  const alcanzar = useCallback((id: string, hasta: number) => {
    const esc = escenarioPorId(id);
    if (!esc) return;
    if (actual.current !== id || hasta < indice.current) {
      actual.current = id;
      setEscenarioId(id);
      setEstado(propios.current.reduce(aplicar, reconstruir(esc.eventos.slice(0, hasta))));
    } else if (hasta > indice.current) {
      const nuevos = esc.eventos.slice(indice.current, hasta);
      setEstado((prev) => nuevos.reduce(aplicar, prev));
    }
    indice.current = hasta;
  }, []);

  /** Incorpora eventos de personas, sin repetir los que ya estaban. */
  const incorporar = useCallback((eventos: readonly OperationEventDto[]) => {
    const vistos = new Set(propios.current.map((e) => e.id));
    const nuevos = eventos.filter((e) => !vistos.has(e.id));
    if (nuevos.length === 0) return;
    propios.current = [...propios.current, ...nuevos];
    setEstado((prev) => nuevos.reduce(aplicar, prev));
  }, []);

  const limpiar = useCallback(() => {
    reloj.current = null;
    actual.current = null;
    indice.current = 0;
    propios.current = [];
    setControl(false);
    setEscenarioId(null);
    setEstado(ESTADO_VACIO);
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
        // Y cualquiera que tenga eventos de personas se los pasa: repetidos
        // no hacen daño, porque se descartan por id.
        if (propios.current.length > 0) {
          c.postMessage({ tipo: "eventos", eventos: propios.current } satisfies Mensaje);
        }
      } else if (msg.tipo === "tic") {
        // Otra pestaña lleva el reloj: esta pasa a seguirla.
        reloj.current = null;
        setControl(false);
        alcanzar(msg.escenarioId, msg.indice);
        ultimoSimNow.current = msg.simNow;
        setSimNow(msg.simNow);
        setVelocidad(msg.velocidad);
        setPausado(msg.pausado);
      } else if (msg.tipo === "detenida") {
        limpiar();
      } else if (msg.tipo === "eventos") {
        incorporar(validos(Array.isArray(msg.eventos) ? msg.eventos : []));
      }
    };
    c.postMessage({ tipo: "hola" } satisfies Mensaje);
    return () => {
      c.close();
      canal.current = null;
    };
  }, [alcanzar, incorporar, limpiar]);

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
      ultimoSimNow.current = ahora;
      setSimNow(ahora);
      enviar({
        tipo: "tic",
        escenarioId: escenario.id,
        indice: siguiente,
        simNow: ahora,
        velocidad: reloj.current!.velocidad,
        pausado: reloj.current!.pausado,
      });
    }, TIC_MS);
    return () => window.clearInterval(id);
  }, [control, escenario, alcanzar, enviar]);

  /* ── los mandos ── */
  const iniciar = useCallback(
    (id: string) => {
      const esc = escenarioPorId(id);
      if (!esc) return;
      // Una tarde nueva empieza con el local vacío en todas las pestañas,
      // también sin lo que hicieron las personas en la anterior.
      limpiar();
      enviar({ tipo: "detenida" });
      const inicio = Date.parse(esc.inicio);
      reloj.current = arrancar(inicio, velocidad, Date.now());
      setPausado(false);
      ultimoSimNow.current = inicio;
      setSimNow(inicio);
      setControl(true);
      alcanzar(id, 0);
    },
    [velocidad, alcanzar, limpiar, enviar],
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
    limpiar();
    enviar({ tipo: "detenida" });
  }, [limpiar, enviar]);

  const emitir = useCallback(
    (sinSello: EventoSinSello): ResultadoEmision => {
      // El instante es el del local que se está viendo: simulado si hay una
      // tarde en marcha, real si no.
      const instante = reloj.current
        ? ahoraSimulado(reloj.current, Date.now())
        : actual.current
          ? ultimoSimNow.current
          : Date.now();
      const r = OperationEventSchema.safeParse({
        ...sinSello,
        id: globalThis.crypto.randomUUID(),
        at: new Date(instante).toISOString(),
      });
      if (!r.success) {
        return { ok: false, motivo: r.error.issues[0]?.message ?? "El evento no cumple el contrato" };
      }
      incorporar([r.data]);
      enviar({ tipo: "eventos", eventos: [r.data] });
      return { ok: true, evento: r.data };
    },
    [incorporar, enviar],
  );

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
      emitir,
      panelAbierto,
      alternarPanel,
    }),
    [escenario, simNow, estado, velocidad, pausado, control, iniciar, alternarPausa, cambiarVelocidad, detener, emitir, panelAbierto, alternarPanel],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSimulacion(): Simulacion {
  return useContext(Contexto);
}

/**
 * La hora del local que se está viendo: la simulada si hay una tarde en
 * marcha; si no, la real, que avanza cada segundo.
 *
 * Devuelve 0 hasta montarse en el navegador: la hora del servidor al
 * renderizar no coincidiría con la de la hidratación.
 */
export function useAhoraLocal(): number {
  const sim = useSimulacion();
  const [real, setReal] = useState(0);
  useEffect(() => {
    if (sim.activa) return;
    setReal(Date.now());
    const id = window.setInterval(() => setReal(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sim.activa]);
  return sim.activa ? sim.simNow : real;
}
