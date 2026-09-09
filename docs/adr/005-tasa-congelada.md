# ADR-005 · La tasa de cambio se congela dentro de la transacción

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: llega con el motor de tasas en F3-03.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 modela la tasa como configuración global. Con esa forma, cuando el administrador
actualiza la tasa mañana, **el reporte de hoy cambia**, y la caja de ayer deja de cuadrar.
**Decisión.** Cada pago, cada línea de factura convertida y cada cargo guarda **la tasa que se le
aplicó**, junto con su origen y su marca de tiempo. Nada se reconvierte al leer.
**Cómo.** Todo registro monetario convertido lleva: `rateValue`, `rateSource` (`BCV` | `MANUAL` |
`COMERCIAL`), `rateCapturedAt`, `rateId` (referencia al registro de tasa vigente usado).
**Regla fail-closed.** Si no hay tasa vigente para el `businessDate` en curso, el sistema **bloquea el
cobro en la moneda afectada** y muestra un aviso accionable. **Nunca** usa cero, ni la tasa de ayer en
silencio, ni un valor por defecto.
**Consecuencias.** El reporte histórico es inmutable y reproducible. Es el requisito que hace posible
auditar la caja.
