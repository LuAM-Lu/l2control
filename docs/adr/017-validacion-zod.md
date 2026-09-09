# ADR-017 · Validación: un solo esquema Zod por contrato, compartido

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F1-09.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** La duplicación más costosa de un proyecto full-stack es validar lo mismo en el formulario,
en la API y en la base de datos, con tres definiciones que se desincronizan.
**Decisión.** Cada contrato de entrada se define **una vez** con Zod en `packages/contracts`, y de ahí
se derivan: los tipos de TypeScript, la validación del formulario en el cliente y la validación en el
servidor. El servidor **siempre** revalida, aunque el cliente ya lo haya hecho.
**Consecuencias.** Cambiar un campo obliga a un solo cambio y el compilador señala todos los usos.

---
