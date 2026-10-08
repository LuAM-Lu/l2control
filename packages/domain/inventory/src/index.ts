/**
 * L2 Control — Inventario (F8, Etapa 9).
 *
 * El catálogo de productos con sus precios con vigencia (B9-1) y las existencias como suma de
 * movimientos (B9-2), con su costo promedio ponderado (B9-3). El conteo físico y las alertas, B9-4 y B9-5.
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
export {
  MAX_ENTRY_LINE_MINOR,
  MAX_PACK_SIZE,
  MAX_PACKS,
  averageUnitCostMinor,
  costOfReturn,
  costOfUnits,
  entryLineProblem,
  entryLineTotals,
  marginBasisPoints,
  packCostOf,
  type EntryCostBasis,
  type EntryLine,
  type EntryLineProblem,
  type StockValue,
} from "./costo.ts";
export { STOCK_OUT_REASONS, costOfSurplus, countMoves, type CountLine, type StockOutReason } from "./ajustes.ts";
export { stockAlerts, stockStatus, type StockAlertProduct, type StockStatus } from "./alertas.ts";
export {
  CATEGORY_MAX_LENGTH,
  CATEGORY_MIN_LENGTH,
  STARTER_CATEGORIES,
  categoryProblem,
  cleanCategory,
  findCategory,
  type CategoryProblem,
} from "./categorias.ts";
export {
  PRODUCT_KINDS,
  barcodeProblem,
  kindTracksStock,
  nextSku,
  normalizeBarcode,
  skuPrefix,
  type BarcodeProblem,
  type ProductKind,
} from "./identificacion.ts";
export { conSaldo, resumenDeKardex, type FilaDeKardex, type MovimientoDeKardex } from "./kardex.ts";
export { diferenciasDeConteo, type LineaContada, type TotalesDeConteo } from "./conteo.ts";
