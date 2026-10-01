/**
 * El agente conectado al worker — ADR-026.
 *
 * Se conecta hacia fuera (Socket.io, espacio `/impresion`) con su credencial y no deja de intentarlo:
 * si se cae el internet, vuelve solo. Cuando el worker avisa (`hay-trabajo`), o cada 30 s por si se
 * perdió un aviso, vacía la cola de su sucursal: reclama, imprime y responde, de uno en uno.
 */
import { io, type Socket } from "socket.io-client";
import { TrabajoParaElAgenteSchema } from "@l2/contracts";
import type { ResultadoDeImpresion } from "./imprimir.ts";

export type Registro = Readonly<{ info: (m: string) => void; error: (m: string) => void }>;

export type Agente = Readonly<{ socket: Socket; vaciar: () => Promise<number>; parar: () => void }>;

export function crearAgente(o: {
  servidor: string;
  credencial: string;
  imprimir: (destino: { ip: string; puerto: number }, bytes: Uint8Array) => Promise<ResultadoDeImpresion>;
  registro: Registro;
  /** Cada cuánto mira la cola sin aviso. */
  mirarMs?: number;
}): Agente {
  const socket = io(`${o.servidor.replace(/\/$/, "")}/impresion`, {
    path: "/tiempo-real",
    auth: { credencial: o.credencial },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
  });
  let vaciando = false;
  let otraVez = false;

  /** Reclama e imprime hasta que la cola de su sucursal quede vacía. Devuelve cuántos imprimió. */
  async function vaciar(): Promise<number> {
    if (vaciando) {
      otraVez = true;
      return 0;
    }
    vaciando = true;
    let n = 0;
    try {
      do {
        otraVez = false;
        while (socket.connected) {
          const crudo: unknown = await socket.timeout(10_000).emitWithAck("reclamar");
          if (crudo === null) break;
          const t = TrabajoParaElAgenteSchema.safeParse(crudo);
          if (!t.success) {
            o.registro.error("El servidor mandó un trabajo mal formado: se ignora.");
            break;
          }
          const r = await o.imprimir({ ip: t.data.ip, puerto: t.data.puerto }, Buffer.from(t.data.bytes, "base64"));
          await socket.timeout(10_000).emitWithAck("resultado", { trabajoId: t.data.id, ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
          if (r.ok) {
            n += 1;
            o.registro.info(`Impreso ${t.data.id} en ${t.data.ip}:${t.data.puerto}${r.aviso ? ` (${r.aviso})` : ""}`);
          } else o.registro.error(`No se imprimió ${t.data.id}: ${r.error}`);
        }
      } while (otraVez && socket.connected);
    } catch (e) {
      o.registro.error(`Se cortó la conversación con el servidor: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      vaciando = false;
    }
    return n;
  }

  socket.on("connect", () => o.registro.info("Conectado al servidor."));
  socket.on("disconnect", (motivo) => o.registro.error(`Desconectado del servidor (${motivo}).`));
  socket.on("connect_error", (e) => {
    o.registro.error(e.message === "NO_AUTORIZADO" ? "El servidor no reconoce este agente: vuelve a vincularlo." : `Sin conexión con el servidor: ${e.message}`);
  });
  socket.on("hay-trabajo", () => void vaciar());
  const reloj = setInterval(() => void vaciar(), o.mirarMs ?? 30_000);

  return {
    socket,
    vaciar,
    parar: () => {
      clearInterval(reloj);
      socket.disconnect();
    },
  };
}
