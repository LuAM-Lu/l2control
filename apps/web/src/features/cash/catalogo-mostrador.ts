/**
 * Catálogo de Mostrador (Snacks, Bebidas, Golosinas y Cafetería) — F8-02, DEC-21.
 *
 * Productos de alta rotación para venta directa en mostrador sin exigir
 * pulsera de parque ni mesa de restaurante, o para añadir consumos adicionales
 * a una cuenta abierta antes de su cobro.
 */

export type CategoriaMostrador = "Todos" | "Bebidas" | "Snacks" | "Golosinas" | "Café";

export type ProductoMostrador = Readonly<{
  id: string;
  name: string;
  category: "Bebidas" | "Snacks" | "Golosinas" | "Café";
  priceMinor: string; // En céntimos de USD, ej: "150" = $1.50
}>;

export const CATEGORIAS_MOSTRADOR: readonly CategoriaMostrador[] = [
  "Todos",
  "Bebidas",
  "Snacks",
  "Golosinas",
  "Café",
];

export const PRODUCTOS_MOSTRADOR: readonly ProductoMostrador[] = [
  { id: "p-agua", name: "Agua mineral", category: "Bebidas", priceMinor: "100" },
  { id: "p-malta", name: "Malta Polar", category: "Bebidas", priceMinor: "150" },
  { id: "p-refresco", name: "Refresco lata", category: "Bebidas", priceMinor: "150" },
  { id: "p-jugo", name: "Jugo natural", category: "Bebidas", priceMinor: "250" },
  { id: "p-doritos", name: "Doritos", category: "Snacks", priceMinor: "150" },
  { id: "p-platanitos", name: "Platanitos", category: "Snacks", priceMinor: "120" },
  { id: "p-tequenos", name: "Tequeños (ración)", category: "Snacks", priceMinor: "500" },
  { id: "p-papas", name: "Papas fritas", category: "Snacks", priceMinor: "350" },
  { id: "p-oreo", name: "Galletas Oreo", category: "Golosinas", priceMinor: "120" },
  { id: "p-cricri", name: "Chocolate Cri-Cri", category: "Golosinas", priceMinor: "150" },
  { id: "p-pirulin", name: "Pirulín", category: "Golosinas", priceMinor: "250" },
  { id: "p-gomitas", name: "Gomitas dulces", category: "Golosinas", priceMinor: "80" },
  { id: "p-cafe-am", name: "Café americano", category: "Café", priceMinor: "100" },
  { id: "p-cafe-leche", name: "Café con leche", category: "Café", priceMinor: "150" },
];

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
