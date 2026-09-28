# ADR-023 · La existencia sale cuando el producto entra en una cuenta, y sin existencia no se vende

- **Estado:** Aceptada (2026-09-28, M-15). **Supersede ADR-012** (descarga al marcar «listo» en el KDS),
  que se queda sin disparador al retirarse la pantalla de cocina (ADR-022). Las recetas y los insumos de
  cocina quedan para después del piloto, con su propia decisión entonces.
- **Fecha:** 2026-09-28
- **Situación en el código:** pendiente, B9-2. El catálogo ya marca qué productos llevan existencia
  (`controlaStock`, B9-1).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** El inventario del piloto es **mínimo y real**: lo que se vende tal cual (refrescos,
golosinas, juguetes) y servicios sin existencia (alquiler del local por cumpleaños, paquetes del parque).
El cliente fue claro: **lo que no hay no se vende**. Y el inventario debe verse en tiempo real desde la
caja y la tablet del mesero.

**Decisión.**

1. La existencia de un producto es la **suma de sus movimientos** (solo-agregar, I-10). No hay un campo
   «stock» que alguien edite.
2. **Sale cuando la línea entra en una cuenta** (la venta de mostrador, la cuenta de la mesa, el paquete
   de un evento), en la misma transacción que guarda la cuenta: es el momento en que el producto sale de la
   nevera o del estante. Quitar una línea no pagada, o anular un cobro de algo que no se entregó
   (`NO_ENTREGADO`), es un movimiento de **reversión**. Una cortesía no devuelve nada: se consumió.
3. **Sin existencia no se vende**: guardar una cuenta que dejaría un producto por debajo de cero se
   rechaza (fail-closed), en la caja y en la tablet, con un candado por producto para que dos ventas a la
   vez no vendan la última unidad dos veces. No hay excepción con autorización: se carga la entrada que
   falta (B9-3) o se corrige con un conteo (B9-4).
4. Los **servicios** y lo que no lleva existencia (`controlaStock` apagado, p. ej. los platos del
   restaurante mientras no haya recetas) no se tocan.
5. Cada movimiento lleva su clave: un doble clic o un reintento no descuenta dos veces.

**Consecuencias.** La existencia que ve la caja es la que queda para vender, sin esperar al cobro: una
cuenta abierta de una mesa ya «aparta» sus refrescos. El margen se calcula con el costo promedio vigente
al salir (B9-3). Una carga olvidada detiene la venta de ese producto hasta cargarla: es el precio de no
vender lo que no hay, y la pantalla lo dice con un enlace a la entrada de mercancía.
