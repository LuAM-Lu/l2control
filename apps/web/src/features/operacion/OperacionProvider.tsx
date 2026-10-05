"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { OperationEventSchema, type OperationEventDto, type SesionEnCursoDto } from "@l2/contracts";
import { avisar } from "@l2/ui";
import { ESTADO_VACIO, aplicar, type Conectado, type EstadoLocal, type EventoSinSello } from "./proyeccion.ts";
import { useSala } from "../park/SalaProvider.tsx";
import { PUESTO_DE_ROL } from "../identity/operador.ts";
import { NOMBRE_ROL } from "../identity/permisos.ts";
import { useTiempoReal } from "./TiempoRealProvider.tsx";

/**
 * La operación del local — el bus de eventos (F1-20, ADR-008).
 *
 * Las pantallas del restaurante cuentan lo que hacen las personas como eventos del catálogo: abrir
 * una mesa, enviar un pedido, pedir la cuenta. Aquí se sellan, se validan contra el contrato y se
 * aplican a la proyección, que es lo que las pantallas leen. Lo que no cumple el contrato no se
 * aplica: fail-closed.
 *
 * LO QUE YA ES DEL SERVIDOR NO VIAJA POR EL BUS. Los niños en sala los da `SalaProvider` (B4-2), y
 * quién está en cada puesto, las sesiones abiertas en la base (`sesiones`, B5-1).
 *
 * DESDE B5-1 EL TRANSPORTE ES EL SERVIDOR: cada evento va al worker, que lo revalida, le pone la
 * hora y lo reparte a los equipos de la sucursal; al conectarse, un equipo se pone al día con lo
 * guardado del día. Nada se guarda en el navegador (antes, `sessionStorage` y `BroadcastChannel`, que
 * no salían de un aparato). Es provisional hasta que mesas y pedidos sean de la base (Etapa 6).
 */

export type ResultadoEmision =
  | Readonly<{ ok: true; evento: OperationEventDto }>
  | Readonly<{ ok: false; motivo: string }>;

export type Operacion = Readonly<{
  estado: EstadoLocal;
  /** Si hay algo que contar en el local: niños en sala, alguien en un puesto o eventos del día. */
  hayActividad: boolean;
  /** Emite un evento hecho por una persona. Si no cumple el contrato, no se aplica. */
  emitir: (evento: EventoSinSello) => ResultadoEmision;
}>;

const Contexto = createContext<Operacion>({
  estado: ESTADO_VACIO,
  hayActividad: false,
  emitir: () => ({ ok: false, motivo: "La operación no está disponible" }),
});

/** Quién está en cada puesto de servicio: la sesión más antigua de cada uno. */
function conectadosDe(sesiones: readonly SesionEnCursoDto[]): Record<string, Conectado> {
  const r: Record<string, Conectado> = {};
  for (const s of sesiones) {
    const puesto = PUESTO_DE_ROL[s.role];
    r[puesto] ??= { userName: s.userName, role: NOMBRE_ROL[s.role], device: s.deviceLabel, desde: s.desde };
  }
  return r;
}

export function OperacionProvider({ sesiones, children }: { sesiones: readonly SesionEnCursoDto[]; children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoLocal>(ESTADO_VACIO);
  const [hayEventos, setHayEventos] = useState(false);
  /** Los ids ya aplicados: un evento llega por varias vías (el propio, el eco, la puesta al día). */
  const vistos = useRef(new Set<string>());
  const canal = useTiempoReal();

  const incorporar = useCallback((llegados: readonly OperationEventDto[]) => {
    const nuevos = llegados.filter((e) => !vistos.current.has(e.id));
    if (nuevos.length === 0) return;
    for (const e of nuevos) vistos.current.add(e.id);
    setEstado((prev) => nuevos.reduce(aplicar, prev));
    setHayEventos(true);
  }, []);

  /* ── lo que mandan los demás equipos, y ponerse al día al conectarse ── */
  useEffect(() => canal.alOperacion((e) => incorporar([e])), [canal.alOperacion, incorporar]);
  useEffect(() => {
    if (canal.estado !== "en-vivo") return;
    let vivo = true;
    void canal.pedirBus().then((eventos) => {
      if (vivo) incorporar(eventos);
    });
    return () => {
      vivo = false;
    };
  }, [canal.estado, canal.pedirBus, incorporar]);

  const { enviarOperacion } = canal;
  const emitir = useCallback(
    (sinSello: EventoSinSello): ResultadoEmision => {
      const r = OperationEventSchema.safeParse({
        ...sinSello,
        id: globalThis.crypto.randomUUID(),
        // Provisional: el worker lo sustituye por la hora del servidor al repartirlo.
        at: new Date().toISOString(),
      });
      if (!r.success) {
        return { ok: false, motivo: r.error.issues[0]?.message ?? "El evento no cumple el contrato" };
      }
      incorporar([r.data]);
      void enviarOperacion(r.data).then((respuesta) => {
        if (!respuesta.ok) avisar.error(respuesta.motivo, { detalle: "Los demás equipos no lo vieron." });
      });
      return { ok: true, evento: r.data };
    },
    [incorporar, enviarOperacion],
  );

  const { sala } = useSala();
  const huellaSesiones = JSON.stringify(sesiones);
  const conectados = useMemo(() => conectadosDe(sesiones), [huellaSesiones]);
  const conServidor = useMemo<EstadoLocal>(() => {
    const base = { ...estado, conectados };
    if (!sala) return base;
    const nombres = Object.fromEntries(sala.sessions.map((s) => [s.id, s.kid.nickname ?? s.kid.name ?? s.wristbandCode]));
    return {
      ...base,
      sesiones: sala.sessions,
      familias: Object.fromEntries(sala.sessions.map((s) => [s.id, s.guardianName])),
      nombres: { ...estado.nombres, ...nombres },
    };
  }, [estado, sala, conectados]);

  const hayActividad = hayEventos || (sala?.sessions.length ?? 0) > 0 || Object.keys(conectados).length > 0;
  const valor = useMemo<Operacion>(() => ({ estado: conServidor, hayActividad, emitir }), [conServidor, hayActividad, emitir]);
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
  const fijo = useContext(RelojFijo);
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    // Con el reloj fijo (la carga desde papel) no corre ningún intervalo: la hora es la anotada.
    if (fijo !== null) return;
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [fijo]);
  return fijo ?? ahora;
}

/**
 * La hora que un subárbol da por «ahora» en lugar de la del aparato: la hora real anotada en el formulario
 * de papel (B3-7, ADR-027). Así la tasa vigente, el IVA y los precios que la caja pinta son los de ENTONCES,
 * y el servidor, que recibe esa misma hora, comprueba lo mismo. Fuera de la carga desde papel no existe.
 */
const RelojFijo = createContext<number | null>(null);

export function RelojDeLaCarga({ ahora, children }: { ahora: number; children: React.ReactNode }) {
  return <RelojFijo.Provider value={ahora}>{children}</RelojFijo.Provider>;
}
