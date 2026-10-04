/**
 * Cumpleaños: reserva con fecha y anticipo — B10-1, V-10, D-EVT.
 *
 * Un cumpleaños se reserva con su paquete (un precio por el alquiler y lo que incluye), un número de
 * invitados entre el mínimo y el máximo del paquete y un horario. Al reservar se cobra el **anticipo**,
 * un porcentaje del precio del paquete (el 50 % por defecto, configurable); el **saldo** queda para el
 * día. Las dos cifras son bases sin IVA: cada cobro le aplica el suyo, y anticipo + saldo es el precio
 * del paquete al céntimo.
 *
 * El horario se guarda en minutos desde la medianoche del día del evento, en la hora del local: no hace
 * falta ninguna zona para comparar dos eventos del mismo día ni para decir «hoy hay un evento».
 */
import { compare, multiplyByRate, subtract, type Money } from "@l2/domain-money";

/** Un porcentaje en puntos básicos: 5000 es el 50 %. */
export type PuntosBasicos = number;

/** El anticipo y el saldo de un paquete: el anticipo redondeado al céntimo, el saldo lo que falta. */
export function anticipoDe(precio: Money, bps: PuntosBasicos): Readonly<{ anticipo: Money; saldo: Money }> {
  if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) {
    throw new RangeError(`El anticipo es un porcentaje entre 0,01 % y 100 %, recibido: ${bps} pb`);
  }
  const anticipo = multiplyByRate(precio, BigInt(bps), 10_000n, "HALF_UP");
  return { anticipo, saldo: subtract(precio, anticipo) };
}

/** Un evento ya reservado, como lo necesitan las reglas: su día, su horario y sus invitados. */
export type EventoEnAgenda = Readonly<{ fecha: string; inicio: number; fin: number; invitados: number }>;

/** ¿Comparten algún minuto? Uno que empieza justo cuando el otro termina no se solapa. */
export function seSolapan(a: EventoEnAgenda, b: EventoEnAgenda): boolean {
  return a.fecha === b.fecha && a.inicio < b.fin && b.inicio < a.fin;
}

export type ProblemaDeReserva =
  | "FECHA_PASADA"
  | "HORARIO_INVALIDO"
  | "INVITADOS_FUERA_DEL_PAQUETE"
  | "AFORO_DEL_HORARIO";

/**
 * ¿Se puede reservar? La fecha no puede ser anterior a hoy (en el calendario del local), el horario
 * empieza antes de terminar y dentro del día, los invitados caben en el paquete y, sumados a los de los
 * eventos que se solapan con él, no pasan del aforo (V-10: sus pulseras cuentan en el aforo).
 */
export function reservaProblem(input: {
  reserva: EventoEnAgenda;
  hoy: string;
  paquete: Readonly<{ minInvitados: number; maxInvitados: number }>;
  otros: readonly EventoEnAgenda[];
  aforo: number;
}): ProblemaDeReserva | null {
  const { reserva: r, paquete } = input;
  if (r.fecha < input.hoy) return "FECHA_PASADA";
  if (!Number.isInteger(r.inicio) || !Number.isInteger(r.fin) || r.inicio < 0 || r.fin > 24 * 60 || r.inicio >= r.fin) {
    return "HORARIO_INVALIDO";
  }
  if (r.invitados < paquete.minInvitados || r.invitados > paquete.maxInvitados) return "INVITADOS_FUERA_DEL_PAQUETE";
  const juntos = input.otros.filter((o) => seSolapan(o, r)).reduce((n, o) => n + o.invitados, r.invitados);
  if (juntos > input.aforo) return "AFORO_DEL_HORARIO";
  return null;
}

/** El primer paquete cuyo máximo de invitados pasa del aforo: un catálogo así no se publica (D-EVT). */
export function paqueteSobreAforo<T extends Readonly<{ maxInvitados: number }>>(paquetes: readonly T[], aforo: number): T | null {
  return paquetes.find((p) => p.maxInvitados > aforo) ?? null;
}

/** El anticipo nunca vale más que el paquete ni es cero: una comprobación para quien arma la línea. */
export function anticipoValido(anticipo: Money, precio: Money): boolean {
  return anticipo.amount > 0n && compare(anticipo, precio) <= 0;
}
