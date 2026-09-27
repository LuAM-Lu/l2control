import "server-only";
import { aplicacion, contextoDelLocal, log } from "./aplicacion";

/**
 * La consulta automática de la tasa del BCV (F3-04), desde el arranque del servidor web. Cada
 * hora pregunta a las fuentes y deja capturada, PENDIENTE, la tasa que haya publicado el BCV:
 * suele aparecer por la tarde con la fecha valor del día hábil siguiente. Traerla dos veces no la
 * repite. Nunca cobra sola: una persona la confirma (amenaza T6).
 *
 * Es una comodidad, nunca una dependencia: si falla, lo anota y la carga manual sigue igual.
 * Cuando exista `apps/worker` (B5), esto se muda allí.
 */
const CADA_MS = 60 * 60_000;
const global = globalThis as { __l2SincronizacionTasa?: ReturnType<typeof setInterval> };

async function unaVez(): Promise<void> {
  try {
    const r = await (await aplicacion()).tasas.sincronizar({ ...contextoDelLocal(), sistema: true });
    if (r.ok) {
      log().info(
        { capturadas: r.valor.capturadas.map((t) => `${t.value}@${t.effectiveDate}`), avisos: r.valor.avisos, fuentes: r.valor.fuentes },
        "sincronización de tasa",
      );
    } else {
      log().warn({ motivo: r.motivo, mensaje: r.mensaje }, "sincronización de tasa sin resultado");
    }
  } catch (e) {
    log().error({ err: e }, "la sincronización de tasa falló");
  }
}

/** Programa la consulta: una al minuto de arrancar y luego cada hora. Una sola vez por proceso. */
export function programarSincronizacionDeTasa(): void {
  if (global.__l2SincronizacionTasa) return;
  setTimeout(() => void unaVez(), 60_000).unref();
  global.__l2SincronizacionTasa = setInterval(() => void unaVez(), CADA_MS);
  global.__l2SincronizacionTasa.unref();
}
