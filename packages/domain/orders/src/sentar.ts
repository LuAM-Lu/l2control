/**
 * Qué se pide del cliente al sentarlo — B6-22 (M-40).
 *
 * Administración elige en Ajustes → Sucursal cómo se sienta: «Más seguro» (el nombre y la cédula antes del primer
 * pedido, como desde B6-9) o «Más rápido» (el nombre al sentar; la cédula antes del segundo pedido y antes de cobrar).
 * El teléfono, «Siempre» o «Solo si queda una deuda». Lo mismo lo usan la tablet, para no pedir de más, y el servidor,
 * que es el que decide.
 */

/** Cómo se sienta en la sucursal: SEGURO o RAPIDO. */
export type ComoSeSienta = "SEGURO" | "RAPIDO";
/** Cuándo se pide el teléfono: SIEMPRE o DEUDA (solo cuando queda una deuda). */
export type CuandoElTelefono = "SIEMPRE" | "DEUDA";

/** Lo que hace falta del cliente, además de su nombre. */
export type Exigido = Readonly<{ cedula: boolean; telefono: boolean }>;

/** Al sentar: la cédula con «Más seguro»; el teléfono con «Siempre». El nombre, siempre. */
export function exigidoAlSentar(sentar: ComoSeSienta, telefono: CuandoElTelefono): Exigido {
  return { cedula: sentar === "SEGURO", telefono: telefono === "SIEMPRE" };
}

/**
 * Al completar o poner el cliente de una cuenta abierta: la cédula siempre; el teléfono con «Siempre» y en una venta que
 * queda pendiente (`quedaDebiendo`: se va y vuelve a pagar, hay que poder llamarlo).
 */
export function exigidoAlCompletar(telefono: CuandoElTelefono, quedaDebiendo: boolean): Exigido {
  return { cedula: true, telefono: telefono === "SIEMPRE" || quedaDebiendo };
}

/**
 * ¿Hay que pedir la cédula antes de este pedido? Una cuenta sentada sin ella recibe su primer pedido en segundos; el
 * segundo espera a la cédula. `sinCedula`: la cuenta tiene cliente y le falta la cédula; `pedidos`: los que ya se
 * enviaron. Vale cualquiera que sea el ajuste de ahora: la regla es de la cuenta, no del día.
 */
export function pideLaCedula(c: Readonly<{ sinCedula: boolean; pedidos: number }>): boolean {
  return c.sinCedula && c.pedidos >= 1;
}
