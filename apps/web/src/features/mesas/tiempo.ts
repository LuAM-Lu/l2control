/**
 * Los tiempos del salón, legibles — B6-17 (M-38, W-5).
 *
 * Antes eran minutos sueltos («4711 min sentada»). Ahora: «42 min», «1 h 15 min»; lo que empezó hace más de medio día,
 * por su hora: «desde ayer 7:29 pm», «desde el 8 oct. 7:29 pm». En el plano, donde cabe poco: «42′», «3 h», «2 d».
 * Sin reloj propio: el instante entra como argumento.
 */
import { addDays, calendarDay } from "@l2/domain-rates";

/** Lo que la pantalla sabe del reloj del local (`useReloj`): su zona, cómo dice una hora y un día corto. */
export type RelojDelLocal = Readonly<{ zona: string; hora: (epochMs: number) => string; dia: (epochMs: number) => string }>;

const MEDIO_DIA_MIN = 12 * 60;

/** «42 min», «1 h», «1 h 15 min», «2 d 3 h». */
export function duracion(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) {
    const h = Math.floor(m / 60);
    const resto = m % 60;
    return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
  }
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return h === 0 ? `${d} d` : `${d} d ${h} h`;
}

/** En el plano, corto: «42′», «3 h», «2 d». */
export function duracionCorta(min: number): string {
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m}′`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / (24 * 60))} d`;
}

/**
 * Lo que lleva desde `iso`: la duración si fue hace menos de medio día; si no, cuándo empezó («desde ayer 7:29 pm», o
 * con su fecha si fue antes). `ahora` en 0 (el reloj aún no arrancó) da «0 min».
 */
export function transcurrido(iso: string, ahora: number, reloj: RelojDelLocal): string {
  const inicio = Date.parse(iso);
  const min = ahora > 0 ? Math.max(0, Math.floor((ahora - inicio) / 60_000)) : 0;
  if (min < MEDIO_DIA_MIN) return duracion(min);
  const dia = calendarDay(iso, reloj.zona);
  const hoy = calendarDay(new Date(ahora).toISOString(), reloj.zona);
  const cuando = dia === hoy ? "hoy" : dia === addDays(hoy, -1) ? "ayer" : `el ${reloj.dia(inicio)}`;
  return `desde ${cuando} ${reloj.hora(inicio)}`;
}

/** Con su hora delante, si es de hoy: «11:57 pm · 42 min»; si viene de antes, «desde ayer 11:57 pm». */
export function conSuHora(iso: string, ahora: number, reloj: RelojDelLocal): string {
  const t = transcurrido(iso, ahora, reloj);
  return t.startsWith("desde ") ? t : `${reloj.hora(Date.parse(iso))} · ${t}`;
}
