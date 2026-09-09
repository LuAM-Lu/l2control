# L2 Control

Sistema de gestión para centros recreativos familiares con restauración: control de estancias
por tiempo con pulseras, punto de venta unificado parque-restaurante, comandas y cocina,
inventario con recetas, y caja multimoneda adaptada a economías mixtas.

**Cliente piloto:** Abby Kingdom (Venezuela).

---

## Arrancar

```bash
pnpm install
pnpm dev              # http://localhost:3000
```

Requiere **Node 24 LTS** y **pnpm 12**. Si no tienes pnpm: `npm i -g pnpm`.

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta la aplicación web |
| `pnpm build` | Construye todo, con comprobación de tipos |
| `pnpm verify` | Arquitectura + demostración de que muerde + pruebas |
| `pnpm arch` | Solo las reglas de frontera entre módulos |
| `pnpm arch:demo` | Comprueba que esas reglas detectan una violación real |
| `pnpm test` | Pruebas de dominio |

## Qué hay construido

Una superficie operativa, el **monitor de parque**, en `/monitor`: tarjetas de estancia con
cronómetro del servidor, barra de tiempo consumido, aforo, lectura de pulsera y cálculo de
excedente. Con datos de ejemplo, a la espera del backend.

Estado detallado por fase: **[docs/PROGRESO.md](docs/PROGRESO.md)**.

## Estructura

```
apps/web                 Next.js 16 — todas las superficies
packages/config          tokens de diseño + base de TypeScript
packages/domain/money    aritmética de dinero — puro, sin dependencias
packages/domain/park     tiempo, gracia, penalización, aforo — puro
packages/ui              nivel 1 primitivos + nivel 2 patrones
docs/                    plan maestro, ADRs y progreso
```

Se agrupa **por dominio, no por capa técnica**: la pregunta «¿dónde va esto?» se responde con
«¿de qué habla?», no con «¿qué tipo de archivo es?». Cada paquete tiene su propio README con
qué resuelve y qué **no** le corresponde.

## Documentación

| Documento | Para quién |
|---|---|
| **[docs/PLAN.md](docs/PLAN.md)** | El plan maestro: 15 secciones, 160 tareas con criterio de aceptación |
| **[docs/PROGRESO.md](docs/PROGRESO.md)** | Qué está hecho de verdad y qué falta |
| **[docs/adr/](docs/adr/)** | Las 17 decisiones de arquitectura, una por archivo |
| **[CLAUDE.md](CLAUDE.md)** | Reglas para quien programe aquí, humano o agente |
| [docs/archivo/SPEC-v1.md](docs/archivo/SPEC-v1.md) | El plan original, superado. Solo referencia histórica |

## Las cinco reglas que no se negocian

1. **El dominio es puro.** Sin React, Next, Prisma ni `Date.now()`. El instante entra como argumento.
2. **`@l2/ui` no conoce el dominio.** Recibe datos, emite eventos.
3. **El dinero es `bigint` en unidades menores, con su moneda al lado.** Nunca `number`, nunca `toFixed()`.
4. **Fail-closed.** Ante un error se niega, no se permite.
5. **Nada se borra.** Pagos, documentos y movimientos de stock son append-only.

Las reglas 1 y 2 las impone `pnpm arch` y **rompen la construcción**. No son decorativas:
`pnpm arch:demo` lo demuestra inyectando una violación real y comprobando que falla.
