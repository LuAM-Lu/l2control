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

## Base de datos local

Desde la Etapa 0 del backend hacen falta PostgreSQL 17 y Valkey 8. No se instalan: los levanta
Docker (hace falta Docker Desktop encendido).

```bash
cp .env.example .env  # una vez; contraseñas de juguete solo para tu máquina
pnpm infra:up         # levanta los dos y espera a que estén sanos
pnpm db:migrar        # aplica las migraciones
pnpm db:semilla       # crea el local de desarrollo y su tarifario de ejemplo (idempotente)
pnpm dev              # con L2_FUENTE_DE_DATOS=servidor lee y escribe en la base
pnpm infra:down       # los apaga; los datos se conservan
pnpm infra:reset      # borra los datos y arranca de cero
```

**Dos modos**, que decide `L2_FUENTE_DE_DATOS`: `servidor` (la base de verdad) o `demo` (datos de
ejemplo, sin Docker; es el valor si no hay `.env`). Hoy solo el **tarifario** sale de la base; el
resto de pantallas sigue en la demo hasta su paso de la ruta. Si falta o sobra una variable, el
servidor **no arranca** y dice cuál.

| Servicio | En tu máquina | Para qué |
|---|---|---|
| PostgreSQL 17 | `127.0.0.1:5433` | Donde vive todo lo que importa: cobros, estancias, turnos. Bases `l2control` y `l2control_test` |
| Valkey 8 | `127.0.0.1:6379` | Mensajería en tiempo real entre equipos y datos de consulta rápida. Si se pierde, no se pierde nada importante |

El puerto es 5433 para no chocar con un PostgreSQL instalado. PostgreSQL tiene tres usuarios con
papeles distintos (`postgres`, `l2_migrator` y `l2_app`); por qué, en
[infra/postgres/init](infra/postgres/init/01-roles-y-bases.sh).

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
