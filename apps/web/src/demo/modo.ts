/**
 * El interruptor de la demostración.
 *
 * `NEXT_PUBLIC_DEMO=off` apaga lo que simula OPERACIÓN: el simulador (y su chip
 * «DEMO» en las barras) y las cuentas y ventas con las que arrancan las
 * estaciones. Tarifas, medios de pago, personas y la instantánea del parque
 * siguen viniendo de esta carpeta hasta que los sirva el servidor: sin ellos
 * no hay nada que pintar. Por defecto está encendida, porque sin backend es la
 * única forma de enseñar el producto.
 *
 * Una sola variable a propósito: dos interruptores que se pueden combinar son
 * cuatro estados, y dos de ellos no tienen sentido.
 */
export const DEMO_ACTIVA = process.env.NEXT_PUBLIC_DEMO !== "off";
