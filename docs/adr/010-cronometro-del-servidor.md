# ADR-010 · El cronómetro es del servidor

- **Estado:** Implementada
- **Fecha:** 2026-09-08
- **Situación en el código:** `computeSessionView` recibe `now`; `useServerClock` interpola en el cliente.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Si el tiempo se calcula con el reloj del cliente, una tablet mal configurada regala o cobra
tiempo de más, y el usuario puede manipularlo.
**Decisión.** El servidor guarda `startedAt`, `expiresAt` y `serverNow` autoritativos. El cliente
**solo interpola visualmente** entre latidos del servidor, y toda liquidación se calcula en el servidor.
**Consecuencias.** El cliente necesita corrección de desfase de reloj para que el número que se ve no
salte; el cobro nunca depende de ese número.
