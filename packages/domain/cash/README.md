# @l2/domain-cash

Cobro mixto, vuelto y cuadre de caja. Implementa §5.5 y §5.6 del plan.

## La regla que gobierna todo el módulo

**El vuelto es un asiento del libro, no una resta.** Si se descuenta del pago, el arqueo deja de
cuadrar contra la gaveta y nadie sabe por qué: el efectivo que entró y el que salió tienen que
verse por separado.

Y la invariante que cierra la transacción, al céntimo:

```
Σ pagos = total del documento + Σ vuelto + Σ propina + Σ residuo
```

Si no cuadra, `closeSettlement` **lanza**. Es deliberadamente severo: una interfaz que «arregla»
la diferencia produce arqueos que no se pueden auditar. Ajustar la diferencia en silencio es
exactamente donde se pierde el dinero.

## Las tres disposiciones del excedente (§5.6)

Vienen de cómo lo describió el cliente — «la diferencia se da de vuelto si el cliente lo
requiere, o queda en caja» — y son tres operaciones que contablemente **no son lo mismo**:

| Asiento | Qué es | Regla |
|---|---|---|
| `CHANGE_OUT` | Vuelto entregado | Sale efectivo de la gaveta; lleva su moneda y su tasa |
| `TIP_FROM_CHANGE` | El cliente lo deja de propina | **No es ingreso del negocio** |
| `ROUNDING_RETAINED` | Residuo bajo la denominación mínima | Acotado por umbral; por encima, se rechaza |

Unión discriminada para que ninguna quede implícita. Un excedente sin disposición **no cierra**:
ese es el caso peligroso, dinero que se quedaría sin explicación.

## El vuelto cruzado

Se paga con un billete de USD y el vuelto sale en Bs. Es el caso más común del negocio y donde
más fácil se filtra dinero, así que:

**El vuelto cruzado usa la misma tasa congelada de la transacción**, nunca otra. Entregarlo a
una tasa distinta de la del cobro es la filtración más fácil de hacer y la más difícil de
detectar.

## El cuadre se calcula por moneda, nunca en un solo número

Un faltante en dólares y un sobrante en bolívares **no se compensan**. Sumarlos escondería justo
lo que hay que ver. Hay una prueba que lo fija.

`reconcile` no decide si la diferencia es aceptable: eso es política configurable y una
conversación con el administrador. Aquí solo se calcula.

## Devolver al anular un cobro (DEC-24)

`refundableByTender(pagos, excedente, funcional)` dice cuánto de cada pago se devuelve si el cobro
se anula. Se devuelve **lo que quedó en la caja por la venta**, no lo entregado: el vuelto ya salió,
y la propina y el residuo no eran de la venta. El excedente se descuenta primero del efectivo (del
último pago hacia el primero, porque el vuelto sale del billete que lo originó) y se convierte con la
**tasa congelada de ese pago**. Cada pago se devuelve en su moneda. Un excedente mayor que lo pagado
lanza `ExcessNotCoveredError`: ese cobro no cuadró.

La caja lo calcula **al cerrar el cobro** y la venta lo guarda, para que una anulación de mañana no
dependa de la tasa de mañana.

## Qué NO le corresponde

- **Los impuestos.** El total que recibe ya viene con IVA de `@l2/domain-tax`. El IGTF se
  calcula sobre los pagos, y quien orquesta ambas cosas es la capa de aplicación.
- **La tasa como dato con vigencia.** Recibe una `FrozenRate` ya fijada (ADR-005).
- **Persistencia del libro.** Devuelve los asientos; guardarlos append-only es de la capa de datos.

```bash
pnpm test    # 18 pruebas
```
