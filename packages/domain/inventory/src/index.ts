/**
 * L2 Control — Inventario (F8, Etapa 9).
 *
 * Hoy, el catálogo de productos con sus precios con vigencia (B9-1). Los movimientos de stock,
 * las compras con costo promedio y el conteo físico llegan con B9-2 a B9-5.
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
