"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { CambioSchema, OperationEventSchema, type OperationEventDto, type Tema } from "@l2/contracts";
import { pedirTicketTiempoReal } from "./tiempo-real.acciones";

/**
 * El canal en vivo del navegador — B5-1, ADR-008 y ADR-025. Sustituye a los sondeos (5 s la sala y
 * las cuentas, 60 s la tasa) y al `BroadcastChannel` entre pestañas.
 *
 * Con alguien en sesión, se conecta al worker con un ticket que firma el servidor web (la cookie no
 * sale de aquí). Del worker llegan los TEMAS que cambiaron, no los datos: quien sabe leer ese tema
 * lo vuelve a leer por su acción de siempre (`useAlCambiar`), y el resto de temas (medios, catálogo,
 * turno, equipos…) repinta las lecturas del servidor con `router.refresh()`. Al reconectarse se
 * vuelve a leer todo: lo que pasó mientras tanto no se pierde.
 *
 * Sin canal (el worker caído, la red del local caída) se dice (`estado`) y, mientras dure, se vuelve
 * a leer todo cada 30 s: un modo degradado, no la forma normal de trabajar.
 */

export type EstadoDelCanal = "sin-sesion" | "conectando" | "en-vivo" | "sin-conexion";

export type RespuestaDelBus = Readonly<{ ok: true; evento: OperationEventDto }> | Readonly<{ ok: false; motivo: string }>;

/** Los temas que su proveedor vuelve a leer por su cuenta, sin repintar toda la página. */
const CON_LECTURA_PROPIA: ReadonlySet<Tema> = new Set(["sala", "cuentas", "tasas", "impresion"]);
/** Varios cambios seguidos se juntan en un solo repintado. */
const JUNTAR_MS = 50;
/** Sin canal, cada cuánto se vuelve a leer todo. */
const DEGRADADO_MS = 30_000;
/** Tras un rechazo del apretón de manos, cuándo se vuelve a intentar. */
const REINTENTO_MS = 10_000;

type Oyente = Readonly<{ temas: readonly Tema[]; alCambiar: () => void }>;

type Valor = Readonly<{
  estado: EstadoDelCanal;
  /** Se suscribe a unos temas. `alCambiar` corre también al reconectarse. Devuelve cómo dejarlo. */
  suscribir: (temas: readonly Tema[], alCambiar: () => void) => () => void;
  /** Manda un evento del bus del restaurante; el worker lo revalida y le pone la hora. */
  enviarOperacion: (evento: OperationEventDto) => Promise<RespuestaDelBus>;
  /** Escucha los eventos del bus que mandan los demás equipos de la sucursal. */
  alOperacion: (oyente: (e: OperationEventDto) => void) => () => void;
  /** Lo guardado del bus de la sucursal (al conectarse). */
  pedirBus: () => Promise<OperationEventDto[]>;
}>;

const sinCanal: RespuestaDelBus = { ok: false, motivo: "Sin conexión con el servidor en vivo." };

const Contexto = createContext<Valor>({
  estado: "sin-sesion",
  suscribir: () => () => undefined,
  enviarOperacion: async () => sinCanal,
  alOperacion: () => () => undefined,
  pedirBus: async () => [],
});

