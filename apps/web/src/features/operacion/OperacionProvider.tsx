"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { OperationEventSchema, type OperationEventDto } from "@l2/contracts";
import { ESTADO_VACIO, aplicar, type EstadoLocal, type EventoSinSello } from "./proyeccion.ts";

/**
 * La operación del local — el bus de eventos (F1-20, ADR-008).
 *
 * Las pantallas cuentan lo que hacen las personas como eventos del catálogo: abrir una
 * mesa, enviar un pedido, nombrar a un niño, cerrar una sesión. Aquí se sellan (id e
 * instante), se validan contra el contrato y se aplican a la proyección, que es lo que
 * las pantallas leen. Lo que no cumple el contrato no se aplica: fail-closed.
 *
 * Sustituye al simulador de operación (F1-19), retirado el 2026-09-26 (MAESTRO, M-6): ya
 * no hay escenarios, reloj acelerado ni panel «DEMO». Queda lo que no era simulado.
 *
 * HASTA B5-1 el transporte es de este navegador: los eventos viven en la pestaña
 * (`sessionStorage`) y viajan a las demás pestañas por un `BroadcastChannel`, donde se
 * revalidan al llegar (otra pestaña es una entrada no confiable). Entre dos aparatos no
 * se comparte nada. Con B5-1 viajan por el servidor; la proyección no cambia.
 */

const CANAL = "l2-operacion";
const CLAVE = "l2:operacion:eventos:v1";

type Mensaje = { tipo: "hola" } | { tipo: "eventos"; eventos: unknown[] };

export type ResultadoEmision =
  | Readonly<{ ok: true; evento: OperationEventDto }>
  | Readonly<{ ok: false; motivo: string }>;

export type Operacion = Readonly<{
  estado: EstadoLocal;
  /** Si alguien ha hecho algo en el local desde que se abrió (en este navegador). */
  hayActividad: boolean;
  /** Emite un evento hecho por una persona. Si no cumple el contrato, no se aplica. */
  emitir: (evento: EventoSinSello) => ResultadoEmision;
}>;

const Contexto = createContext<Operacion>({
  estado: ESTADO_VACIO,
  hayActividad: false,
  emitir: () => ({ ok: false, motivo: "La operación no está disponible" }),
});

/** Valida lo que llega de fuera; lo que no cumple el contrato se descarta. */
function validos(eventos: unknown[]): OperationEventDto[] {
  return eventos.flatMap((e) => {
    const r = OperationEventSchema.safeParse(e);
    return r.success ? [r.data] : [];
  });
}

export function OperacionProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoLocal>(ESTADO_VACIO);
  const [hayActividad, setHayActividad] = useState(false);
  const canal = useRef<BroadcastChannel | null>(null);
  /** Los eventos de la operación, en orden de llegada. */
  const eventos = useRef<OperationEventDto[]>([]);

  /** Incorpora eventos sin repetir los que ya estaban (llegan por varias vías). */
  const incorporar = useCallback((llegados: readonly OperationEventDto[]) => {
    const vistos = new Set(eventos.current.map((e) => e.id));
    const nuevos = llegados.filter((e) => !vistos.has(e.id));
    if (nuevos.length === 0) return;
    eventos.current = [...eventos.current, ...nuevos];
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(eventos.current));
    } catch {
      // Sin almacenamiento, la operación vive mientras la página esté abierta.
    }
    setEstado((prev) => nuevos.reduce(aplicar, prev));
    setHayActividad(true);
  }, []);

  /* ── lo que pasó antes de esta recarga (el cambio de usuario recarga la página) ── */
  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (!crudo) return;
      // Entrada no confiable aunque venga de esta misma pestaña (ADR-017).
      const r = OperationEventSchema.array().safeParse(JSON.parse(crudo));
      if (r.success) incorporar(r.data);
      else window.sessionStorage.removeItem(CLAVE);
    } catch {
      // Almacenamiento bloqueado o JSON roto: se empieza sin ellos.
    }
  }, [incorporar]);

  /* ── las demás pestañas ── */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel(CANAL);
    canal.current = c;
    c.onmessage = (m: MessageEvent<Mensaje>) => {
      const msg = m.data;
      if (msg.tipo === "hola") {
        // Una pestaña que llega tarde se pone al día; los repetidos se descartan por id.
        if (eventos.current.length > 0) c.postMessage({ tipo: "eventos", eventos: eventos.current } satisfies Mensaje);
      } else if (msg.tipo === "eventos") {
        incorporar(validos(Array.isArray(msg.eventos) ? msg.eventos : []));
      }
    };
    c.postMessage({ tipo: "hola" } satisfies Mensaje);
    return () => {
      c.close();
      canal.current = null;
    };
  }, [incorporar]);

  const emitir = useCallback(
    (sinSello: EventoSinSello): ResultadoEmision => {
      const r = OperationEventSchema.safeParse({
        ...sinSello,
        id: globalThis.crypto.randomUUID(),
        at: new Date().toISOString(),
      });
      if (!r.success) {
        return { ok: false, motivo: r.error.issues[0]?.message ?? "El evento no cumple el contrato" };
      }
      incorporar([r.data]);
      canal.current?.postMessage({ tipo: "eventos", eventos: [r.data] } satisfies Mensaje);
      return { ok: true, evento: r.data };
    },
    [incorporar],
  );

  const valor = useMemo<Operacion>(() => ({ estado, hayActividad, emitir }), [estado, hayActividad, emitir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useOperacion(): Operacion {
  return useContext(Contexto);
}

/**
 * La hora del local, que avanza cada segundo.
 *
 * Devuelve 0 hasta montarse en el navegador: la hora del servidor al renderizar no
 * coincidiría con la de la hidratación. Es la hora del aparato: para cobrar tiempo manda
 * la del servidor (ADR-010), que llega con las estancias en B4.
 */
export function useAhoraLocal(): number {
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return ahora;
}
