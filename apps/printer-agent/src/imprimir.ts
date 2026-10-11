/**
 * Mandar bytes a una impresora térmica por TCP (puerto 9100, «RAW») — ADR-015, ADR-026.
 *
 * Primero se pregunta por el papel (DLE EOT 4): si la impresora contesta que no tiene, no se manda
 * nada y el trabajo falla con ese motivo. Si no contesta (hay modelos que no lo hacen), se imprime
 * igual: no saber no es motivo para no imprimir. Después se mandan los bytes y se cierra; **confirmado**
 * es que la impresora los aceptó y la conexión cerró bien (ADR-026, punto 4).
 */
import { connect } from "node:net";
import { ERROR_SIN_PAPEL, PREGUNTA_PAPEL, problemaDePapel, type EstadoDeImpresora } from "@l2/domain-printing";

export type ResultadoDeImpresion = Readonly<{ ok: true; aviso?: string }> | Readonly<{ ok: false; error: string }>;

/** Cómo está una impresora (B5-6), con su detalle para el panel. */
export type EstadoVisto = Readonly<{ estado: EstadoDeImpresora; detalle?: string }>;

/**
 * Cómo está la impresora en la red, sin imprimir nada (B5-6): se conecta, pregunta por el papel y cierra. Si no contesta
 * a la pregunta (hay modelos que no), está lista: responde. Si no acepta la conexión, no responde.
 */
export function estadoPorRed(destino: Readonly<{ ip: string; puerto: number }>, o: Readonly<{ conectarMs?: number; papelMs?: number }> = {}): Promise<EstadoVisto> {
  const donde = `${destino.ip}:${destino.puerto}`;
  return new Promise((resolver) => {
    let terminado = false;
    const socket = connect({ host: destino.ip, port: destino.puerto });
    const fin = (e: EstadoVisto) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(alConectar);
      socket.destroy();
      resolver(e);
    };
    const alConectar = setTimeout(() => fin({ estado: "NO_RESPONDE", detalle: `No responde en ${donde}` }), o.conectarMs ?? 3_000);
    socket.on("error", (e: NodeJS.ErrnoException) =>
      fin({ estado: "NO_RESPONDE", detalle: `La impresora en ${donde} ${e.code === "ECONNREFUSED" ? "rechaza la conexión" : e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH" ? "no está en la red" : "no responde"}` }),
    );
    socket.once("connect", () => {
      clearTimeout(alConectar);
      socket.once("data", (d: Buffer) => {
        const p = problemaDePapel(d[0] ?? 0);
        fin(p === "SIN_PAPEL" ? { estado: "SIN_PAPEL", detalle: ERROR_SIN_PAPEL } : p === "POCO_PAPEL" ? { estado: "POCO_PAPEL", detalle: "Queda poco papel" } : { estado: "LISTA" });
      });
      socket.write(PREGUNTA_PAPEL);
      setTimeout(() => fin({ estado: "LISTA" }), o.papelMs ?? 800);
    });
  });
}

export type OpcionesDeImpresion = Readonly<{
  /** Lo que se espera a que la impresora acepte la conexión. */
  conectarMs?: number;
  /** Lo que se espera la respuesta del papel. */
  papelMs?: number;
  /** Lo que puede durar todo. */
  totalMs?: number;
}>;

export function imprimir(destino: Readonly<{ ip: string; puerto: number }>, bytes: Uint8Array, o: OpcionesDeImpresion = {}): Promise<ResultadoDeImpresion> {
  const conectarMs = o.conectarMs ?? 5_000;
  const papelMs = o.papelMs ?? 800;
  const totalMs = o.totalMs ?? 20_000;
  const donde = `${destino.ip}:${destino.puerto}`;

  return new Promise((resolver) => {
    let terminado = false;
    let aviso: string | undefined;
    const socket = connect({ host: destino.ip, port: destino.puerto });
    const fin = (r: ResultadoDeImpresion) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(total);
      clearTimeout(alConectar);
      socket.destroy();
      resolver(r);
    };
    const total = setTimeout(() => fin({ ok: false, error: `La impresora en ${donde} no terminó a tiempo` }), totalMs);
    const alConectar = setTimeout(() => fin({ ok: false, error: `No responde en ${donde}` }), conectarMs);

    socket.on("error", (e: NodeJS.ErrnoException) => {
      const porque = e.code === "ECONNREFUSED" ? "rechaza la conexión" : e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH" ? "no está en la red" : "no responde";
      fin({ ok: false, error: `La impresora en ${donde} ${porque}` });
    });

    socket.once("connect", () => {
      clearTimeout(alConectar);
      let respondio = false;
      const mandar = () => {
        if (terminado) return;
        socket.end(bytes);
      };
      socket.once("data", (d: Buffer) => {
        respondio = true;
        const problema = problemaDePapel(d[0] ?? 0);
        if (problema === "SIN_PAPEL") {
          fin({ ok: false, error: ERROR_SIN_PAPEL });
          return;
        }
        if (problema === "POCO_PAPEL") aviso = "Queda poco papel";
        mandar();
      });
      socket.write(PREGUNTA_PAPEL);
      setTimeout(() => {
        if (!respondio) mandar();
      }, papelMs);
    });

    socket.on("close", (conError: boolean) => {
      if (terminado) return;
      fin(conError ? { ok: false, error: `La conexión con ${donde} se cortó` } : { ok: true, ...(aviso ? { aviso } : {}) });
    });
  });
}
