# @l2/domain-orders

Ciclo de vida de la comanda. Implementa §6.5 del plan y F6-08.

```
ENVIADO → EN_PREPARACION → LISTO → ENTREGADO
ANULADO desde cualquiera de ellos, con motivo y autorización
```

## Qué resuelve

- **`transicionar(estado, transición)`** dice si un cambio es posible y a qué estado lleva, o por qué
  no. Solo se avanza hacia delante: un evento repetido o retrasado nunca hace retroceder una comanda.
- **`requiereReversion`**: anular después de `LISTO` obliga a devolver el inventario que se descontó al
  terminar el plato (ADR-012).
- **`anulacionRequiereConfirmacion`**: si la cocina ya tenía la comanda en sus manos, la anulación queda
  a la vista hasta que alguien en cocina confirma que la vio (FLUJOS C5).
- **`nivelEspera`**: a tiempo, tarda o atrasada, con un umbral configurable (§8.5).

## Qué NO le corresponde

- **El borrador del mesero.** Vive en su tablet y la cocina no lo ve. Esta máquina empieza al enviar.
- **Quién puede anular.** Eso es la matriz de permisos (`@l2/domain-identity`, `pedido.anularEnProduccion`).
- **Imprimir.** La cola de impresión es infraestructura (ADR-015).
- **El reloj.** La espera entra ya calculada en milisegundos (ADR-010).
