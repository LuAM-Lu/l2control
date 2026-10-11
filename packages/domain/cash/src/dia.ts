/**
 * El día de negocio — ADR-009, B3-24 (M-38, W-2).
 *
 * El día del local no termina a medianoche: termina a la hora de sus ajustes (de fábrica, 4:00 am), para que lo cobrado
 * pasada la medianoche siga siendo del día que se está trabajando. Un turno declara su día al abrir. Pasado el fin de ese
 * día es una **caja de un día anterior**: no cobra lo nuevo y pide cerrarse, y lo de hoy nunca cuenta en el día de ayer
 * (el 9 de octubre una venta del 10 entró en el día 9 porque nadie cerró la caja).
 *
 * Puro: el instante, la zona y la hora entran como argumento (ADR-010).
 */

/** De fábrica, el día de negocio termina a las 4:00 am. */
export const FIN_DEL_DIA_DE_FABRICA_MIN = 4 * 60;
/** Lo más tarde que puede terminar un día de negocio: a las 10:00 am ya es la mañana del siguiente. */
export const FIN_DEL_DIA_MAX_MIN = 10 * 60;
/** Sin horario declarado, la noche empieza a las 10:00 pm (Inicio avisa desde ahí si el día sigue abierto). */
export const NOCHE_SIN_HORARIO_MIN = 22 * 60;

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MIN = 60_000;

function comprobarFin(finMin: number): void {
  if (!Number.isInteger(finMin) || finMin < 0 || finMin > FIN_DEL_DIA_MAX_MIN) {
    throw new RangeError(`Fin del día no válido: ${finMin} minutos (va de 0 a ${FIN_DEL_DIA_MAX_MIN}).`);
  }
}

/** El día del calendario y los minutos desde la medianoche, en la zona del local. */
function deParedEn(instante: number, zona: string): Readonly<{ dia: string; minutos: number }> {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const de = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? "";
  return { dia: `${de("year")}-${de("month")}-${de("day")}`, minutos: Number(de("hour")) * 60 + Number(de("minute")) };
}

function sumarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Cuánto se adelanta la hora del local a la UTC en ese instante, al minuto. */
function desfase(instante: number, zona: string): number {
  const p = deParedEn(instante, zona);
  return Date.parse(`${p.dia}T00:00:00.000Z`) + p.minutos * MIN - Math.floor(instante / MIN) * MIN;
}

/** Los minutos desde la medianoche del local en ese instante (para «de noche»). */
export function localMinutesAt(instant: number, timeZone: string): number {
  return deParedEn(instant, timeZone).minutos;
}

/**
 * El día de negocio de un instante: el del calendario del local o, antes de la hora en que termina el día, el anterior.
 * A la 1:30 am del 10 de octubre, con el fin a las 4:00 am, todavía es el 9.
 */
export function businessDayAt(instant: number, timeZone: string, dayEndMinutes: number): string {
  comprobarFin(dayEndMinutes);
  const p = deParedEn(instant, timeZone);
  return p.minutos < dayEndMinutes ? sumarDias(p.dia, -1) : p.dia;
}

/**
 * El instante en que termina el día de negocio `day`: el día siguiente, a `dayEndMinutes` de su medianoche local. Sin
 * suponer un desfase fijo: se mide el de la zona y se corrige una vez, por si el fin cae junto a un cambio de hora.
 */
export function businessDayEnd(day: string, timeZone: string, dayEndMinutes: number): number {
  if (!DIA.test(day)) throw new RangeError(`Día no válido: "${day}". Se espera AAAA-MM-DD.`);
  comprobarFin(dayEndMinutes);
  const pared = Date.parse(`${sumarDias(day, 1)}T00:00:00.000Z`) + dayEndMinutes * MIN;
  const primero = pared - desfase(pared, timeZone);
  return pared - desfase(primero, timeZone);
}

/** ¿Es la caja de un día de negocio que ya terminó? Desde ese instante no cobra lo nuevo y pide cerrarse (B3-24). */
export function isFromAnEarlierDay(businessDate: string, instant: number, timeZone: string, dayEndMinutes: number): boolean {
  return instant >= businessDayEnd(businessDate, timeZone, dayEndMinutes);
}

/**
 * ¿Es de noche para el día de negocio? Desde la hora de cierre del local (o las 10:00 pm, sin horario) hasta que el
 * día termina. Inicio avisa entonces que el día sigue abierto, si hay alguna caja abierta.
 */
export function isAfterHours(instant: number, timeZone: string, dayEndMinutes: number, closingMinutes: number | null): boolean {
  comprobarFin(dayEndMinutes);
  const m = localMinutesAt(instant, timeZone);
  return m >= (closingMinutes ?? NOCHE_SIN_HORARIO_MIN) || m < dayEndMinutes;
}
