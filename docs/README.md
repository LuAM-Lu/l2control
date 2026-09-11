# Documentación

| Documento | Para qué sirve | Cuándo abrirlo |
|---|---|---|
| **[PLAN.md](PLAN.md)** | La especificación: qué se construye y con qué criterio de aceptación | Antes de construir cualquier cosa: busca su tarea `Fn-nn` en §12 |
| **[PROGRESO.md](PROGRESO.md)** | El estado real, tarea por tarea, con evidencia | Para saber qué está hecho de verdad y qué falta |
| **[BITACORA.md](BITACORA.md)** | Qué se hizo, cuándo y por qué | Para entender una decisión pasada |
| **[adr/](adr/)** | Las 17 decisiones de arquitectura, una por archivo | Antes de discutir una decisión técnica |
| [archivo/](archivo/) | Lo superado: el plan v1 y su diagnóstico | Solo como referencia histórica |

**Regla de mantenimiento.** Una tarea cambia de estado en `PROGRESO.md` y en la casilla de §12 en el
mismo commit que la cambia de verdad. El porqué va a la bitácora. Nada se cuenta a mano en dos
sitios: el recuento de §12 se quitó porque se desincronizaba.
