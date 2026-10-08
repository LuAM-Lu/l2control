# ADR-030 · El mesero marca «Servido»

- **Estado:** Aceptada (2026-10-07, decisión del usuario D-SERV; M-27, P-19). **Supersede en parte ADR-022**: su
  punto 2 ya no dice «no hay entregado», porque el mesero marca **«Servido»**. Siguen enteros la cocina sin pantalla,
  la comanda impresa, sus dos estados (enviada e impresa) y que no hay «en fuego» ni «listo».
- **Fecha:** 2026-10-07
- **Situación en el código:** lo construyó **B6-8** (v0.73.0).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** En la primera visita con el sistema (M-27), administración pidió medir la atención en las mesas:
cuánto llevan sentados, cuánto esperó un pedido y quién está sin atender (P-19). ADR-022 retiró «listo» y
«entregado» porque la cocina trabaja con la comanda impresa, y dejó dicho el camino más barato si se pedía medir
tiempos: que el mesero marque la entrega en su tablet, con un ADR nuevo. Este es ese ADR.

**Decisión.**

1. Cada pedido tiene un toque **«Servido»** en la tablet del mesero: ahí termina su espera. Lo marca quien toma
   pedidos (`pedido.tomar`), una vez por pedido; si otra tablet ya lo marcó, queda como estaba. Se guarda aparte,
   de solo agregar (`kitchen_order_served`), con quién y cuándo.
2. Un pedido sin marcar **sigue esperando** y lo dice: en la tablet («Esperando · N min»), en «Atender» al pasar el
   umbral y en el resumen del día («N sin marcar servido»). No se adivina la entrega.
3. La atención de cada cuenta del salón (sentada, sin pedir, esperando su pedido) y la espera media y máxima del
   día las calcula el dominio (`@l2/domain-orders`, `atencion.ts`), puro, con el instante como argumento. Los umbrales
   son ajustes de la sucursal (15 min sin pedir y 20 esperando, de fábrica).
4. La cocina sigue sin pantalla: no hay «en fuego» ni «listo», y la comanda sigue siendo el papel.

**Consecuencias.** Administración ve la atención en el salón (Restaurante → Atención en el salón) y el mesero, en
«Atender», las mesas que esperan su pedido o no han pedido. La medida depende de que el mesero marque «Servido»: un
pedido olvidado cuenta como espera larga, y por eso se dice cuántos quedan sin marcar. El tiempo de preparación en
la cocina (desde que sale la comanda hasta que el plato está listo) sigue sin medirse.
