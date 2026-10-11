/**
 * Las denominaciones del arqueo — F4-07. Lo demás del turno (lo cobrado, las excepciones, el nombre
 * de cada medio) sale del libro del servidor desde B3-5.
 */
import type { AjustesSucursalDto, TurnoDto } from "@l2/contracts";
import { businessDayEnd } from "@l2/domain-cash";
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
