# @l2/web

Aplicación Next.js 16. Alberga **todas** las superficies del sistema: administración, punto de
venta, cocina y monitor de parque. Implementa [ADR-006](../../docs/adr/006-un-solo-backend.md).

```bash
pnpm dev     # http://localhost:3000 · PIN de prueba 1970
```

## Rutas

| Ruta | Superficie | Tareas | Estado |
|---|---|---|---|
| `/` | Redirige al acceso; el acceso lleva al puesto de cada rol | F2-12 | Interfaz |
| `/acceso` | Acceso por PIN atado al dispositivo | F2-03 | Interfaz; PIN simulado |
| `/monitor` | Monitor de parque | F5-08, F5-10 | Interfaz sobre datos de ejemplo |
| `/entrada` | Registro de entrada | F5-02, F5-03, DEC-21 | Interfaz |
| `/salida` | Salida y liquidación | F5-14, DEC-21 | Interfaz |
| `/caja` | Cola de cuentas y cobro mixto | F4-03, F4-04, DEC-23 | Interfaz |
| `/ventas` | Ventas del turno: reimprimir y anular | C12, DEC-24 | Interfaz |
| `/turno` | Cortes X y Z, arqueo, excepciones | F4-05 a F4-08 | Interfaz |
| `/mesas` | Plano, pedido, vincular pulseras | F6-01 a F6-05 | Interfaz sobre el simulador |
| `/cocina` | Cocina (KDS): comandas, cronómetro, anulaciones | F6-07, F6-08 | Interfaz sobre el simulador |
| `/panel` | Inicio: el local ahora (cinco zonas en vivo, D7) y el día | F9-00, F9-08 | Interfaz sobre el simulador |
| `/panel/[modulo]/[seccion]` | Secciones del back-office (`personas/usuarios`, y las pendientes) | F2-11 | Interfaz |

Las estaciones (`(estacion)`) van a pantalla completa con la barra de §8.5; el back-office
(`(admin)`) lleva barra lateral. Cada ruta pide el rol de su superficie (`GuardiaEstacion`).

## Organización interna

```
app/                     rutas (convención de Next). Las únicas que importan src/demo
src/features/<dominio>   nivel 3: pantallas y lógica que SÍ conocen el dominio
  cash/                  caja, ventas, turno, recibo, atajos, anulación
  cuentas/               cuentas de familia (DEC-21)
  park/                  monitor, entrada, salida
  mesas/                 plano y pedido
  identity/              acceso, sesión, visibilidad por rol, usuarios
  shell/                 barras, navegación, inicio del panel y el local en vivo
  cocina/                KDS: vista de cocina y cronómetro
  simulacion/            simulador de operación (demo) y proyección del local
src/demo/                datos de ejemplo e interruptor NEXT_PUBLIC_DEMO (ver su README)
```

**Por qué el nivel 3 vive aquí y no en `@l2/ui`:** un `ParkChildCard` sabe qué es una estancia,
qué significa «en gracia» y qué color le toca. Eso es dominio, y `@l2/ui` no puede conocerlo
(§9.2 regla 4). Los componentes de nivel 3 **no se comparten entre contextos**: si dos
contextos parecen necesitar el mismo, lo que se comparte es el patrón de nivel 2.

## Estado en el navegador, mientras no hay backend

| Proveedor | Qué guarda | Dónde |
|---|---|---|
| `CuentasProvider` | Cuentas de familia | `sessionStorage` `l2:cuentas:v1` |
| `VentasProvider` | Ventas cerradas, impresiones y anulaciones | `sessionStorage` `l2:ventas:v2` |
| `identity/operador.ts` | Quién entró y con qué rol | `sessionStorage` |
| `SimulacionProvider` | Eventos del local, sincronizados entre pestañas | `BroadcastChannel` |

Todo lo que se carga se valida contra `@l2/contracts`; lo que no cumple se descarta entero. Cada
proveedor tiene su `TODO(backend)` con la tarea que lo sustituye.

## Fronteras

- Se importa de `@l2/ui`, `@l2/domain-*`, `@l2/contracts` y `@l2/config` **por nombre de
  paquete**, nunca por ruta relativa. `pnpm arch` lo comprueba.
- `src/demo` solo desde `app/**` (regla `demo-solo-desde-las-rutas`).
- Dentro de la app, rutas relativas. No hay alias `@/`: resolverlo bien en Next, TypeScript y
  dependency-cruiser a la vez costaba más de lo que ahorraba.
- Toda dependencia externa se **declara en este `package.json`**, aunque otro paquete ya la
  traiga. pnpm aísla los `node_modules` (ADR-001).

## Nota sobre `serverNow`

Las páginas de estación son componentes de **servidor a propósito**: ahí se fija `serverNow`, la
fuente de verdad del tiempo ([ADR-010](../../docs/adr/010-cronometro-del-servidor.md)). El cliente
solo interpola entre latidos. Cambiar el reloj del dispositivo mueve lo que se ve, nunca lo que se
cobra.

## Nota sobre Tailwind

`app/globals.css` incluye `@source "../../../packages/ui/src"`. Sin esa línea, las clases que
solo existen en `@l2/ui` **no se generan** y el fallo es silencioso. Si se añade otro paquete con
componentes, hay que añadir su `@source`.

**Cuidado con `text-base`:** con el token `--color-base`, Tailwind 4 lo aplica también como color
de texto. Para 16 px usa `text-[16px]` (ver [PENDIENTES §6](../../docs/PENDIENTES.md)).

## Archivos generados

`AGENTS.md` y `CLAUDE.md` de esta carpeta los genera Next 16 con sus propias convenciones. Las
reglas del proyecto están en el [`CLAUDE.md` de la raíz](../../CLAUDE.md).
