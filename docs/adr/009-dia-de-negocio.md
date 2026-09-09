# ADR-009 · Zona horaria y día de negocio

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F3-11.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Venezuela opera en UTC−4 sin horario de verano, pero el día contable no es el calendario.
**Decisión.** Todas las marcas de tiempo se almacenan en **UTC** (`timestamptz`). Toda fila de venta,
pago y estancia lleva además un campo **`businessDate`** (tipo `date`), asignado por el turno de caja
abierto, **no** derivado del instante.
**Consecuencias.** Los reportes agrupan por `businessDate` y nunca por `created_at::date`. Una venta a
la 01:30 pertenece al día que el turno declara.
