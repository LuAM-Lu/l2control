/**
 * El local y su carta, de ejemplo — F6-01, F6-03, V3 (D11).
 *
 * ⚠ DATOS INVENTADOS, pero ya con la forma del dibujo del cliente: parque
 * arriba, entrada de la calle a la izquierda, caja en L al centro-derecha y
 * cocina detrás de la barra. **Las medidas son aproximadas** hasta el
 * relevamiento en sitio (F0-03); la carta y sus precios, hasta F0-04.
 *
 * Numeración de D11: 1 a 4 «Junto al parque», 5 a 8 «Salón», 4 sillas cada
 * una. Es el punto de partida, no una constante: el editor del plano (V4) las
 * mueve, las renumera y cambia el nombre de la zona.
 *
 * Todo se valida contra el contrato al cargar (§11.4): una mesa fuera de las
 * paredes o encima de otra rompe aquí y no en servicio.
 */
import { MenuSchema, PlanoLocalSchema, type MenuDto, type PlanoLocalDto } from "@l2/contracts";

/** Mesa redonda de 4 sillas: 90 cm de diámetro. */
const redonda = (n: number, zone: string, x: number, y: number) => ({
  id: `mesa-${n}`,
  label: String(n),
  zone,
  seats: 4,
  shape: "REDONDA" as const,
  x,
  y,
  width: 90,
  height: 90,
  rotation: 0,
});

/** Local de 8 × 6 metros, en centímetros. */
export const PLANO_DEMO: PlanoLocalDto = PlanoLocalSchema.parse({
  width: 800,
  height: 600,
  tables: [
    // Junto al parque: la fila de arriba, de izquierda a derecha.
    redonda(1, "Junto al parque", 130, 240),
    redonda(2, "Junto al parque", 280, 240),
    redonda(3, "Junto al parque", 430, 240),
    redonda(4, "Junto al parque", 580, 240),
    // Salón: dos filas de dos hacia la calle.
    redonda(5, "Salón", 130, 390),
    redonda(6, "Salón", 280, 390),
    redonda(7, "Salón", 130, 505),
    redonda(8, "Salón", 280, 505),
  ],
  fixtures: [
    { id: "parque", kind: "PARQUE", x: 0, y: 0, width: 800, height: 170, label: "Parque" },
    // La puerta del parque al salón, arriba a la izquierda.
    { id: "puerta-parque", kind: "PUERTA", x: 60, y: 160, width: 110, height: 20, label: "Paso al parque" },
    // La entrada de la calle, en la pared izquierda.
    { id: "entrada", kind: "PUERTA", x: 0, y: 300, width: 20, height: 130, label: "Entrada" },
    // La caja: UNA barra en L, con el brazo largo hacia el salón y el corto
    // bajando por la izquierda, hacia la cocina.
    {
      id: "caja",
      kind: "CAJA",
      x: 470,
      y: 360,
      width: 260,
      height: 140,
      label: "Caja",
      points: [
        { x: 470, y: 360 },
        { x: 730, y: 360 },
        { x: 730, y: 420 },
        { x: 530, y: 420 },
        { x: 530, y: 500 },
        { x: 470, y: 500 },
      ],
    },
    { id: "cocina", kind: "COCINA", x: 470, y: 520, width: 330, height: 80, label: "Cocina" },
  ],
});

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
