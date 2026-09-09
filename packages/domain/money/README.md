# @l2/domain-money

Aritmética de dinero. Implementa §5.1 del plan y [ADR-004](../../../docs/adr/004-dinero-entero-unidades-menores.md).

## Qué resuelve

Que el sistema no pierda céntimos. Un monto es un **entero en la unidad menor** de su moneda
(`bigint`), nunca un `number`, y **nunca viaja sin su moneda al lado**.

```ts
const precio = fromMajor("17.50", "USD");   // { amount: 1750n, currency: "USD" }
add(precio, fromMajor("1.00", "VES"));      // ✗ CurrencyMismatchError
allocate(fromMajor("1.00", "USD"), 3);      // [34n, 33n, 33n] — suma exacta
```

## API pública

| Función | Para qué |
|---|---|
| `money`, `fromMajor`, `toMajor` | Construir y mostrar. `fromMajor`/`toMajor` **solo en los bordes** |
| `add`, `subtract`, `sum`, `multiply`, `compare` | Aritmética; rechaza mezclar monedas |
| `allocate`, `allocateByRatios` | Reparto por **mayor resto**: la suma de las partes es siempre el total |
| `zero`, `isZero`, `isNegative` | Utilidades |

## Qué NO le corresponde

- **Conversión entre monedas.** Necesita una tasa, y la tasa es un dato con vigencia que vive
  en el módulo de tasas ([ADR-005](../../../docs/adr/005-tasa-congelada.md)).
- **Impuestos.** IVA e IGTF van en `@l2/domain-tax` cuando exista (F3-06, F3-07).
- **Formato para pantalla.** Lo hace `MoneyDisplay` en `@l2/ui`.

## Reglas

Este paquete **no tiene dependencias**, y eso es a propósito. Si algún día aparece aquí React,
Prisma o un cliente HTTP, la regla de §9.2 se rompió y `pnpm arch` debe fallar.

```bash
pnpm test    # 14 pruebas, dos de propiedad sobre el reparto
```

§10.1 exige cobertura ≥ 95 % en este paquete, sin excepción: decide cuánto cobra el negocio.
