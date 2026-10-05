# @l2/domain-tax

Motor de IVA e IGTF. Implementa §5.3 del plan.

> ⚠️ **Las alícuotas y reglas de este paquete son datos, no afirmaciones sobre la normativa.**
> Los valores concretos los confirma el contador del cliente (DEC-1). Aquí vive la mecánica.

## La decisión que estructura todo el módulo

**IVA e IGTF no se calculan juntos**, y no por comodidad:

| | IVA | IGTF |
|---|---|---|
| Depende de | **Qué** se vendió | **En qué moneda se paga** |
| Se conoce | Al armar la cuenta | Solo cuando el cliente decide cómo paga |
| En un pago mixto | Es el mismo | Se aplica **solo a la porción en divisas o cripto** |

Por eso son dos funciones y no una. Meterlas en la misma obligaría a conocer el medio de pago
al armar la cuenta, que es imposible: el cliente aún no ha dicho cómo va a pagar.

```ts
// 1. Al armar la cuenta
const doc = computeDocument({ lines, discounts, service, rules, at, currency });
// doc.total → lo que se factura. El IGTF NO está aquí.

// 2. Cuando el cliente decide cómo paga
const igtf = computeIgtf(payments, 300, "USD");
// Solo tributan los medios marcados con `triggersIgtf`.
```

## Orden de cálculo (§5.3)

```
1.  Subtotal de líneas
2.  − Descuentos, PRORRATEADOS por línea
3.  + Servicio
4.  = Base imponible AGRUPADA por alícuota
5.  + IVA por alícuota
6.  = TOTAL DEL DOCUMENTO
    ──────────────────────────────
7.  Reparto entre medios de pago
8.  + IGTF sobre los medios que lo disparan
9.  = TOTAL A COBRAR
```

## Tres decisiones que no son obvias

**El descuento se prorratea, no se resta del final.** Si la cuenta mezcla ítems gravados y
exentos, restarlo del total regalaría IVA que sí se debe. Hay una prueba que lo demuestra con
números: 1,60 de diferencia en una cuenta de 200.

**El IVA se calcula una vez por grupo de alícuota, no línea a línea.** Tres líneas de 0,03 al
16 % dan 0,01 agrupadas y 0,00 si se redondea en cada una. La cifra correcta es la primera.

**Que un medio de pago tribute es un dato, no se deduce de la moneda.** `triggersIgtf` se
configura; el motor obedece. El día que cambie la norma se corrige sin desplegar.

## Vigencias programadas (B2-2)

Lo que se guarda es «desde tal instante, tal alícuota» (`ScheduledTaxRate`), de solo-agregar. El
calendario sale de ahí con `taxTimeline`: el fin de un tramo es el comienzo del siguiente del mismo
impuesto; con el mismo comienzo manda la programación más reciente, y una que no cambia la alícuota
no abre tramo (programar la vigente para un día cancela el cambio de ese día).

- `ivaRulesOf(tramos)` da las reglas para `computeDocument`, con lo exento (0 %, siempre) incluido.
- `pricesIncludeTax` (B2-5): los precios ya traen el IVA dentro. La base de cada grupo es lo que suma × 100 / (100 +
  alícuota) y el IVA, la diferencia: el total es la suma de los precios al céntimo y `taxIncluded` lo dice.
- `igtfAt(tramos, at)` da el IGTF del instante; `missingTaxesAt` dice qué falta para poder cobrar.
- `scheduleProblem` dice si algo se puede programar: nunca hacia atrás.
- `basisPointsFromPercent` / `percentFromBasisPoints`: «16,5» ↔ 1650, sin coma flotante.

## Fail-closed

Sin alícuota vigente para el instante de la factura, `findRule` **lanza**. Suponer 0 % «porque
no hay regla» sería emitir facturas sin IVA en silencio — el peor error posible aquí (§7.2 A10).

## Qué NO le corresponde

- **Persistencia.** Recibe lo programado ya cargado; no sabe de base de datos (`@l2/application`).
- **Qué día es hoy.** El instante en que empieza un día del local lo pone quien llama (`startOfDay` de
  `@l2/domain-rates`).
- **Conversión entre monedas.** Necesita una tasa, y la tasa es dato de la transacción (ADR-005).
- **Emitir el documento fiscal.** Eso es el puerto `FiscalDevice` (§5.4).

```bash
pnpm test    # 44 pruebas, incluidos los 8 casos límite de §5.3 y las vigencias
```

Cuando lleguen las 20 facturas reales del contador (F0-05) se añaden aquí como casos de
referencia, y **pasan a ser condición de despliegue** (F3-08).
