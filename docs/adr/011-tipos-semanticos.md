# ADR-011 · Configuración peligrosa: tipos semánticos, no números desnudos

- **Estado:** Implementada
- **Fecha:** 2026-09-08
- **Situación en el código:** `Duration` sin variante cero; `fixed(0)` y bloque de penalización 0 lanzan excepción.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** El plan v1 contiene varios valores donde «cero» es ambiguo y ambos significados son
plausibles. Esta es la clase de fallo que no se detecta en revisión de código porque *parece* correcto.

| Valor de v1 | La ambigüedad | Decisión |
|---|---|---|
| «Tiempo libre» como paquete | ¿Duración 0 = infinito o = inmediato? | Tipo `Duration = { kind: 'fixed', minutes } \| { kind: 'openEnded' }`. No existe el 0. |
| «Margen de tolerancia (gracia)» | ¿Gracia 0 = sin gracia o gracia infinita? | Entero **no negativo obligatorio**; 0 significa explícitamente «sin gracia» y la interfaz lo dice con palabras. |
| Tasa de cambio | ¿Tasa 0 o nula = gratis? | Prohibido por restricción de base de datos (`CHECK rate > 0`) y bloqueo *fail-closed* de ADR-005. |
| Bloque de penalización | ¿Bloque 0 = no cobrar o = división por cero? | Entero **positivo obligatorio**, validado en el esquema. |
| Rol como cadena de texto | `role: "admin"` se compara con cadenas y se acumula por concatenación | Permisos como **conjunto tipado** (§7.3), nunca cadenas concatenadas. |

**Regla general del proyecto:** ningún valor de seguridad, dinero o tiempo se acepta como número o
cadena desnudos. Si el cero, el vacío o el nulo pueden interpretarse de dos maneras, el tipo debe hacer
imposible expresar la ambigüedad.
