# ADR-006 · Un solo backend: Next.js con capa de aplicación propia

- **Estado:** Implementada
- **Fecha:** 2026-09-08
- **Situación en el código:** Una sola app Next.js en `apps/web`. El worker llega en F6.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** v1 ofrecía «NestJS **o** Next.js API Routes», sin decidir. Mantener dos backends para un
equipo pequeño es costo puro.
**Decisión.** **Una sola aplicación Next.js** (App Router) que expone: Server Actions y Route Handlers
para el trabajo transaccional, y un **proceso worker separado** para el servidor de tiempo real, la cola
de impresión y los trabajos programados.
**Por qué.** Elimina la duplicación de autenticación, tipos y validación entre dos frameworks. NestJS es
excelente cuando hay varios equipos y muchos módulos backend; aquí añadiría una frontera sin beneficio.
La modularidad no la da el framework: la dan las fronteras de §9, que se aplican igual dentro de Next.
**Consecuencias.** La disciplina de módulos debe imponerse con herramientas (§9.3), no confiando en que
el framework la imponga. Si el backend crece más allá de lo que un equipo mantiene, extraer el dominio
—que ya está aislado— a un servicio propio es mecánico.
