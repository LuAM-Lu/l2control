/**
 * Plano de mesas y carta de ejemplo — F6-01, F6-03.
 *
 * ⚠ DATOS INVENTADOS. Cuántas mesas hay y cómo se reparten sale del
 * relevamiento en sitio (F0-03); la carta y sus precios, del menú real
 * (F0-04). Mientras tanto, 8 mesas dentro del rango de DEC-7 y una carta
 * corta con los platos que ya usan los escenarios del simulador.
 *
 * Se validan contra el contrato al cargar (§11.4): si alguien añade una mesa
 * con un número repetido o un plato sin precio, rompe aquí y no en servicio.
 */
import { FloorPlanSchema, MenuSchema, type FloorPlanDto, type MenuDto } from "@l2/contracts";

export const PLANO_DEMO: FloorPlanDto = FloorPlanSchema.parse([
  { id: "mesa-1", label: "1", zone: "Salón", seats: 4 },
  { id: "mesa-2", label: "2", zone: "Salón", seats: 4 },
  { id: "mesa-3", label: "3", zone: "Salón", seats: 4 },
  { id: "mesa-4", label: "4", zone: "Salón", seats: 6 },
  { id: "mesa-5", label: "5", zone: "Salón", seats: 6 },
  { id: "mesa-6", label: "6", zone: "Salón", seats: 4 },
  { id: "mesa-7", label: "7", zone: "Frente al parque", seats: 6 },
  { id: "mesa-8", label: "8", zone: "Frente al parque", seats: 6 },
]);

const usd = (minor: string) => ({ minor, currency: "USD" as const });

export const CARTA_DEMO: MenuDto = MenuSchema.parse([
  { id: "pizza-margarita", name: "Pizza margarita", category: "Platos", price: usd("850"), available: true },
  { id: "hamburguesa", name: "Hamburguesa", category: "Platos", price: usd("750"), available: true },
  { id: "nuggets", name: "Nuggets con papas", category: "Platos", price: usd("600"), available: true },
  { id: "perro-caliente", name: "Perro caliente", category: "Platos", price: usd("450"), available: true },
  { id: "pasta-bolognesa", name: "Pasta bolognesa", category: "Platos", price: usd("700"), available: false },
  { id: "tequenos", name: "Tequeños", category: "Para compartir", price: usd("500"), available: true },
  { id: "tostones", name: "Tostones con queso", category: "Para compartir", price: usd("450"), available: true },
  { id: "papas", name: "Papas fritas", category: "Para compartir", price: usd("350"), available: true },
  { id: "jugo-naranja", name: "Jugo de naranja", category: "Bebidas", price: usd("250"), available: true },
  { id: "malta", name: "Malta", category: "Bebidas", price: usd("150"), available: true },
  { id: "refresco", name: "Refresco", category: "Bebidas", price: usd("150"), available: true },
  { id: "agua", name: "Agua mineral", category: "Bebidas", price: usd("100"), available: true },
  { id: "cafe", name: "Café", category: "Bebidas", price: usd("150"), available: true },
  { id: "helado", name: "Copa de helado", category: "Postres", price: usd("350"), available: true },
  { id: "torta", name: "Torta de chocolate", category: "Postres", price: usd("400"), available: true },
  { id: "tres-leches", name: "Tres leches", category: "Postres", price: usd("400"), available: true },
]);
