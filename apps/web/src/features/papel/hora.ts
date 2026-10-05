import { instantOfLocalDateTime, localDateTimeOf } from "@l2/domain-rates";

/**
 * Las horas del formulario de papel, en la zona del local (B3-7, ADR-027).
 *
 * Una persona escribe «2:14 pm del 27»: es la hora del reloj del LOCAL, no la del aparato. El campo de fecha y
 * hora del navegador entrega un texto `AAAA-MM-DDTHH:mm` sin zona; se lee como la hora de la zona de la
 * sucursal (`@l2/domain-rates`) y se vuelve instante, y al revés. Nada de `new Date("…")` con ese texto: el
 * navegador lo leería en SU zona.
 */

/** `AAAA-MM-DDTHH:mm` de un instante, en la zona del local: lo que un campo de fecha y hora enseña. */
export const aTexto = localDateTimeOf;

/** El instante de un texto `AAAA-MM-DDTHH:mm` leído como hora del local, o `null` si no es una hora. */
export const deTexto = instantOfLocalDateTime;

/** El instante ISO de un texto `AAAA-MM-DDTHH:mm` del local, o `null`. Es lo que viaja al servidor. */
export function aIso(texto: string, zona: string): string | null {
  const t = instantOfLocalDateTime(texto, zona);
  return t === null ? null : new Date(t).toISOString();
}
