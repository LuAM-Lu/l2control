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
export type EventoEnAgenda = Readonly<{ fecha: string; inicio: number; fin: number; invitados: number; /** B10-4: no comparte el parque. */ exclusivo?: boolean }>;

/** ¿Comparten algún minuto? Uno que empieza justo cuando el otro termina no se solapa. */
export function seSolapan(a: EventoEnAgenda, b: EventoEnAgenda): boolean {
  return a.fecha === b.fecha && a.inicio < b.fin && b.inicio < a.fin;
}

export type ProblemaDeReserva =
  | "FECHA_PASADA"
  | "HORARIO_INVALIDO"
  | "INVITADOS_FUERA_DEL_PAQUETE"
  | "AFORO_DEL_HORARIO"
  | "HORARIO_EXCLUSIVO";

/**
 * ¿Se puede reservar? La fecha no puede ser anterior a hoy (en el calendario del local), el horario
 * empieza antes de terminar y dentro del día, los invitados caben en el paquete y, sumados a los de los
 * eventos que se solapan con él, no pasan del aforo (V-10: sus pulseras cuentan en el aforo). Un exclusivo (B10-4) no
 * comparte su horario con otro cumpleaños, ni otro se reserva encima de él.
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
  const solapados = input.otros.filter((o) => seSolapan(o, r));
  if (solapados.length > 0 && (r.exclusivo === true || solapados.some((o) => o.exclusivo === true))) return "HORARIO_EXCLUSIVO";
  const juntos = solapados.reduce((n, o) => n + o.invitados, r.invitados);
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

/* ------------------------------------------------- el aforo del cumpleaños (B10-4, M-39, X-12) */

/** Desde cuánto antes de empezar el parque guarda el lugar de los invitados que no han llegado: 30 minutos. */
export const GUARDA_LUGARES_ANTES_MS = 30 * 60_000;

/** Un cumpleaños de hoy como lo mira la puerta: su horario en instantes, cuántos invitados y cuántos entraron. */
export type CumpleanosEnLaPuerta = Readonly<{
  id: string;
  /** Quién cumple: «el cumpleaños de Sofía». */
  nombre: string;
  empiezaEn: number;
  terminaEn: number;
  invitados: number;
  entraron: number;
  /** Su paquete es exclusivo: en su horario no entran visitas normales. */
  exclusivo: boolean;
}>;

export type LugaresDeCumpleanos = Readonly<{
  /** Los lugares guardados para los invitados que no han llegado. */
  guardados: number;
  /** De quién son, con cuántos cada uno (solo los que guardan alguno). */
  porCumpleanos: readonly Readonly<{ id: string; nombre: string; lugares: number }>[];
  /** El cumpleaños exclusivo en curso, si hay: la puerta no deja entrar visitas normales. */
  exclusivo: CumpleanosEnLaPuerta | null;
}>;

/**
 * Los lugares que guardan los cumpleaños en este instante (B10-4). Desde 30 minutos antes de empezar y hasta su fin,
 * cada uno guarda el de sus invitados que no han llegado: las visitas normales tienen el aforo menos esos lugares. Un
 * exclusivo cierra la puerta a las visitas normales durante su horario. `salvo` es el cumpleaños cuyos invitados están
 * entrando: sus lugares son suyos, no se le guardan contra él.
 */
export function lugaresDeCumpleanos(cumpleanos: readonly CumpleanosEnLaPuerta[], ahora: number, salvo?: string): LugaresDeCumpleanos {
  const otros = cumpleanos.filter((c) => c.id !== salvo);
  const porCumpleanos = otros
    .filter((c) => ahora >= c.empiezaEn - GUARDA_LUGARES_ANTES_MS && ahora < c.terminaEn)
    .map((c) => ({ id: c.id, nombre: c.nombre, lugares: Math.max(0, c.invitados - c.entraron) }))
    .filter((c) => c.lugares > 0);
  return {
    guardados: porCumpleanos.reduce((n, c) => n + c.lugares, 0),
    porCumpleanos,
    exclusivo: otros.find((c) => c.exclusivo && ahora >= c.empiezaEn && ahora < c.terminaEn) ?? null,
  };
}

/** «7 guardados para el cumpleaños de Sofía»; con varios, «9 guardados para los cumpleaños de Sofía y Pedro». */
export function fraseDeGuardados(l: Pick<LugaresDeCumpleanos, "guardados" | "porCumpleanos">): string {
  const nombres = l.porCumpleanos.map((c) => c.nombre);
  const quienes = nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`;
  return `${l.guardados} ${l.guardados === 1 ? "guardado" : "guardados"} para ${nombres.length > 1 ? "los cumpleaños" : "el cumpleaños"} de ${quienes}`;
}

/**
 * ¿Admite la puerta una visita normal de `entran` niños? Con `dentro` niños en sala y el aforo, menos los lugares
 * guardados; nunca con un exclusivo en curso. El motivo, para decirlo en la entrada.
 */
export function puertaParaVisitas(
  input: Readonly<{ dentro: number; entran: number; aforo: number; lugares: LugaresDeCumpleanos }>,
): Readonly<{ admite: true } | { admite: false; motivo: "EXCLUSIVO" | "AFORO"; libres: number }> {
  const libres = Math.max(0, input.aforo - input.dentro - input.lugares.guardados);
  if (input.lugares.exclusivo) return { admite: false, motivo: "EXCLUSIVO", libres: 0 };
  return input.entran <= libres ? { admite: true } : { admite: false, motivo: "AFORO", libres };
}

/** «6:00 pm»: un minuto del día en la hora comercial (12 horas), para lo que dice el servidor. */
export function horaComercial(minutoDelDia: number): string {
  const h = Math.floor(minutoDelDia / 60) % 24;
  const m = minutoDelDia % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}
