/**
 * El agente conectado al worker — ADR-026.
 *
 * Se conecta hacia fuera (Socket.io, espacio `/impresion`) con su credencial y no deja de intentarlo:
 * si se cae el internet, vuelve solo. Cuando el worker avisa (`hay-trabajo`), o cada 30 s por si se
 * perdió un aviso, vacía la cola de su sucursal: reclama, imprime y responde, de uno en uno.
 *
 * Dice su versión al entrar (T-8c) y cuenta al servidor cómo le fue a un cambio de versión (`informar`).
 *
 * Por USB (B5-4): al conectarse, y cada 10 minutos si cambió, cuenta las impresoras que ve en Windows; sin contarlas, el
 * servidor no le da trabajos por USB. Cada trabajo dice a dónde: una IP y un puerto, o una impresora de Windows.
 */
import { io, type Socket } from "socket.io-client";
import { TrabajoParaElAgenteSchema, type NotaDeActualizacionDto } from "@l2/contracts";
import type { ResultadoDeImpresion } from "./imprimir.ts";

export type Registro = Readonly<{ info: (m: string) => void; error: (m: string) => void }>;

/** A dónde va un trabajo: la impresora en la red, o la de Windows por su nombre (B5-4). */
export type Destino = Readonly<{ ip: string; puerto: number }> | Readonly<{ impresoraDeWindows: string }>;

/** Cómo se dice un destino en el registro. */
export const destinoEnPalabras = (d: Destino) => ("impresoraDeWindows" in d ? `«${d.impresoraDeWindows}» (USB)` : `${d.ip}:${d.puerto}`);

export type Agente = Readonly<{
  socket: Socket;
  vaciar: () => Promise<number>;
  /** Cuenta al servidor cómo le fue a un cambio de versión (T-8c). Devuelve si lo anotó. */
  informar: (n: NotaDeActualizacionDto) => Promise<boolean>;
  parar: () => void;
}>;

export function crearAgente(o: {
  servidor: string;
  credencial: string;
  /** La versión de este agente: la dice al entrar (T-8c). */
  version?: string;
  imprimir: (destino: Destino, bytes: Uint8Array) => Promise<ResultadoDeImpresion>;
  /** Las impresoras de Windows de este equipo (B5-4); sin ella (fuera de Windows) no imprime por USB. */
  impresorasDeWindows?: () => Promise<string[]>;
  /** Cada cuánto vuelve a contarlas. */
  contarMs?: number;
  registro: Registro;
  /** Cada cuánto mira la cola sin aviso. */
  mirarMs?: number;
  /** Lo que espera para volver a intentarlo si el servidor no lo reconoce, o si falló al abrirlo. */
  esperaRechazoMs?: number;
  esperaErrorMs?: number;
}): Agente {
  const socket = io(`${o.servidor.replace(/\/$/, "")}/impresion`, {
    path: "/tiempo-real",
    auth: { credencial: o.credencial, ...(o.version ? { version: o.version } : {}) },
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
          const destino: Destino =
            t.data.impresoraDeWindows !== undefined ? { impresoraDeWindows: t.data.impresoraDeWindows } : { ip: t.data.ip!, puerto: t.data.puerto! };
          const r = await o.imprimir(destino, Buffer.from(t.data.bytes, "base64"));
          await socket.timeout(10_000).emitWithAck("resultado", { trabajoId: t.data.id, ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
          if (r.ok) {
            n += 1;
            o.registro.info(`Impreso ${t.data.id} en ${destinoEnPalabras(destino)}${r.aviso ? ` (${r.aviso})` : ""}`);
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

  /**
   * Socket.io no vuelve a intentarlo solo cuando el servidor lo rechaza en el apretón de manos (la base
   * no respondió, o el agente se retiró) ni cuando el servidor cierra la conexión: aquí se reintenta
   * igual, más espaciado si no lo reconoce. Un agente de la caja no se rinde nunca.
   */
  let reintento: ReturnType<typeof setTimeout> | null = null;
  const reintentar = (ms: number) => {
    if (reintento || socket.active) return;
    reintento = setTimeout(() => {
      reintento = null;
      if (!socket.connected) socket.connect();
    }, ms);
  };
  /** Lo último que contó: se vuelve a decir al reconectar y, cada tanto, solo si cambió. */
  let contadas: string | null = null;
  async function contar(siempre: boolean) {
    if (!o.impresorasDeWindows || !socket.connected) return;
    try {
      const lista = await o.impresorasDeWindows();
      const huella = JSON.stringify(lista);
      if (!siempre && huella === contadas) return;
      const r = (await socket.timeout(10_000).emitWithAck("impresoras-windows", { impresoras: lista })) as { ok?: boolean } | null;
      if (r?.ok) contadas = huella;
    } catch (e) {
      o.registro.error(`No se pudieron contar las impresoras de Windows: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  socket.on("connect", () => {
    o.registro.info("Conectado al servidor.");
    void contar(true);
  });
  const recuento = setInterval(() => void contar(false), o.contarMs ?? 10 * 60_000);
  socket.on("disconnect", (motivo) => {
    o.registro.error(`Desconectado del servidor (${motivo}).`);
    if (motivo === "io server disconnect") reintentar(o.esperaRechazoMs ?? 60_000);
  });
  socket.on("connect_error", (e) => {
    const rechazado = e.message === "NO_AUTORIZADO";
    o.registro.error(rechazado ? "El servidor no reconoce este agente: vuélvelo a vincular desde Ajustes → Impresoras." : `Sin conexión con el servidor: ${e.message}`);
    reintentar(rechazado ? (o.esperaRechazoMs ?? 60_000) : (o.esperaErrorMs ?? 15_000));
  });
  socket.on("hay-trabajo", () => void vaciar());
  const reloj = setInterval(() => void vaciar(), o.mirarMs ?? 30_000);

  async function informar(n: NotaDeActualizacionDto): Promise<boolean> {
    if (!socket.connected) return false;
    try {
      const r = (await socket.timeout(10_000).emitWithAck("actualizacion", n)) as { ok?: boolean } | null;
      return r?.ok === true;
    } catch {
      return false;
    }
  }

  return {
    socket,
    vaciar,
    informar,
    parar: () => {
      clearInterval(reloj);
      clearInterval(recuento);
      if (reintento) clearTimeout(reintento);
      socket.off("disconnect");
      socket.off("connect_error");
      socket.disconnect();
    },
  };
}
