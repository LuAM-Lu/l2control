/**
 * La vuelta del outbox — B5-1, ADR-025.
 *
 * La base avisa (`LISTEN l2_outbox`) al confirmarse cada transacción con eventos, y el worker
 * publica lo pendiente en ese momento: el cambio llega a las pantallas en milisegundos. Por si un
 * aviso se pierde (la conexión de escucha se cayó, el worker arrancaba), además barre cada pocos
 * segundos. Es un barrido del servidor contra su base, no un sondeo de los navegadores.
 *
 * Con el worker caído, la operación sigue: los eventos se quedan pendientes en la tabla y salen al
 * volver (y cada pantalla, al reconectarse, vuelve a leer todo).
 */
import type { Aplicacion, Aviso } from "@l2/application";
import type { Logger } from "@l2/observability";

/** Cada cuánto se barre por si un aviso no llegó. */
export const BARRIDO_MS = 5_000;
/** Cuánto esperar para volver a escuchar si la conexión de escucha se cae. */
const REESCUCHAR_MS = 2_000;
const LOTE = 200;

export interface OpcionesDeLaVuelta {
  app: Aplicacion;
  tenantId: string;
  /** Cuenta a las pantallas lo que cambió. */
  contar: (avisos: readonly Aviso[]) => void;
  log: Logger;
}

export interface Vuelta {
  /** Publica ya lo pendiente (y lo que llegue mientras tanto). */
  despachar(): Promise<void>;
  parar(): Promise<void>;
}

export async function vigilarOutbox(o: OpcionesDeLaVuelta): Promise<Vuelta> {
  let enCurso: Promise<void> | null = null;
  let otraVez = false;
  let parado = false;
  let dejarDeEscuchar: (() => Promise<void>) | null = null;

  const unaVuelta = async () => {
    // Hasta vaciarlo: un lote lleno quiere decir que puede quedar más.
    for (;;) {
      const n = await o.app.tiempoReal.despachar(o.tenantId, o.contar, LOTE);
      if (n > 0) o.log.debug({ eventos: n }, "outbox publicado");
      if (n < LOTE) return;
    }
  };

  const despachar = (): Promise<void> => {
    if (parado) return Promise.resolve();
    if (enCurso) {
      // Llegó otro aviso mientras se publicaba: una vuelta más al terminar, no una a la vez.
      otraVez = true;
      return enCurso;
    }
    enCurso = (async () => {
      try {
        do {
          otraVez = false;
          await unaVuelta();
        } while (otraVez && !parado);
      } catch (e) {
        // Lo no publicado sigue pendiente: sale en el siguiente aviso o barrido.
        o.log.error({ err: e }, "no se pudo publicar el outbox");
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  };

  const escuchar = async (): Promise<void> => {
    if (parado) return;
    try {
      dejarDeEscuchar = await o.app.tiempoReal.escuchar(
        (tenant) => {
          if (tenant === o.tenantId) void despachar();
        },
        (e) => {
          o.log.warn({ err: e }, "se perdió la escucha del outbox: se vuelve a escuchar");
          dejarDeEscuchar = null;
          setTimeout(() => void escuchar(), REESCUCHAR_MS);
        },
      );
      // Lo que pasó mientras no se escuchaba.
      void despachar();
    } catch (e) {
      o.log.warn({ err: e }, "no se pudo escuchar el outbox: se reintenta");
      setTimeout(() => void escuchar(), REESCUCHAR_MS);
    }
  };

  await escuchar();
  const barrido = setInterval(() => void despachar(), BARRIDO_MS);

  return {
    despachar,
    async parar() {
      parado = true;
      clearInterval(barrido);
      await enCurso;
      await dejarDeEscuchar?.();
    },
  };
}
