# Documentación

| Documento | Para qué sirve | Cuándo abrirlo |
|---|---|---|
| **[PLAN.md](PLAN.md)** | La especificación: 17 ADRs, 29 decisiones del cliente y las tareas con su criterio de aceptación | Antes de construir cualquier cosa: busca su tarea `Fn-nn` en §12 |
| **[PROGRESO.md](PROGRESO.md)** | El estado real, tarea por tarea, con evidencia | Para saber qué está hecho de verdad |
| **[PENDIENTES.md](PENDIENTES.md)** | Todo lo que falta, agrupado por quién lo desbloquea: cliente, contador, campo, producto, backend | Antes de planificar o de prometer una fecha |
| **[PLAN-FRONTEND.md](PLAN-FRONTEND.md)** | **El plan final del frontend**: criterios de terminado, las olas que quedan y las secciones pendientes | Antes de tocar cualquier pantalla |
| **[BITACORA.md](BITACORA.md)** | Qué se hizo, cuándo y por qué | Para entender una decisión pasada |
| **[FLUJOS.md](FLUJOS.md)** | Cómo se mueven personas, pedidos y dinero en el local, y los escenarios a simular | Antes de construir una pantalla de operación |
| **[ORQUESTA.md](ORQUESTA.md)** | Cómo trabajan juntas la maestra (Claude) y las obreras (Gemini) | Antes de encargar trabajo a una obrera |
| [encargos/](encargos/) | Cada encargo dado a una obrera, versionado con el código que produjo | Para entender por qué una pantalla es como es |
| [AUDITORIA-FRONTEND.md](AUDITORIA-FRONTEND.md) | Hallazgos F-01 a F-15: la app en 12 tamaños de desktop y tablet | Con el plan final |
| [AUDITORIA-NAVEGACION.md](AUDITORIA-NAVEGACION.md) | Hallazgos N-01 a N-10: qué alcanza cada rol y cómo se navega | Con el plan final |
| [UX-MEJORAS.md](UX-MEJORAS.md) | Primera auditoría de interfaz (cerrada). El código cita sus secciones | Para entender una decisión de interfaz antigua |
| [diseno/](diseno/) | Maquetas de las propuestas de UX-MEJORAS | Con UX-MEJORAS |
| **[adr/](adr/)** | Las 17 decisiones de arquitectura, una por archivo | Antes de discutir una decisión técnica |

**Regla de mantenimiento.** Una tarea cambia de estado en `PROGRESO.md` y en la casilla de §12 en el
mismo commit que la cambia de verdad; lo que queda por hacer se mantiene en `PENDIENTES.md`, y lo del
frontend, en `PLAN-FRONTEND.md`. El porqué va a la bitácora. Nada se cuenta a mano en dos sitios.

La especificación v1 y su diagnóstico se retiraron del árbol el 2026-09-17; siguen en la historia de
git (`git show 6eda825:docs/archivo/SPEC-v1.md`).
