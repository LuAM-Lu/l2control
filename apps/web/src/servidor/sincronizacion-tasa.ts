import "server-only";
import { aplicacion, contextoDelLocal, log } from "./aplicacion";

/**
 * La consulta automática de la tasa del BCV (F3-04, ADR-019 §8), desde el arranque del servidor
 * web. Pregunta a las fuentes al arrancar y cada 15 minutos; lo que publica la web del BCV y pasa
 * el límite de cordura se aplica solo, y lo demás queda pendiente con su alerta. Traerla dos veces
 * no la repite.
 *
 * Si ninguna fuente responde, se aleja: 15, 30, 60 minutos, sin pasar de una hora, y vuelve a los
 * 15 en cuanto una responda. Es una comodidad, nunca una dependencia: si falla, lo anota y la
 * carga manual sigue igual. Cuando exista `apps/worker` (B5-1), esto se muda allí.
 */
const CADA_MS = 15 * 60_000;
const COMO_MUCHO_MS = 60 * 60_000;
/** Al arrancar se espera un poco: que el servidor termine de levantarse antes de salir a la red. */
const AL_ARRANCAR_MS = 5_000;

/** Cuánto esperar tras `fallos` consultas seguidas sin respuesta de ninguna fuente. */
export function esperaTrasFallos(fallos: number): number {
  return Math.min(CADA_MS * 2 ** Math.max(0, fallos), COMO_MUCHO_MS);
}

const global = globalThis as { __l2SincronizacionTasa?: true };

/** Una consulta. Devuelve si alguna fuente respondió (lo que decide la siguiente espera). */
async function unaVez(): Promise<boolean> {
  try {
    const r = await (await aplicacion()).tasas.sincronizar({ ...contextoDelLocal(), sistema: true });
    if (r.ok) {
      log().info(
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
    log().warn({ motivo: r.motivo, mensaje: r.mensaje }, "sincronización de tasa sin resultado");
    return r.motivo !== "NO_DISPONIBLE";
  } catch (e) {
    log().error({ err: e }, "la sincronización de tasa falló");
    return false;
  }
}

/** Programa la consulta: una al arrancar y luego cada 15 minutos. Una sola vez por proceso. */
export function programarSincronizacionDeTasa(): void {
  if (global.__l2SincronizacionTasa) return;
  global.__l2SincronizacionTasa = true;
  let fallos = 0;
  // Una cadena de temporizadores y no un intervalo: la espera depende de cómo fue la anterior, y
  // una consulta lenta nunca se solapa con la siguiente.
  const siguiente = (ms: number) => {
    setTimeout(async () => {
      fallos = (await unaVez()) ? 0 : fallos + 1;
      siguiente(esperaTrasFallos(fallos));
    }, ms).unref();
  };
  siguiente(AL_ARRANCAR_MS);
}
