# @l2/domain-rates

El módulo de tasas. Implementa §5.2 del plan y [ADR-005](../../../docs/adr/005-tasa-congelada.md).

Es el sitio al que apuntaban `@l2/domain-money` y `@l2/domain-cash` cuando decían «la tasa como
dato con vigencia vive en el módulo de tasas».

## Qué resuelve

Una tasa **no es un ajuste que se sobrescribe**: es un registro histórico. Cuando la del día
cambia, se captura otra; la de ayer se queda, porque cada pago de ayer la referencia y el arqueo
de ayer tiene que seguir cuadrando.

```ts
currentRate(historial, "USD/VES", ahora);   // la última confirmada, o null
frozenRateOf({ pair: "USD/VES", value: "228.41" });
// { from: "VES", to: "USD", numerator: 22841n, denominator: 100n }
```

## API pública

| Función | Para qué |
|---|---|
| `currentRate(historial, par, ahora)` | La tasa vigente: la **última confirmada** ya capturada en ese instante. `null` si no hay |
| `frozenRateOf(tasa)` | La fracción con la que convierte `@l2/domain-money`. Exacta: una tasa de ocho decimales no se redondea |
| `variationBasisPoints(anterior, nueva)` | Cuánto salta una tasa respecto de otra, en puntos básicos |
| `needsDoubleCheck(anterior, nueva, umbral)` | Si confirmarla exige teclear el valor otra vez (§5.2) |
| `currenciesOf(par)` | Las dos monedas del par, sin partir la cadena en cada sitio |

## Las tres reglas

**`null` significa que no se cobra.** `currentRate` devuelve `null` cuando no hay ninguna tasa
confirmada, y eso es la regla fail-closed de ADR-005: quien llama bloquea el cobro en esa moneda.
No existe una versión que se las arregle con la de ayer — la de ayer, en este negocio, es otro
precio.

**La aritmética es exacta y entera.** El valor llega como texto decimal por lo mismo que el dinero
no es `number`. Los decimales se compensan escalando las dos partes de la fracción, no
redondeando: `228.41` y `228.410000` producen exactamente la misma tasa.

**Un salto grande se mira dos veces.** `needsDoubleCheck` es la defensa contra la amenaza T2 del
plan —mover la tasa para beneficiarse— y contra el dedo de más en el teclado. Sin tasa anterior
con la que comparar también la exige: la primera del local no tiene red debajo.

## Qué NO le corresponde

- **Llamar al proveedor del BCV.** No hay red aquí. Quien la trae es la capa de aplicación, y lo
  que trae entra **sin confirmar**, porque un tercero es una entrada no confiable (§7.5).
- **Guardar el historial.** Append-only, y de la capa de datos.
- **El reloj.** El instante entra como argumento (ADR-010).
- **Convertir.** Eso es `convert` de `@l2/domain-money`, con la fracción que sale de aquí.

```bash
pnpm test    # 19 pruebas
```
