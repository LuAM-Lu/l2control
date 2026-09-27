/**
 * Los billetes de dólar que se reciben en el mostrador, de menor a mayor.
 *
 * FIJOS, no «sugeridos» según la cuenta: la cajera los toca sin mirar y cada
 * uno está siempre en el mismo sitio. Antes la fila cambiaba con el monto
 * (`$20 · $50 · $57 · $100 · $150`) y un «$57» no es un billete. Cada toque
 * SUMA al pago en efectivo que se está recibiendo: tres de $1 y uno de $5 son
 * un pago de $8, no cuatro pagos. En Venezuela el de $1 es el más usado.
 */
export const BILLETES_USD = [1, 5, 10, 20, 50, 100] as const;
