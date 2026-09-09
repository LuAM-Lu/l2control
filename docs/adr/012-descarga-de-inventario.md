# ADR-012 · La descarga de inventario ocurre al marcar «listo» en el KDS

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F8-04.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 ofrece «al facturar o al preparar» sin decidir; la ambigüedad produce doble descuento.
**Decisión.** El stock se descuenta **cuando la comanda pasa a `LISTO` en el KDS**, en un movimiento de
inventario idempotente con clave `(orderItemId, 'CONSUMPTION')`.
**Por qué.** Es el instante en que el insumo realmente salió de la despensa. Facturar no consume insumos
(una cuenta puede facturarse mucho después) y «enviar a cocina» tampoco (una comanda puede anularse antes
de tocarse).
**Reversión.** Anular un ítem ya listo genera un movimiento de **reversión**, no un `UPDATE` del anterior.
**Consecuencias.** El inventario refleja producción, no ventas; la diferencia entre ambos es exactamente
la merma, y ahora es medible.
