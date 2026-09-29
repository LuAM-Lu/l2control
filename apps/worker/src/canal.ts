/**
 * El canal en vivo — B5-1, ADR-008 y ADR-025.
 *
 * Socket.io en el worker. La autorización ocurre en el apretón de manos (ADR-008): sin un ticket
 * bueno de una sesión viva no hay conexión. Cada conexión entra solo en las salas de SU tenant y SU
 * sucursal, y de ahí no sale: una sucursal no oye a otra (F2-09).
 *
 * Por el canal bajan dos cosas:
 *  · `cambio` — qué temas cambiaron (del outbox). Sin datos: cada pantalla vuelve a leer lo suyo con
 *    sus permisos, por el camino de siempre.
 *  · `operacion` — el bus del restaurante, provisional hasta la Etapa 6 (`operacion.ts`).
 *
 * Este módulo no sabe de la base: recibe cómo abrir un ticket y cómo guardar el bus. Así se prueba
 * entero con un servidor de verdad y sin PostgreSQL.
 */
import type { Server as ServidorHttp } from "node:http";
import { Server, type Socket } from "socket.io";
import type { CambioDto, OperationEventDto } from "@l2/contracts";
import type { Aviso, DatosDelTicket } from "@l2/application";
import { crearRelevo, type AlmacenDelBus, type RespuestaDelBus } from "./operacion.ts";

/** La sala de todo el tenant y la de una sucursal. */
export const salaDelTenant = (tenantId: string) => `t:${tenantId}`;
export const salaDeLaSucursal = (tenantId: string, branchId: string) => `b:${tenantId}:${branchId}`;

/** Lo que el servidor manda y lo que acepta (Socket.io lo usa para tipar `emit` y `on`). */
export interface DelServidor {
  cambio: (c: CambioDto) => void;
  operacion: (e: OperationEventDto) => void;
}
export interface DelNavegador {
  operacion: (evento: unknown, responder: (r: RespuestaDelBus) => void) => void;
  "operacion:al-dia": (responder: (eventos: OperationEventDto[]) => void) => void;
}
interface DatosDelSocket {
  sesion: DatosDelTicket;
}
export type SocketDelCanal = Socket<DelNavegador, DelServidor, Record<string, never>, DatosDelSocket>;

export interface OpcionesDelCanal {
  http: ServidorHttp;
  /** El tenant que sirve este worker (el mismo que el servidor web, `L2_TENANT_ID`). */
  tenantId: string;
  /** Abre un ticket: firma, plazo y sesión viva. `null` = no entra. */
  abrir: (ticket: unknown) => Promise<DatosDelTicket | null>;
  almacen: AlmacenDelBus;
  /** El reloj del bus (el worker sella los eventos). */
  ahora?: () => number;
  /** El adaptador de Socket.io (Valkey en producción; en memoria en las pruebas). */
  adaptador?: Parameters<Server["adapter"]>[0];
  /** Qué hacer con lo que no se esperaba: el canal no se cae por un error de un navegador. */
  alError?: (e: unknown, contexto: string) => void;
}

export interface Canal {
  readonly io: Server<DelNavegador, DelServidor, Record<string, never>, DatosDelSocket>;
  /** Cuenta a cada sucursal (o a todo el tenant) qué cambió. */
  contar(avisos: readonly Aviso[]): void;
  /** Las sesiones que tienen el canal abierto ahora, sin repetir. */
  sesiones(): string[];
  /** Cierra las conexiones de estas sesiones (murieron: salida, revocación, baja). */
  echar(sesiones: ReadonlySet<string>): void;
  cerrar(): Promise<void>;
}

export function crearCanal(o: OpcionesDelCanal): Canal {
  const io = new Server<DelNavegador, DelServidor, Record<string, never>, DatosDelSocket>(o.http, {
    path: "/tiempo-real",
    // El canal no usa cookies: la credencial es el ticket, que el navegador pide a su propio
    // servidor. Sin credenciales ambientales, otro origen no puede abrirlo en nombre de nadie
    // (CSWSH), así que no hace falta cerrar el origen; las páginas y el canal pueden vivir en
    // puertos o nombres distintos (en el local, el teléfono entra por la IP de la red).
    cors: { origin: true, credentials: false },
    serveClient: false,
    // Un evento del bus es pequeño: nada de mensajes de megas.
    maxHttpBufferSize: 64 * 1024,
    ...(o.adaptador ? { adapter: o.adaptador } : {}),
  });
  const alError = o.alError ?? (() => undefined);
  const relevo = crearRelevo({ almacen: o.almacen, ahora: o.ahora ?? Date.now });

  io.use((socket, siguiente) => {
    o.abrir((socket.handshake.auth as { ticket?: unknown } | undefined)?.ticket)
      .then((sesion) => {
        if (!sesion || sesion.tenantId !== o.tenantId) return siguiente(new Error("NO_AUTORIZADO"));
        socket.data.sesion = sesion;
        siguiente();
      })
      .catch((e: unknown) => {
        alError(e, "abrir ticket");
        siguiente(new Error("NO_DISPONIBLE"));
      });
  });

  io.on("connection", (socket) => {
    const { tenantId, branchId } = socket.data.sesion;
    void socket.join([salaDelTenant(tenantId), salaDeLaSucursal(tenantId, branchId)]);
    const limite = relevo.limitador();

    socket.on("operacion", (evento, responder) => {
      const responde = typeof responder === "function" ? responder : () => undefined;
      relevo
        .recibir(socket.data.sesion, evento, limite)
        .then((r) => {
          responde(r);
          // A los demás equipos de la sucursal; este ya lo tiene (lo aplicó al mandarlo).
          if (r.ok) socket.to(salaDeLaSucursal(tenantId, branchId)).emit("operacion", r.evento);
        })
        .catch((e: unknown) => {
          alError(e, "bus de la operación");
          responde({ ok: false, motivo: "El servidor no pudo guardar el evento." });
        });
    });

    socket.on("operacion:al-dia", (responder) => {
      if (typeof responder !== "function") return;
      relevo
        .alDia(socket.data.sesion)
        .then(responder)
        .catch((e: unknown) => {
          alError(e, "bus de la operación al día");
          responder([]);
        });
    });
  });

  return {
    io,
    contar(avisos) {
      for (const a of avisos) {
        const sala = a.branchId === null ? salaDelTenant(o.tenantId) : salaDeLaSucursal(o.tenantId, a.branchId);
        io.to(sala).emit("cambio", { temas: [...a.temas] });
      }
    },
    sesiones() {
      const ids = new Set<string>();
      for (const s of io.of("/").sockets.values()) ids.add(s.data.sesion.sessionId);
      return [...ids];
    },
    echar(muertas) {
      for (const s of io.of("/").sockets.values()) if (muertas.has(s.data.sesion.sessionId)) s.disconnect(true);
    },
    cerrar: () => io.close(),
  };
}
