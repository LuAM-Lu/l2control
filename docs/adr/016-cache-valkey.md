# ADR-016 · Caché y pub/sub: Valkey

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Situación en el código:** Pendiente: F1-04.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Redis cambió su licencia a SSPL/RSAL en 2024; Valkey es la bifurcación BSD bajo la Linux
Foundation, compatible a nivel de protocolo.
**Decisión.** **Valkey 8.x**, hablado con cliente estándar de Redis.
**Por qué.** Licencia permisiva que no puede cambiar bajo los pies del proyecto, y un rendimiento algo
superior con menor consumo de memoria. No se usan módulos de Redis Stack, que es el único caso donde
Redis seguiría siendo necesario.
**Consecuencias.** Ninguna a nivel de código: el cliente es el mismo.
