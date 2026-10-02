/**
 * El catálogo de productos del lado de la pantalla (B9-1): de lo que manda el servidor a lo que la
 * caja vende en un instante. El cálculo es del dominio (`@l2/domain-inventory`); aquí solo se
 * traduce la forma del contrato.
 */
import type { CatalogoDto, ProductoDto, TaxCode } from "@l2/contracts";
import { priceTimeline, sellableAt, type PricePeriod } from "@l2/domain-inventory";
import type { Money } from "@l2/domain-money";

/** Un producto que se puede vender ahora, con su precio de ahora. */
export type ProductoALaVenta = Readonly<{
  id: string;
  nombre: string;
  categoria: string;
  taxCode: TaxCode;
  precio: Money;
  /** Cuántas quedan (B9-2), o `null` si no lleva existencia. Con 0 no se vende (ADR-023). */
  existencia: number | null;
  /** Para venderlo pasándolo por el lector (B9-6). */
  sku: string;
  codigoBarras: string | null;
  /** Si el mesero lo ofrece en las mesas (B6-1): la carta del restaurante es el catálogo con esta marca. */
  enCarta: boolean;
}>;

/** El calendario de precios de todo el catálogo, como lo entiende el dominio. */
export function periodosDe(productos: readonly ProductoDto[]): PricePeriod[] {
  return priceTimeline(
    productos.flatMap((p) =>
      p.precios.map((t) => ({
        id: t.id,
        productId: p.id,
        amountMinor: BigInt(t.precio.minor),
        effectiveFrom: Date.parse(t.desde),
        scheduledAt: Date.parse(t.programadoEl),
      })),
    ),
  );
}

/**
 * Lo que la caja vende en `instante`: a la venta y con precio vigente, en el orden del catálogo
 * (categoría y nombre). Un precio programado para mañana entra a la medianoche sin recargar.
 */
export function productosALaVenta(catalogo: CatalogoDto, instante: number): ProductoALaVenta[] {
  const productos = catalogo.productos.map((p) => ({ ...p, name: p.nombre, category: p.categoria, active: p.activo }));
  return sellableAt(productos, periodosDe(catalogo.productos), instante).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    taxCode: p.taxCode,
    precio: p.price,
    existencia: p.existencia,
    sku: p.sku,
    codigoBarras: p.codigoBarras,
    enCarta: p.enCarta,
  }));
}

/**
 * La carta del mesero en `instante` (B6-1): lo que se vende ahora y está en la carta. Lo agotado sale
 * (la pantalla lo enseña sin dejar pedirlo), porque el mesero tiene que poder decir «no queda».
 */
export function cartaDelMesero(catalogo: CatalogoDto, instante: number): ProductoALaVenta[] {
  return productosALaVenta(catalogo, instante).filter((p) => p.enCarta);
}

/** ¿Se puede pedir ahora? Lo que no lleva existencia, siempre; lo que sí, mientras quede (ADR-023). */
export const disponible = (p: Pick<ProductoALaVenta, "existencia">): boolean => p.existencia === null || p.existencia > 0;