export function TiempoRealProvider({ sesionId, children }: { sesionId: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoDelCanal>(sesionId ? "conectando" : "sin-sesion");
  const socket = useRef<Socket | null>(null);
  const oyentes = useRef(new Set<Oyente>());
  const deOperacion = useRef(new Set<(e: OperationEventDto) => void>());
  const pendiente = useRef<{ temas: Set<Tema>; repintar: boolean; t: number | null }>({ temas: new Set(), repintar: false, t: null });

  /** Junta los cambios que llegan seguidos y los reparte una sola vez. */
  const avisar = useCallback(
    (temas: readonly Tema[] | "todo") => {
      const p = pendiente.current;
      if (temas === "todo") {
        p.repintar = true;
        for (const o of oyentes.current) for (const t of o.temas) p.temas.add(t);
      } else {
        for (const t of temas) {
          p.temas.add(t);
          if (!CON_LECTURA_PROPIA.has(t)) p.repintar = true;
        }
      }
      if (p.t !== null) return;
      p.t = window.setTimeout(() => {
        const temasAhora = p.temas;
        const repintar = p.repintar;
        pendiente.current = { temas: new Set(), repintar: false, t: null };
        for (const o of oyentes.current) if (o.temas.some((t) => temasAhora.has(t))) o.alCambiar();
        if (repintar) router.refresh();
      }, JUNTAR_MS);
    },
    [router],
  );

  useEffect(() => {
    if (!sesionId) {
      setEstado("sin-sesion");
      return;
    }
    setEstado("conectando");
    let vivo = true;
    let primera = true;
    let reintento: number | undefined;
    let degradado: number | undefined;

    const entrarEnDegradado = () => {
      if (degradado !== undefined) return;
      degradado = window.setInterval(() => avisar("todo"), DEGRADADO_MS);
    };
    const salirDeDegradado = () => {
      window.clearInterval(degradado);
      degradado = undefined;
    };

    const arrancar = async () => {
      const r = await pedirTicketTiempoReal().catch(() => null);
      if (!vivo) return;
      if (!r?.ok) {
        setEstado("sin-conexion");
        entrarEnDegradado();
        reintento = window.setTimeout(() => void arrancar(), REINTENTO_MS);
        return;
      }
      const url = r.valor.url || `${window.location.protocol}//${window.location.hostname}:${r.valor.puerto}`;
      let ticket: string | null = r.valor.ticket;
      const s = io(url, {
        path: "/tiempo-real",
        transports: ["websocket"],
        // Si el worker vuelve, que se note enseguida: reintentos entre 0,5 y 2 s (por defecto, hasta 5).
        reconnectionDelay: 500,
        reconnectionDelayMax: 2_000,
        // Un ticket por intento: el primero es el que ya se pidió; al reconectar se pide otro.
        auth: (dar) => {
          if (ticket) {
            const t = ticket;
            ticket = null;
            dar({ ticket: t });
            return;
          }
          void pedirTicketTiempoReal()
            .catch(() => null)
            .then((n) => dar({ ticket: n?.ok ? n.valor.ticket : "" }));
        },
      });
      socket.current = s;

      s.on("connect", () => {
        setEstado("en-vivo");
        salirDeDegradado();
        // Lo que pasó entre que se pintó la página y ahora, o mientras no hubo canal.
        if (primera) {
          primera = false;
          for (const o of oyentes.current) o.alCambiar();
        } else avisar("todo");
      });
      s.on("disconnect", (motivo) => {
        setEstado("sin-conexion");
        entrarEnDegradado();
        // El servidor lo cerró: la sesión murió (salida, revocación, baja). La página lo sabrá al
        // repintar con lo que diga el servidor de la cookie.
        if (motivo === "io server disconnect") router.refresh();
      });
      s.on("connect_error", () => {
        setEstado("sin-conexion");
        entrarEnDegradado();
        // Un rechazo del apretón de manos no se reintenta solo: se intenta otra vez en un rato.
        if (!s.active) {
          window.clearTimeout(reintento);
          reintento = window.setTimeout(() => s.connect(), REINTENTO_MS);
        }
      });
      s.on("cambio", (crudo: unknown) => {
        const c = CambioSchema.safeParse(crudo);
        if (c.success) avisar(c.data.temas);
      });
      s.on("operacion", (crudo: unknown) => {
        // Lo que llega por la red es una entrada no confiable (ADR-017), aunque venga del worker.
        const e = OperationEventSchema.safeParse(crudo);
        if (e.success) for (const o of deOperacion.current) o(e.data);
      });
    };

    void arrancar();
    return () => {
      vivo = false;
      window.clearTimeout(reintento);
      salirDeDegradado();
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [sesionId, avisar, router]);

  const suscribir = useCallback((temas: readonly Tema[], alCambiar: () => void) => {
    const o: Oyente = { temas, alCambiar };
    oyentes.current.add(o);
    return () => void oyentes.current.delete(o);
  }, []);

  const enviarOperacion = useCallback(async (evento: OperationEventDto): Promise<RespuestaDelBus> => {
    const s = socket.current;
    if (!s) return sinCanal;
    try {
      return (await s.timeout(5_000).emitWithAck("operacion", evento)) as RespuestaDelBus;
    } catch {
      return sinCanal;
    }
  }, []);

  const alOperacion = useCallback((oyente: (e: OperationEventDto) => void) => {
    deOperacion.current.add(oyente);
    return () => void deOperacion.current.delete(oyente);
  }, []);

  const pedirBus = useCallback(async (): Promise<OperationEventDto[]> => {
    const s = socket.current;
    if (!s?.connected) return [];
    try {
      const crudos = (await s.timeout(5_000).emitWithAck("operacion:al-dia")) as unknown;
      return OperationEventSchema.array().catch([]).parse(crudos);
    } catch {
      return [];
    }
  }, []);

  const valor = useMemo(
    () => ({ estado, suscribir, enviarOperacion, alOperacion, pedirBus }),
    [estado, suscribir, enviarOperacion, alOperacion, pedirBus],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTiempoReal(): Valor {
  return useContext(Contexto);
}

/**
 * Vuelve a leer lo suyo cuando cambia alguno de estos temas (y al reconectarse). `leer` puede
 * cambiar en cada pintado: se usa siempre la última.
 */
export function useAlCambiar(temas: readonly Tema[], leer: () => void): void {
  const { suscribir } = useTiempoReal();
  const ultima = useRef(leer);
  ultima.current = leer;
  const clave = temas.join(",");
  useEffect(() => suscribir(clave.split(",") as Tema[], () => ultima.current()), [suscribir, clave]);
}
