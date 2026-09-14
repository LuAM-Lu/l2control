# L2 Control

Sistema de gestión para centros recreativos familiares con restauración: control de estancias
por tiempo con pulseras, punto de venta unificado parque-restaurante, comandas y cocina,
inventario con recetas, y caja multimoneda adaptada a economías mixtas.

**Cliente piloto:** Abby Kingdom (Venezuela) — parque infantil + restaurante, aforo de 30 niños y
7-10 mesas. USD como moneda funcional, bolívares de liquidación, IVA e IGTF.

---

## Arrancar

```bash
pnpm install
pnpm dev              # http://localhost:3000
```

Requiere **Node 24 LTS** y **pnpm 12** (`npm i -g pnpm`). Entra con cualquier persona de la
pantalla de acceso y el PIN de prueba **`1970`**.

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta la aplicación web |
| `pnpm build` | Construye todo, con comprobación de tipos |
| `pnpm verify` | Tipos + reglas de arquitectura + demostración de que muerden + pruebas. **Antes de cada push** |
| `pnpm arch` | Solo las reglas de frontera entre módulos |
| `pnpm arch:demo` | Comprueba que esas reglas detectan una violación real |
| `pnpm test` | Pruebas de dominio y contratos |

## Estado

**Fase actual: frontend completo sobre datos de ejemplo** (orden frontend → backend →
producción, §11.4 del plan). No hay servidor todavía: cada pantalla consume ya la forma definitiva
de los datos, validada contra los contratos, y la persistencia llega después.

| Superficie | Ruta | Qué hace |
|---|---|---|
| Acceso | `/acceso` | PIN por persona atado al dispositivo, bloqueo creciente |
| Monitor de parque | `/monitor` | Estancias con cronómetro del servidor, aforo, lectura de pulsera |
| Entrada | `/entrada` | Registro rápido, representante por teléfono, prepago o cuenta abierta |
| Salida | `/salida` | Liquidación con excedente; pasa a caja lo pendiente |
| Caja | `/caja` | Cola de cuentas, cobro mixto con IVA e IGTF, datos por medio de pago, atajos de teclado, recibo |
| Ventas del turno | `/ventas` | Cobros cerrados, reimpresión como copia auditada, anulación con PIN de supervisor |
| Turno | `/turno` | Cortes X y Z, arqueo por denominación, excepciones |
| Mesas | `/mesas` | Plano, pedido con borrador y confirmación, vincular pulseras |
| Cocina (KDS) | `/cocina` | Comandas por antigüedad con cronómetro, empezar y marcar lista, anulaciones a confirmar |
| Back-office | `/panel` | Inicio con indicadores, módulos, usuarios y permisos por persona |

- Estado tarea por tarea: **[docs/PROGRESO.md](docs/PROGRESO.md)**
- **Todo lo que falta: [docs/PENDIENTES.md](docs/PENDIENTES.md)**

### Modo demostración

Sin backend, la demo es la única forma de enseñar el producto, así que viene encendida:

- **Datos de ejemplo** en [`apps/web/src/demo`](apps/web/src/demo/README.md), validados contra los
  contratos. Solo las rutas los importan; una regla de arquitectura impide que una pantalla lo haga.
- **Simulador de operación**: el chip «DEMO» de cada barra reproduce una tarde del local
  (llegadas, pedidos, cocina, salidas) y sincroniza varias pestañas.

`NEXT_PUBLIC_DEMO=off pnpm dev` apaga el simulador y las cuentas y ventas de ejemplo. Tarifas,
medios de pago, personas y la instantánea del parque siguen saliendo de `src/demo` hasta que el
servidor los sirva: sin ellos las pantallas no tienen qué pintar.

## Estructura

```
apps/web                  Next.js 16 — todas las superficies
  app/                    rutas; las únicas que importan la demo
  src/features/<dominio>  pantallas y lógica de aplicación, agrupadas por dominio
  src/demo/               datos de ejemplo e interruptor de la demo
packages/contracts        contratos Zod: la forma de cada dato, una sola vez
packages/domain/money     aritmética de dinero en bigint — puro
packages/domain/tax       IVA con vigencias e IGTF por medio de pago — puro
packages/domain/cash      cobro mixto, vuelto, cuadre, turno y devoluciones — puro
packages/domain/park      tiempo, gracia, penalización, aforo — puro
packages/domain/identity  permisos, autorizaciones, dispositivos, PIN y bloqueo — puro
packages/ui               componentes: primitivos y patrones, sin dominio
packages/config           tokens de diseño y base de TypeScript
docs/                     plan, progreso, pendientes, bitácora, flujos y ADRs
```

Se agrupa **por dominio, no por capa técnica**: «¿dónde va esto?» se responde con «¿de qué
habla?». Cada paquete tiene su README con qué resuelve y qué **no** le corresponde.

## Las cinco reglas que no se negocian

1. **El dominio es puro.** Sin React, Next, Prisma ni `Date.now()`. El instante entra como argumento.
2. **`@l2/ui` no conoce el dominio.** Recibe datos, emite eventos.
3. **El dinero es `bigint` en unidades menores, con su moneda al lado.** Nunca `number`, nunca `toFixed()`.
4. **Fail-closed.** Ante un error se niega, no se permite.
5. **Nada se borra.** Pagos, documentos y movimientos de stock son append-only.

`pnpm arch` impone las fronteras y **rompe la construcción** si se cruzan; `pnpm arch:demo` lo
demuestra inyectando una violación real.

## Documentación

| Documento | Para qué |
|---|---|
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Cómo trabajar en el repositorio: ramas, commits, verificación, documentación |
| **[CLAUDE.md](CLAUDE.md)** | Reglas para quien programe aquí, humano o agente |
| **[docs/PLAN.md](docs/PLAN.md)** | La especificación: 17 ADRs, 24 decisiones del cliente, 160 tareas con criterio de aceptación |
| **[docs/PROGRESO.md](docs/PROGRESO.md)** | Qué está hecho de verdad, tarea por tarea |
| **[docs/PENDIENTES.md](docs/PENDIENTES.md)** | Qué falta y quién lo desbloquea |
| **[docs/BITACORA.md](docs/BITACORA.md)** | Qué se hizo, cuándo y por qué |
| **[docs/FLUJOS.md](docs/FLUJOS.md)** | Cómo se mueven personas, pedidos y dinero en el local |
| **[docs/UX-MEJORAS.md](docs/UX-MEJORAS.md)** | Auditorías de interfaz, propuestas y decisiones de UX |
| **[docs/adr/](docs/adr/)** | Las 17 decisiones de arquitectura, una por archivo |

## Ramas

- `main` — siempre funcionando y con `pnpm verify` en verde.
- `wip/kds` — la cocina (KDS) a medio hacer. Ver [PENDIENTES §4](docs/PENDIENTES.md).
