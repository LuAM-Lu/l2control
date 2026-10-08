/**
 * Los agentes de impresión — B5-2, ADR-026.
 *
 * El agente de la laptop de caja se conecta al mismo Socket.io que las pantallas, en su propio espacio
 * (`/impresion`), con su credencial en el apretón de manos. No hay ticket de una sesión: el agente no es
 * una persona, es el aparato que habla con la impresora. Entra en la sala de SU sucursal y de ahí no
 * sale.
 *
 * Lo que pasa por aquí:
 *  · `hay-trabajo` (el worker → el agente): algo entró en la cola de su sucursal o volvió a ella. El
 *    agente reclama hasta vaciarla; además mira solo cada 30 s, por si se perdió un aviso.
 *  · `reclamar` (el agente → el worker): el siguiente trabajo, ya ENVIADO a su nombre, o `null`.
 *  · `resultado` (el agente → el worker): cómo le fue.
 *  · `revisar-version` (el worker → el agente, T-8c): administración pidió «Actualizar ahora»; el agente revisa ya.
 *  · `actualizacion` (el agente → el worker, T-8c): cómo le fue a un cambio de versión que no salió.
 *
 * El agente dice su versión en el apretón de manos (`auth.version`), junto a su credencial.
 *
 * Este módulo no sabe de la base: recibe los casos de uso. Se prueba con un servidor de verdad.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server, Namespace } from "socket.io";
import type { Resultado, TrabajoParaElAgenteDto } from "@l2/contracts";
import type { AgenteAbierto } from "@l2/application";

/** Lo que el worker usa de la aplicación (en las pruebas, dobles). */
export interface CasosDelAgente {
  abrirAgente(credencial: unknown, version?: unknown): Promise<AgenteAbierto | null>;
  reclamar(agente: AgenteAbierto): Promise<TrabajoParaElAgenteDto | null>;
  responder(agente: AgenteAbierto, entrada: unknown): Promise<Resultado<{ estado: string }>>;
  vincular(entrada: unknown): Promise<Resultado<unknown>>;
  anotarActualizacion(agente: AgenteAbierto, entrada: unknown): Promise<Resultado<{ anotada: true }>>;
}

export interface AlAgente {
  "hay-trabajo": () => void;
  "revisar-version": () => void;
}
export interface DelAgente {
  reclamar: (responder: (t: TrabajoParaElAgenteDto | null) => void) => void;
  resultado: (r: unknown, responder: (r: Resultado<{ estado: string }>) => void) => void;
  actualizacion: (n: unknown, responder: (r: Resultado<{ anotada: true }>) => void) => void;
}
interface DatosDelAgente {
  agente: AgenteAbierto;
}

export const salaDeImpresion = (branchId: string) => `imp:${branchId}`;

export interface CanalDeImpresion {
  readonly espacio: Namespace<DelAgente, AlAgente, Record<string, never>, DatosDelAgente>;
  /** Avisa a los agentes de esas sucursales (o a todos) de que hay trabajo. */
  avisar(branchIds: readonly string[] | "todas"): void;
  /** Les dice que revisen ya la versión disponible: «Actualizar ahora» (T-8c). */
  revisarVersion(branchIds: readonly string[] | "todas"): void;
  /** Los agentes conectados ahora, sin repetir. */
  conectados(): AgenteAbierto[];
  /** Cierra las conexiones de estos agentes (retirados desde el panel). */
  echar(agenteIds: ReadonlySet<string>): void;
  /**
   * La vinculación por HTTP: `POST /impresion/vincular` con `{ codigo }`. Devuelve `true` si atendió
   * la petición. Un tope de 10 intentos por minuto y dirección frena a quien prueba códigos.
   */
  atenderHttp(req: IncomingMessage, res: ServerResponse): boolean;
}

