# Cómo trabajar en L2 Control

Guía para quien se suma al proyecto. Las reglas de código están en [CLAUDE.md](CLAUDE.md); aquí va
el **flujo de trabajo**.

## 1. Preparar el equipo

```bash
git clone https://github.com/LuAM-Lu/l2control.git
cd l2control
pnpm install          # Node 24 LTS y pnpm 12
pnpm dev              # http://localhost:3000 · PIN de prueba 1970
pnpm verify           # debe salir en verde antes de tocar nada
```

En Windows, Git convierte finales de línea; no hace falta configurar nada más.

## 2. Antes de construir

1. **Busca la tarea en [docs/PLAN.md](docs/PLAN.md) §12** (`Fn-nn`) y su criterio de aceptación.
   Si lo que vas a hacer no está en el plan, es un **cambio de alcance**: se habla antes, no se
   hace en silencio.
2. Mira [docs/PENDIENTES.md](docs/PENDIENTES.md): puede estar bloqueado por una decisión del
   cliente o del contador.
3. Si es una pantalla de operación, lee el flujo en [docs/FLUJOS.md](docs/FLUJOS.md).

## 3. Ramas y commits

- `main` está **siempre en verde**. No se sube a `main` nada que rompa `pnpm verify`.
- Una rama por trabajo: `feat/<tema>`, `fix/<tema>`, `docs/<tema>`, o `wip/<tema>` para algo a
  medio hacer que conviene guardar.
- Se integra a `main` con un pull request y la verificación en verde.
- **Un commit por paso**, con título en español que diga qué cambia para quien usa el sistema, y
  un cuerpo con el porqué:

  ```
  Caja: anular un cobro desde Ventas (DEC-24)

  - Qué cambió y por qué, en viñetas cortas.
  ```

- No se reescribe historia compartida (`push --force` a `main`, nunca).

## 4. Las reglas que la construcción impone

`pnpm verify` ejecuta tipos, `pnpm arch`, `pnpm arch:demo` y las pruebas. Las fronteras que rompen
la construcción:

| Regla | Qué impide |
|---|---|
| `dominio-sin-infraestructura` | Que `packages/domain/*` importe React, Next, Prisma o `@l2/ui` |
| `ui-no-conoce-el-dominio` | Que `@l2/ui` importe el dominio |
| `sin-importaciones-relativas-entre-paquetes` | `../../otro-paquete`: se importa por nombre |
| `demo-solo-desde-las-rutas` | Que una pantalla o un proveedor importe `apps/web/src/demo` |
| `sin-ciclos`, `sin-imports-no-resueltos` | Dependencias circulares o fantasmas |

Lo demás lo pide la revisión: dinero en `bigint` con su moneda, colores solo desde tokens,
estados con color + icono + texto, objetivos táctiles por superficie, formato venezolano de
montos y hora de 12 h. Todo en [CLAUDE.md](CLAUDE.md).

## 5. Datos de ejemplo

No hay backend todavía. Los datos inventados viven en
[`apps/web/src/demo`](apps/web/src/demo/README.md), se validan contra `@l2/contracts` y **solo las
rutas los importan**. Si tu pantalla necesita datos, llegan por props desde su `page.tsx`.

## 6. Documentar en el mismo commit

| Cuando… | Actualiza |
|---|---|
| Una tarea cambia de estado | [docs/PROGRESO.md](docs/PROGRESO.md) y su casilla en PLAN §12 |
| Se resuelve o aparece algo pendiente | [docs/PENDIENTES.md](docs/PENDIENTES.md) |
| Se toma una decisión o se descubre algo no obvio | [docs/BITACORA.md](docs/BITACORA.md) |
| El cliente cierra una decisión | PLAN (tabla DEC) y el recuento de [CLAUDE.md](CLAUDE.md) |
| Cambia qué resuelve un paquete | Su `README.md` |

## 7. Seguridad

- **Nada de secretos en el repositorio.** `.env*` está ignorado; si hace falta una variable, se
  documenta su nombre, nunca su valor.
- Nada de datos personales reales en los datos de ejemplo.
- Referencias de pago, documentos y PIN no aparecen en logs ni en la URL (§7.6).
