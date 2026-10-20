/**
 * Las denominaciones del arqueo — F4-07. Lo demás del turno (lo cobrado, las excepciones, el nombre
 * de cada medio) sale del libro del servidor desde B3-5.
 */
import type { AjustesSucursalDto, TurnoDto } from "@l2/contracts";
import { businessDayAt, businessDayEnd, isAfterHours } from "@l2/domain-cash";
import { fromMajor, type Money } from "@l2/domain-money";

/**
 * Cuándo termina el día de negocio de un turno (B3-24): lo dice el servidor; si no vino, con la hora de los ajustes del
 * local, la misma regla del dominio. Desde ahí es una caja de un día anterior.
 */
export function finDelDiaDelTurno(
  t: Pick<TurnoDto, "businessDate"> & { terminaEl?: string | null | undefined },
  ajustes: Pick<AjustesSucursalDto, "zonaHoraria" | "finDelDiaMin">,
): number {
  return t.terminaEl ? Date.parse(t.terminaEl) : businessDayEnd(t.businessDate, ajustes.zonaHoraria, ajustes.finDelDiaMin);
}

/** El día de la semana del horario de los ajustes, por `getUTCDay()` (0 = domingo). */
const DIAS_DEL_HORARIO = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"] as const;
/** «22:30» → 1350. */
const minutosDeHora = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

type AjustesDelCierre = Pick<AjustesSucursalDto, "zonaHoraria" | "finDelDiaMin" | "horario" | "cierreDelLocalMin">;

/**
 * A qué hora cierra el local el día de negocio que se trabaja en `ahora` (B5-7, M-40), en minutos desde la medianoche: la
 * del horario de ese día, si lo declara abierto; si no (sin horario, o cerrado ese día), la «Hora de cierre del local».
 */
export function cierreDelDia(ajustes: AjustesDelCierre, ahora: number): number {
  const dia = businessDayAt(ahora, ajustes.zonaHoraria, ajustes.finDelDiaMin);
  const semana = DIAS_DEL_HORARIO[new Date(`${dia}T12:00:00.000Z`).getUTCDay()];
  const delDia = ajustes.horario?.find((h) => h.dia === semana);
  return delDia?.kind === "ABIERTO" ? minutosDeHora(delDia.cierra) : ajustes.cierreDelLocalMin;
}

/** Desde la hora de cierre del local y hasta que el día termina (B3-24, B5-7): una caja que siga abierta lo avisa. */
export const pasadaLaHoraDeCierre = (ajustes: AjustesDelCierre, ahora: number): boolean =>
  ahora > 0 && isAfterHours(ahora, ajustes.zonaHoraria, ajustes.finDelDiaMin, cierreDelDia(ajustes, ahora));

/** Lo que falta para cerrar (B5-7), en una frase: lo de la cola, las cuentas del salón y los niños en la sala. */
export function loQueFalta({ cola, salon, ninos }: Readonly<{ cola: number; salon: number; ninos: number }>): string {
  const partes = [
    cola > 0 ? (cola === 1 ? "1 cuenta por cobrar" : `${cola} cuentas por cobrar`) : null,
    salon > 0 ? (salon === 1 ? "1 cuenta del salón sin pedir la cuenta" : `${salon} cuentas del salón sin pedir la cuenta`) : null,
    ninos > 0 ? (ninos === 1 ? "1 niño en la sala" : `${ninos} niños en la sala`) : null,
  ].filter((p): p is string => p !== null);
  if (partes.length === 0) return "No queda nada pendiente: solo falta su corte Z.";
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
  return `${partes.length === 1 && cola + salon + ninos === 1 ? "Queda" : "Quedan"} ${lista}.`;
}

const DIA_DEL_TURNO = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", timeZone: "UTC" });
/** «9 de octubre»: el día de negocio de un turno como lo dice la caja. Es fecha, no instante: se pinta en UTC. */
export const diaDelTurno = (dia: string): string => DIA_DEL_TURNO.format(Date.parse(`${dia}T12:00:00.000Z`));

/** Denominaciones que circulan, para el conteo del arqueo (F4-07). */
export const DENOMINACIONES: Record<"USD" | "VES", Money[]> = {
  USD: [
    fromMajor("100.00", "USD"),
    fromMajor("50.00", "USD"),
    fromMajor("20.00", "USD"),
    fromMajor("10.00", "USD"),
    fromMajor("5.00", "USD"),
    fromMajor("1.00", "USD"),
    fromMajor("0.25", "USD"),
  ],
  VES: [
    fromMajor("500.00", "VES"),
    fromMajor("200.00", "VES"),
    fromMajor("100.00", "VES"),
    fromMajor("50.00", "VES"),
    fromMajor("20.00", "VES"),
    fromMajor("10.00", "VES"),
  ],
};
