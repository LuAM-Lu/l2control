/**
 * L2 Control — Inventario (F8, Etapa 9).
 *
 * El catálogo de productos con sus precios con vigencia (B9-1) y las existencias como suma de
 * movimientos (B9-2). Las compras con costo promedio y el conteo físico llegan con B9-3 a B9-5.
 */
export {
  MAX_PRICE_MINOR,
  categoriesOf,
  changesTimeline,
  nameClash,
  nameKey,
  periodAt,
  priceAt,
  priceProblem,
  priceTimeline,
  sellableAt,
  type CatalogProduct,
  type PricePeriod,
  type PriceProblem,
  type ScheduledPrice,
} from "./catalogo.ts";
export { stockMovesOf, stockShortfalls, unitsHeld, type StockLine, type StockMove, type StockShortfall } from "./existencias.ts";
