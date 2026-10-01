# @l2/domain-inventory

Inventario (F8, Etapa 9). Módulo puro: sin base, sin red y sin reloj propio.

## Qué resuelve hoy (B9-1 a B9-4)

El **catálogo de productos** de venta directa y de consumo en cuenta (F8-02):

| Función | Qué decide |
|---|---|
| `priceTimeline` | El calendario de precios de cada producto a partir de lo programado. Con el mismo comienzo manda el último; un precio igual al anterior no abre tramo (así se cancela un cambio) |
| `priceAt` | El precio de un producto en un instante, o `null`. Sin precio no se vende |
| `changesTimeline` | Si programar un precio cambia algo; si no, no se guarda |
| `priceProblem` | Mayor que cero, dentro del tope ($ 10.000,00) y nunca hacia atrás |
| `nameKey`, `nameClash` | Un nombre, un producto: sin mayúsculas, acentos ni espacios de más, contando los que no se venden |
| `sellableAt`, `categoriesOf` | Lo que la caja ofrece en un instante y sus pestañas |

Y las **existencias** (B9-2, ADR-023):

| Función | Qué decide |
|---|---|
| `unitsHeld` | Cuántas unidades de cada producto tiene una cuenta: cada línea de un producto es una, y la movida a otra cuenta ya no es de esta |
| `stockMovesOf` | Qué movimientos causa pasar de una versión de la cuenta a la siguiente, solo de lo que lleva existencia, ordenados por producto (el orden de los candados) |
| `stockShortfalls` | Lo que no alcanza: sin existencia no se vende, y lo que no se sabe que hay, no hay |

Y el **costo** (B9-3, costo promedio ponderado perpetuo):

| Función | Qué decide |
|---|---|
| `entryLineProblem`, `entryLineTotals` | Una línea de entrada: tantos bultos de tantas unidades a tanto el bulto (se compra la caja de 24, se vende la unidad), con sus topes; lo regalado (costo cero) entra |
| `costOfUnits` | El valor al costo que se lleva una venta: su parte proporcional del valor del inventario; la última unidad se lleva lo que quede, al céntimo |
| `costOfReturn` | Lo que vuelve cuando una cuenta devuelve lo que sacó: su parte de lo que se llevó, para que el costo promedio no cambie |
| `averageUnitCostMinor`, `marginBasisPoints` | El costo promedio de una unidad y el margen sobre el precio, para enseñarlos |

Se lleva el **valor** del inventario (no un costo unitario redondeado): tras dos compras el costo es
(c₁ + c₂) / (q₁ + q₂), como lo calcula el contador, y vendido todo el valor queda en cero. La aritmética
es de `@l2/domain-money` (`multiplyByRate`).

Y las **salidas y el conteo** (B9-4):

| Función | Qué decide |
|---|---|
| `STOCK_OUT_REASONS` | Por qué sale algo sin venderse: merma, consumo interno, regalo o devolución al proveedor (lista cerrada) |
| `countMoves` | Lo que mueve un conteo: lo contado menos lo esperado, de cada producto con diferencia |
| `costOfSurplus` | A qué costo entra lo que un conteo encuentra de más: al promedio; sin existencia, al de la última entrada; sin nada, a cero |

La regla que lo ordena: **el precio es un dato con fecha**. Cambiarlo programa el tramo siguiente;
lo vendido se queda con el precio que tenía (la línea de la cuenta lo copia al venderse).

## Qué no le corresponde

- **Guardar ni leer.** Las filas viven en `product`, `product_price` y `stock_movement`
  (`@l2/database`) y los casos de uso en `@l2/application` (`productos`, y la existencia la mueve
  `cuentas.guardar` con el candado del producto).
- **El IVA.** El producto dice su trato (`GENERAL`, `REDUCIDA`, `EXENTA`); la alícuota y el cálculo
  son de `@l2/domain-tax`.
- **El bolívar.** Todo precio está en dólares; la conversión es de `@l2/domain-money` con la tasa
  congelada del cobro (ADR-005).

## Lo que llega después

Las alertas de stock crítico (B9-5). Las
recetas y la descarga al marcar LISTO van con el restaurante (B6-4).
