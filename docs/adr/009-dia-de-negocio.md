# ADR-009 · Zona horaria y día de negocio

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** hecha en B3-1 y B2-4 (v0.18.0 y v0.19.0, 2026-09-27). El turno fija su
  `business_date` al abrirse (el día del local en ese instante) y cada asiento del libro de pagos lleva
  el de su turno; un disparador rechaza cualquier otro. **Aclaración de B2-4:** el día de negocio
  agrupa el dinero; la tasa de cambio sigue el día de CALENDARIO, porque la fecha valor del BCV es una
  fecha de calendario (una venta a la 1:30 am del martes usa la tasa del martes aunque su turno sea del
  lunes).

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Venezuela opera en UTC−4 sin horario de verano, pero el día contable no es el calendario.
**Decisión.** Todas las marcas de tiempo se almacenan en **UTC** (`timestamptz`). Toda fila de venta,
pago y estancia lleva además un campo **`businessDate`** (tipo `date`), asignado por el turno de caja
abierto, **no** derivado del instante.
**Consecuencias.** Los reportes agrupan por `businessDate` y nunca por `created_at::date`. Una venta a
la 01:30 pertenece al día que el turno declara.
