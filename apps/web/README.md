# @l2/web

Aplicación Next.js 16. Alberga **todas** las superficies del sistema: administración, punto de
venta, cocina y monitor de parque. Implementa [ADR-006](../../docs/adr/006-un-solo-backend.md).

```bash
pnpm dev     # http://localhost:3000
```

## Rutas

| Ruta | Superficie | Fase | Estado |
|---|---|---|---|
| `/` | Índice temporal de superficies | — | Se sustituye por el login en F2 |
| `/monitor` | Monitor de parque | F5-08 | Prototipo con datos de ejemplo |

## Organización interna

```
app/                  rutas (convención de Next)
src/features/park/    nivel 3 — componentes que SÍ conocen el dominio
```

**Por qué el nivel 3 vive aquí y no en `@l2/ui`:** un `ParkChildCard` sabe qué es una estancia,
qué significa «en gracia» y qué color le toca. Eso es dominio, y `@l2/ui` no puede conocerlo
(§9.2 regla 4). Los componentes de nivel 3 **no se comparten entre contextos**: si dos
contextos parecen necesitar el mismo, lo que se comparte es el patrón de nivel 2.

## Fronteras

- Se importa de `@l2/ui`, `@l2/domain-*` y `@l2/config` **por nombre de paquete**, nunca por
  ruta relativa. `pnpm arch` lo comprueba.
- Dentro de la app, rutas relativas. No hay alias `@/`: resolverlo bien en Next, TypeScript y
  dependency-cruiser a la vez costaba más de lo que ahorraba.
- Toda dependencia externa se **declara en este `package.json`**, aunque otro paquete ya la
  traiga. pnpm aísla los `node_modules`, así que apoyarse en la dependencia de otro falla en
  el arranque — que es precisamente lo que queremos (ADR-001).

## Nota sobre `serverNow`

`app/monitor/page.tsx` es un componente de **servidor a propósito**: ahí se fija `serverNow`,
la fuente de verdad del tiempo ([ADR-010](../../docs/adr/010-cronometro-del-servidor.md)). El
cliente solo interpola entre latidos con `useServerClock`. Cambiar el reloj del dispositivo
mueve lo que se ve, nunca lo que se cobra.

## Nota sobre Tailwind

`app/globals.css` incluye `@source "../../../packages/ui/src"`. Sin esa línea, las clases que
solo existen en `@l2/ui` **no se generan** —Tailwind excluye `node_modules`, y el paquete llega
por symlink— y el fallo es silencioso: el componente se monta, no da error, y no se pinta.
Si se añade otro paquete con componentes, hay que añadir su `@source`.

## Archivos generados

`AGENTS.md` y `CLAUDE.md` de esta carpeta los genera Next 16 con sus propias convenciones. Las
reglas del proyecto están en el [`CLAUDE.md` de la raíz](../../CLAUDE.md).
