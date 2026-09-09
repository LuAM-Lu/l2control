# ADR-001 · Monorepo con Turborepo

- **Estado:** Implementada
- **Fecha:** 2026-09-08
- **Situación en el código:** Monorepo Turborepo + pnpm activo; fronteras verificadas por `pnpm arch`.

> Para cambiar esta decisión se escribe un ADR nuevo que la supersede.
> No se edita esta en silencio.

---

**Contexto.** Web, agente de impresión, esquema de base de datos y tipos compartidos deben versionarse
juntos: un cambio de esquema afecta a los tres.
**Decisión.** Monorepo con **Turborepo** y `pnpm` workspaces.
**Por qué.** Para 5-50 paquetes de TypeScript, Turborepo entrega la mayor parte del beneficio con una
fracción de la complejidad de Nx; Nx se justifica con varios equipos, generadores y CI cara, que no es
el caso. `pnpm` evita dependencias fantasma, que es justamente lo que rompe las fronteras de módulo.
**Consecuencias.** Sin ejecución distribuida en CI (no hace falta). Si el proyecto llega a varios
equipos y decenas de aplicaciones, reevaluar con un ADR nuevo.
