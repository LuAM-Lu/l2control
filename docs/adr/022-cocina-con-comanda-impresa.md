# ADR-022 · La cocina trabaja con la comanda impresa, sin pantalla

- **Estado:** Aceptada (2026-09-28, decisión del cliente tras la visita técnica, M-15). **Cambia DEC-19**
  (pantalla de cocina más comanda impresa): se retira la pantalla. ADR-015 (impresión en cola con
  confirmación) sigue entero y pasa a ser la única vía a la cocina.
  **Superseded en parte por [ADR-030](030-el-mesero-marca-servido.md)** (2026-10-07): el mesero marca «Servido» y ahí
  termina la espera de un pedido; la cocina sigue sin pantalla y sin «en fuego» ni «listo».
- **Fecha:** 2026-09-28
- **Situación en el código:** aplicada con B6-2 (v0.41.0, 2026-10-02): el pedido (`kitchen_order`) y su comanda
  en la cola se escriben en una transacción (`@l2/application`, `restaurante/pedidos.ts`); la estación de cocina, la
  máquina de estados de la comanda y los eventos `pedido.*` del bus se retiraron.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** DEC-19 pedía una tablet en la cocina (KDS) como fuente de verdad de los estados y el papel
como objeto de la línea. En la visita el cliente decidió que la cocina **trabaja de forma manual, con
comandas impresas**, y que el sistema **no necesita saber cuándo un plato está listo o entregado**: le
basta el pedido y la cuenta. Hoy hay **una sola impresora, en la caja**; más adelante puede ponerse otra en
la cocina.

**Decisión.**

1. Cuando el mesero confirma un pedido en su tablet, el servidor crea un **trabajo de impresión** de la
   comanda (ADR-015) en la **impresora de comandas**, que es un ajuste del local: hoy la de caja (y alguien
   lleva el papel a la cocina), mañana la de la cocina, sin programar.
2. La comanda tiene dos estados que importan: **enviada** (el pedido existe y suma en la cuenta) e
   **impresa** (la impresora confirmó). Si la impresión falla, **el mesero lo ve en su tablet** y puede
   reimprimir; la caja también lo ve. No hay «en fuego», «listo» ni «entregado».
3. Se retiran la estación de cocina, sus tiempos de espera y los avisos «plato listo» al mesero.
4. Lo que se pide sigue sumando en la cuenta de la mesa (B6-3) y, si el producto lleva existencia, la
   descuenta al entrar en ella (ADR-023).

**Consecuencias.** Menos equipos y menos pantallas en un sitio con calor y grasa. Se pierde la medición
de tiempos de cocina (F6-08) y el panel en vivo deja de enseñar «en cocina»; Inicio enseña en su lugar
las comandas con impresión fallida. Si el cliente pide medir tiempos, el camino más barato es que el
mesero marque «entregado» en su tablet, con un ADR nuevo.
