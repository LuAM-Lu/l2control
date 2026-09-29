/**
 * La consulta automática de la tasa del BCV (F3-04, ADR-019 §8), mudada del servidor web al worker
 * en B5-1. Pregunta al arrancar y cada 15 minutos. Lo que publica la web del BCV se aplica solo,
 * salte lo que salte (V-14, ADR-024); si solo responde un tercero, o es la primera del local, queda
 * pendiente con su alerta. Traerla dos veces no la repite. Aplicarla deja su asiento, y el asiento
 * llega a todas las pantallas por el outbox en menos de 2 s.
 *
 * Si ninguna fuente responde, se aleja: 15, 30, 60 minutos, sin pasar de una hora, y vuelve a los
 * 15 en cuanto una responda. Es una comodidad, nunca una dependencia: si falla, lo anota y la carga
 * manual sigue igual.
 */
import type { Aplicacion, Contexto } from "@l2/application";
import type { Logger } from "@l2/observability";

const CADA_MS = 15 * 60_000;
const COMO_MUCHO_MS = 60 * 60_000;
/** Al arrancar se espera un poco: que el proceso termine de levantarse antes de salir a la red. */
const AL_ARRANCAR_MS = 5_000;

/** Cuánto esperar tras `fallos` consultas seguidas sin respuesta de ninguna fuente. */
export function esperaTrasFallos(fallos: number): number {
  return Math.min(CADA_MS * 2 ** Math.max(0, fallos), COMO_MUCHO_MS);
}

/** Una consulta. Devuelve si alguna fuente respondió (lo que decide la siguiente espera). */
async function unaVez(app: Aplicacion, ctx: Contexto, log: Logger): Promise<boolean> {
  try {
    const r = await app.tasas.sincronizar({ ...ctx, sistema: true });
    if (r.ok) {
      log.info(
        {
          capturadas: r.valor.capturadas.map((t) => `${t.value}@${t.effectiveDate}${t.automatic ? " aplicada" : t.heldBack ? ` retenida:${t.heldBack}` : ""}`),
          aplicadas: r.valor.aplicadas.map((t) => `${t.value}@${t.effectiveDate}`),
          avisos: r.valor.avisos,
          fuentes: r.valor.fuentes,
        },
        "sincronización de tasa",
      );
      return true;
    }
    log.warn({ motivo: r.motivo, mensaje: r.mensaje }, "sincronización de tasa sin resultado");
    return r.motivo !== "NO_DISPONIBLE";
  } catch (e) {
    log.error({ err: e }, "la sincronización de tasa falló");
    return false;
  }
}

/** Programa la consulta: una al arrancar y luego cada 15 minutos. Devuelve cómo pararla. */
export function programarSincronizacionDeTasa(app: Aplicacion, ctx: Contexto, log: Logger): () => void {
  let fallos = 0;
  let temporizador: NodeJS.Timeout | undefined;
  let parado = false;
  // Una cadena de temporizadores y no un intervalo: la espera depende de cómo fue la anterior, y
  // una consulta lenta nunca se solapa con la siguiente.
  const siguiente = (ms: number) => {
    temporizador = setTimeout(async () => {
      fallos = (await unaVez(app, ctx, log)) ? 0 : fallos + 1;
      if (!parado) siguiente(esperaTrasFallos(fallos));
    }, ms);
  };
  siguiente(AL_ARRANCAR_MS);
  return () => {
    parado = true;
    clearTimeout(temporizador);
  };
}
