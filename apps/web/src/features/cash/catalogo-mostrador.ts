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
 * Genera sugerencias de billetes y redondeos superiores según la cantidad que falta.
 * Para cuentas pequeñas (<$50): billetes estándar $5, $10, $20, $50, $100.
 * Para cuentas grandes (>$50 o cientos de dólares): múltiplos lógicos y redondeos.
 */
export function calcularBilletesSugeridos(faltaCents: bigint): number[] {
  // Hacia arriba: sugerir $57 para una deuda de $57,40 dejaría 40 céntimos
  // pendientes. Son billetes enteros, así que el número ya no es dinero.
  const dolares = Number((faltaCents + 99n) / 100n);
  if (dolares < 50) {
    return [5, 10, 20, 50, 100];
  }
  if (dolares <= 100) {
    return [20, 50, dolares, 100, 150]
      .filter((v, i, a) => a.indexOf(v) === i && v > 0)
      .sort((a, b) => a - b);
  }
  if (dolares <= 500) {
    const redondo1 = Math.ceil(dolares / 50) * 50;
    const redondo2 = Math.ceil(dolares / 100) * 100;
    const redondo3 = redondo2 + 100;
    return [100, dolares, redondo1, redondo2, redondo3]
      .filter((v, i, a) => a.indexOf(v) === i && v > 0)
      .sort((a, b) => a - b)
      .slice(0, 5);
  }
  // Mayores a $500
  const redondo1 = Math.ceil(dolares / 100) * 100;
  const redondo2 = Math.ceil(dolares / 500) * 500;
  const redondo3 = redondo2 + 500;
  return [100, 500, dolares, redondo1, redondo2, redondo3]
    .filter((v, i, a) => a.indexOf(v) === i && v > 0)
    .sort((a, b) => a - b)
    .slice(0, 5);
}
