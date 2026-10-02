# L2 Control

Sistema de gestión para centros recreativos familiares con restauración: control de estancias
por tiempo con pulseras, punto de venta unificado parque-restaurante, comandas y cocina, y caja
multimoneda adaptada a economías mixtas.

**Cliente piloto:** Abby Kingdom (Venezuela) — parque infantil + restaurante, aforo de 30 niños y
7-10 mesas. USD como moneda funcional, bolívares de liquidación, IVA e IGTF.

## Arrancar

```bash
pnpm install          # Node 24 LTS y pnpm 12
pnpm dev              # http://localhost:3000 · PIN de prueba 1970 (antes, la base: ver abajo)
pnpm verify           # tipos + lint + fronteras + pruebas; pnpm verify:db añade las de la base
```

**La app necesita su base de datos** (sección siguiente): no hay modo demo. La primera vez, el
navegador es un **equipo desconocido**: ponle nombre y pide su registro en `/acceso`, apruébalo con
`pnpm equipos aprobar "<ese nombre>"` y entra con cualquier persona y el PIN **`1970`**. Para
configuración, precios y personas la app pide además **confirmar identidad**: en desarrollo, la
contraseña `abby-kingdom-desarrollo` y el código que da `pnpm totp`. En un local de verdad las
credenciales se dan con `pnpm credenciales "<nombre>"`. En Chrome, «Instalar la app» la instala
como PWA.

## Base de datos local

Desde la Etapa 0 del backend hacen falta PostgreSQL 17 y Valkey 8. No se instalan: los levanta
Docker (hace falta Docker Desktop encendido).

```bash
cp .env.example .env  # una vez; contraseñas de juguete solo para tu máquina
pnpm infra:up         # levanta los dos y espera a que estén sanos
pnpm db:migrar        # aplica las migraciones
pnpm db:semilla       # crea el local de desarrollo, su equipo (PIN 1970) y su tarifario (idempotente)
pnpm dev              # lee y escribe en la base
pnpm infra:down       # los apaga; los datos se conservan
pnpm infra:reset      # borra los datos y arranca de cero
```

Todo sale de la base: los datos provisionales de `src/demo` se fueron paso a paso y el último salió con
B6-1. Si falta o sobra una variable, el servidor **no arranca** y dice cuál.

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
| [docs/adr/](docs/adr/) | Las 18 decisiones de arquitectura, una por archivo |

Cada paquete tiene su `README.md` con qué resuelve y qué **no** le corresponde.
