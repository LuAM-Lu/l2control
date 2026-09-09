# ADR-007 · ORM: Prisma 7+

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F1-05.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 dice «Prisma» sin versión. Prisma 7 eliminó el motor en Rust y pasó a TypeScript puro,
reduciendo el tamaño del paquete cerca de un 90 % y mejorando el arranque en frío del orden de 9×;
la versión 7.4 añadió caché de plan de consulta.
**Decisión.** **Prisma 7.4 o superior**, con la versión exacta fijada.
**Por qué.** La razón histórica para preferir Drizzle era el peso y el arranque en frío del motor Rust,
y eso ya no aplica. A cambio, Prisma aporta el mejor sistema de migraciones del ecosistema — lo que
importa cuando el histórico es fiscal — y las extensiones de cliente que hacen posible el filtrado
automático de tenant de ADR-002.
**Consecuencias.** Las consultas de reportes que Prisma exprese mal se escriben en SQL crudo tipado,
lo cual es aceptable y esperado.