export function crearCanalDeImpresion(o: {
  io: Server;
  casos: CasosDelAgente;
  alError?: (e: unknown, contexto: string) => void;
  ahora?: () => number;
}): CanalDeImpresion {
  const espacio = o.io.of("/impresion") as unknown as Namespace<DelAgente, AlAgente, Record<string, never>, DatosDelAgente>;
  const alError = o.alError ?? (() => undefined);
  const ahora = o.ahora ?? Date.now;

  espacio.use((socket, siguiente) => {
    const auth = socket.handshake.auth as { credencial?: unknown; version?: unknown } | undefined;
    o.casos
      .abrirAgente(auth?.credencial, auth?.version)
      .then((agente) => {
        if (!agente) return siguiente(new Error("NO_AUTORIZADO"));
        socket.data.agente = agente;
        siguiente();
      })
      .catch((e: unknown) => {
        alError(e, "abrir agente");
        siguiente(new Error("NO_DISPONIBLE"));
      });
  });

  espacio.on("connection", (socket) => {
    const agente = socket.data.agente;
    void socket.join(salaDeImpresion(agente.branchId));
    // Al conectarse vacía lo que esperaba (la laptop estuvo apagada, se cayó el internet).
    socket.emit("hay-trabajo");

    socket.on("reclamar", (responder) => {
      if (typeof responder !== "function") return;
      o.casos
        .reclamar(agente)
        .then(responder)
        .catch((e: unknown) => {
          alError(e, "reclamar trabajo");
          responder(null);
        });
    });

    socket.on("actualizacion", (n, responder) => {
      const responde = typeof responder === "function" ? responder : () => undefined;
      o.casos
        .anotarActualizacion(agente, n)
        .then(responde)
        .catch((e: unknown) => {
          alError(e, "nota de actualización del agente");
          responde({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "El servidor no pudo guardar la nota." });
        });
    });

    socket.on("resultado", (r, responder) => {
      const responde = typeof responder === "function" ? responder : () => undefined;
      o.casos
        .responder(agente, r)
        .then(responde)
        .catch((e: unknown) => {
          alError(e, "resultado de impresión");
          responde({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "El servidor no pudo guardar el resultado." });
        });
    });
  });

  const intentos = new Map<string, { n: number; desde: number }>();

  return {
    espacio,
    avisar(branchIds) {
      if (branchIds === "todas") espacio.emit("hay-trabajo");
      else for (const b of new Set(branchIds)) espacio.to(salaDeImpresion(b)).emit("hay-trabajo");
    },
    revisarVersion(branchIds) {
      if (branchIds === "todas") espacio.emit("revisar-version");
      else for (const b of new Set(branchIds)) espacio.to(salaDeImpresion(b)).emit("revisar-version");
    },
    conectados() {
      const vistos = new Map<string, AgenteAbierto>();
      for (const s of espacio.sockets.values()) vistos.set(s.data.agente.agenteId, s.data.agente);
      return [...vistos.values()];
    },
    echar(ids) {
      for (const s of espacio.sockets.values()) if (ids.has(s.data.agente.agenteId)) s.disconnect(true);
    },
    atenderHttp(req, res) {
      if (req.url !== "/impresion/vincular") return false;
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return true;
      }
      const ip = req.socket.remoteAddress ?? "?";
      const t = ahora();
      const i = intentos.get(ip);
      const cuenta = i && t - i.desde < 60_000 ? { n: i.n + 1, desde: i.desde } : { n: 1, desde: t };
      intentos.set(ip, cuenta);
      const responder = (codigo: number, cuerpo: unknown) => res.writeHead(codigo, { "content-type": "application/json" }).end(JSON.stringify(cuerpo));
      if (cuenta.n > 10) {
        responder(429, { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Demasiados intentos: espera un minuto." });
        return true;
      }
      let cuerpo = "";
      req.setEncoding("utf8");
      req.on("data", (trozo: string) => {
        cuerpo += trozo;
        if (cuerpo.length > 1024) req.destroy();
      });
      req.on("end", () => {
        let entrada: unknown = null;
        try {
          entrada = JSON.parse(cuerpo);
        } catch {
          responder(400, { ok: false, motivo: "INVALIDO", mensaje: "Se espera JSON con el código." });
          return;
        }
        o.casos
          .vincular(entrada)
          .then((r) => responder(r.ok ? 200 : r.motivo === "INVALIDO" ? 400 : 403, r))
          .catch((e: unknown) => {
            alError(e, "vincular agente");
            responder(503, { ok: false, motivo: "NO_DISPONIBLE", mensaje: "El servidor no pudo vincular el agente." });
          });
      });
      return true;
    },
  };
}
