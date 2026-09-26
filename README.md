# L2 Control

Sistema de gestión para centros recreativos familiares con restauración: control de estancias
por tiempo con pulseras, punto de venta unificado parque-restaurante, comandas y cocina, y caja
multimoneda adaptada a economías mixtas.

**Cliente piloto:** Abby Kingdom (Venezuela) — parque infantil + restaurante, aforo de 30 niños y
7-10 mesas. USD como moneda funcional, bolívares de liquidación, IVA e IGTF.

## Arrancar

```bash
pnpm install          # Node 24 LTS y pnpm 12
pnpm dev              # http://localhost:3000 · PIN de prueba 1970
pnpm verify           # tipos + fronteras + demostración de que muerden + pruebas; antes de cada push
```

Entra con cualquier persona de la pantalla de acceso y el PIN **`1970`**. En Chrome, «Instalar la app»
la instala como PWA. El chip «DEMO» de cada barra abre el simulador, que reproduce una tarde del local;
`NEXT_PUBLIC_DEMO=off pnpm dev` lo apaga.

## Estado

El frontend está terminado **sobre datos de ejemplo** y el backend está en construcción. El estado, la
ruta hasta producción y lo que bloquea viven en un solo sitio: **[docs/MAESTRO.md](docs/MAESTRO.md)**.

## Documentación

| Documento | Para qué |
|---|---|
| **[docs/MAESTRO.md](docs/MAESTRO.md)** | El único documento vivo: estado, ruta a producción, bloqueos y handoff |
| **[CLAUDE.md](CLAUDE.md)** | Reglas para quien programe aquí, humano o agente, y el flujo de trabajo |
| [docs/PLAN.md](docs/PLAN.md) | La especificación: ADRs, decisiones del cliente y tareas con criterio de aceptación |
| [docs/FLUJOS.md](docs/FLUJOS.md) | Cómo se mueven personas, pedidos y dinero en el local |
| [docs/adr/](docs/adr/) | Las 17 decisiones de arquitectura, una por archivo |

Cada paquete tiene su `README.md` con qué resuelve y qué **no** le corresponde.
