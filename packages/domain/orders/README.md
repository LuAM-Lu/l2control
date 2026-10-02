# @l2/domain-orders

El restaurante en el dominio: el plano que se publica y el pedido del mesero con su comanda impresa.

## Qué resuelve

- **El plano que se publica** (`plano.ts`, B6-1): `cambioDePlanoProblem` impide que una mesa desaparezca
  (se retira; los cobros del pasado la nombran) y que se retire una mesa con su cuenta abierta;
  `mesasRetiradas` dice cuáles se retiran en un cambio. La geometría la valida el contrato.
- **El pedido del mesero** (`pedido.ts`, B6-2, ADR-022): `lineasDelPedido` dice qué entra en la cuenta (una
  línea por unidad, con el nombre, el precio y el IVA del catálogo de ahora) y se niega si un plato ya no se
  vende o si su precio cambió desde que la tablet lo enseñó; `estadoDeComanda` dice si la comanda está en
  cola, impresa, no salió o se descartó, por sus trabajos de impresión.

## Qué NO le corresponde

- **«En fuego», «listo» y «entregado».** Se retiraron con B6-2: la cocina trabaja con la comanda impresa y
  el sistema no lo sabe (ADR-022). Si el cliente pide medir tiempos, un ADR nuevo.
- **El borrador del mesero.** Vive en su tablet; el pedido empieza al enviarse.
- **Quién puede pedir o reimprimir.** Eso es la matriz de permisos (`@l2/domain-identity`).
- **Imprimir.** La cola de impresión y sus bytes son de `@l2/domain-printing` y del agente (ADR-015, ADR-026).
- **El reloj.** El instante entra como argumento (ADR-010).
