# ADR-002 · Multi-tenencia: esquema compartido + RLS forzada

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: llega con el esquema Prisma en F1-05.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** El producto se describe como SaaS, pero el primer cliente es uno solo. Decidir esto tarde
implica migrar todos los datos. **DEC-3 respondida: multi-tenant desde el día uno.**
**Decisión.** Se construye **desde el día uno** con `tenant_id` en toda tabla de negocio, **aunque
inicialmente exista un único tenant**, y con PostgreSQL **Row-Level Security en modo `FORCE`**.
**Por qué.** Añadir `tenant_id` después es una migración de datos de alto riesgo sobre un histórico
fiscal; añadirlo antes cuesta una columna y un índice. RLS es la red de seguridad que actúa aunque la
aplicación tenga un bug: la base misma niega la fila.
**Cómo.**
- Toda tabla de negocio: `tenant_id` **no nulo**, y es la **primera columna de todo índice compuesto**.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;`
- Políticas separadas para `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- La aplicación fija `SET LOCAL app.tenant_id` **dentro de la misma transacción** de cada petición.
- Una extensión de Prisma inyecta el filtro de tenant automáticamente, para que olvidarlo sea imposible.
**Consecuencias.** Obliga a la prueba negativa en CI descrita en §10.1 (el tenant A no lee filas del
tenant B, por clase de tabla). Sin esa prueba, RLS es decorativa.
