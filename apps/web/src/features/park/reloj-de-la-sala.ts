/**
 * El reloj de la sala (B4-13, M-34): la cuenta, sin React, para poder probarla.
 *
 * La hora del servidor se interpola desde su última lectura (ADR-010). El desfase con el reloj del equipo se mide al
 * RECIBIR la lectura: si se midiera al pintar, una tarjeta pintada diez minutos después con una lectura de hace diez
 * minutos se quedaría diez minutos atrás hasta recargar, que es lo que vio el local («queda pegado»).
 */

/** La hora del servidor según una lectura: la que trajo, su desfase con este equipo y cuándo llegó (reloj del equipo). */
export type HoraDeLectura = Readonly<{ serverNow: number; desfase: number; leidaEn: number }>;

/**
 * Mide una lectura. Con el ida y vuelta de la petición se toma el punto medio: el servidor escribió su hora entre
 * que se pidió y llegó. Lo que llega sin petición (lo que leyó el layout en el servidor), con `pedidaEn = recibidaEn`.
 */
export function horaDeLectura(serverNow: number, pedidaEn: number, recibidaEn: number): HoraDeLectura {
  return { serverNow, desfase: serverNow - Math.round((pedidaEn + recibidaEn) / 2), leidaEn: recibidaEn };
}

/** La hora del servidor cuando el reloj del equipo marca `relojDelEquipo`. */
export function ahoraSegun(hora: HoraDeLectura, relojDelEquipo: number): number {
  return relojDelEquipo + hora.desfase;
}

/**
 * ¿Se toma esta lectura? Solo si no es más vieja que la que ya se tiene: la caché de la navegación puede devolver la
 * sala de hace un rato, y esa no pisa a la nueva.
 */
export function esMasNueva(ultimaServerNow: number, nuevaServerNow: number): boolean {
  return nuevaServerNow >= ultimaServerNow;
}
