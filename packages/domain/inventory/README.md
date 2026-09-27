# @l2/domain-inventory

Inventario (F8, Etapa 9). Módulo puro: sin base, sin red y sin reloj propio.

## Qué resuelve hoy (B9-1)

El **catálogo de productos** de venta directa y de consumo en cuenta (F8-02):

| Función | Qué decide |
|---|---|
| `priceTimeline` | El calendario de precios de cada producto a partir de lo programado. Con el mismo comienzo manda el último; un precio igual al anterior no abre tramo (así se cancela un cambio) |
| `priceAt` | El precio de un producto en un instante, o `null`. Sin precio no se vende |
| `changesTimeline` | Si programar un precio cambia algo; si no, no se guarda |
| `priceProblem` | Mayor que cero, dentro del tope ($ 10.000,00) y nunca hacia atrás |
| `nameKey`, `nameClash` | Un nombre, un producto: sin mayúsculas, acentos ni espacios de más, contando los que no se venden |
| `sellableAt`, `categoriesOf` | Lo que la caja ofrece en un instante y sus pestañas |

La regla que lo ordena: **el precio es un dato con fecha**. Cambiarlo programa el tramo siguiente;
lo vendido se queda con el precio que tenía (la línea de la cuenta lo copia al venderse).

## Qué no le corresponde

- **Guardar ni leer.** Las filas viven en `product` y `product_price` (`@l2/database`) y los casos
  de uso en `@l2/application` (`productos`).
- **El IVA.** El producto dice su trato (`GENERAL`, `REDUCIDA`, `EXENTA`); la alícuota y el cálculo
  son de `@l2/domain-tax`.
- **El bolívar.** Todo precio está en dólares; la conversión es de `@l2/domain-money` con la tasa
  congelada del cobro (ADR-005).

## Lo que llega después

Movimientos de stock de solo-agregar (B9-2), compras con costo promedio ponderado y conversiones de
unidad (B9-3), ajustes con motivo y conteo físico (B9-4) y alertas de stock crítico (B9-5). Las
recetas y la descarga al marcar LISTO van con el restaurante (B6-4).
