# Auditoría del frontend en tablet y desktop

> **Fecha:** 2026-09-16 · **Pedido del cliente:** que todo el frontend funcione en cualquier tamaño de
> desktop y tablet (horizontal y vertical) y que se pueda instalar en Android sin barras.
> **Plan que sale de aquí:** [PLAN-FRONTEND.md](PLAN-FRONTEND.md).
>
> Auditoría **conjunta** de la orquesta ([ORQUESTA.md](ORQUESTA.md)), con dos miradas que no se pisan:
>
> | Quién | Qué miró | Cómo |
> |---|---|---|
> | **Maestra** (Claude) | La app **funcionando** | 16 pantallas × 9 tamaños = 144 combinaciones en el navegador, entrando como administración. Mide scroll horizontal y vertical (de página y dentro de cada panel), texto cortado, objetivos táctiles por superficie, elementos fuera de pantalla y errores, con captura de cada una |
> | **Obrera** (Gemini 3.1 Pro, esfuerzo alto) | El **código** | Lectura de `apps/web` y `packages/ui` contra las skills `web-design-guidelines`, `vercel-react-best-practices` y `frontend-design` ([encargo](encargos/auditoria-frontend-codigo.md)) |
>
> Todo hallazgo de la obrera se **verificó** contra el código y contra la medición antes de entrar aquí.

Tamaños medidos: desktop 1920×1080, 1440×900 y 1366×768; tablet horizontal 1280×800, 1024×768 y
1024×600; tablet vertical 800×1280 y 768×1024; y un teléfono de 412×915 como referencia.

## 1. Lo que está bien

- **Ni una pantalla tiene scroll horizontal**, en ninguno de los 9 tamaños.
- **Ningún texto se corta sin puntos suspensivos.** Los recortes que aparecen son deliberados (`truncate`).
- **Las cáscaras miden con `dvh`**, no con `100vh`: la barra del navegador y el teclado de la tablet no
  las rompen.
- **Separación servidor y cliente correcta** (skill de Vercel): rutas y layouts son de servidor y la
  interactividad vive en `src/features`.
- **Sin colores literales** en pantallas ni en `@l2/ui`, y **sin emoji**.
- **El KDS cumple sus 64 px** gracias a `Button surface="kds"`.
- **Las estaciones no desplazan** a 1920, 1440, 1366, 1280×800 y 1024×768.

## 2. Hallazgos

`M` = lo encontró la maestra midiendo · `O` = lo encontró la obrera leyendo · `M+O` = los dos.

### F-01 · La app no se puede instalar — **crítico** · M+O
No hay manifiesto, iconos, `apple-touch-icon`, `viewport-fit=cover`, márgenes seguros, service worker
ni petición de pantalla completa. Hoy solo se puede abrir como página web, con la barra del navegador.
→ **Encargo [pwa-base](encargos/pwa-base.md)**. La parte de la maestra (tokens `--seguro-*` y clases
`l2-solo-navegador` / `l2-solo-instalada`) ya está hecha.

### F-02 · En una tablet de 1024×600 no se puede terminar de cobrar — **crítico** · M
La columna de cobro de `/caja` no cabe: el teclado se corta en la fila 7-8-9 y **no se ven el 0 ni el
botón de confirmar**. Además, el ticket central trunca los conceptos («Paqu…»). Es el tamaño de las
tablets Android más baratas en horizontal.

### F-03 · Turno en tablet vertical: barra montada y subtotales cortados — **alto** · M
A 768×1024, la pestaña «Turno» se monta sobre el indicador del turno en la barra de estación: las
pestañas y los chips de contexto no caben en una fila. Y en el arqueo físico, la columna de subtotales
de cada denominación se corta («0.»): las dos monedas lado a lado no caben en vertical.

### F-04 · Objetivos táctiles por debajo de 56 px en las pantallas de cobro — **alto** · M+O
Las pantallas de caja son superficie POS (56 px, §8.4), y varios controles no llegan:

| Dónde | Control | Mide |
|---|---|---|
| `CajaScreen` (división de la cuenta) | «—», «2»…«6» | 36 |
| `CajaScreen.tsx:632` | filas del ticket, que se tocan para corregir | 32 |
| `ColaCuentas.tsx:227` | cerrar la búsqueda | 36 |
| `ColaCuentas.tsx:154` | buscar en la cola | 40 |
| `ColaCuentas.tsx:326` | «Recibo» | 44 |
| `/turno` (arqueo) | quitar, contar y añadir billetes | 48 |
| `/turno` | pestañas Arqueo / Por punto / Por medio / Excepciones | 44 |
| `/ventas` | filtros por medio y filas de venta | 48 |

*Verificación:* la obrera también citó `CajaScreen.tsx:724` (40 px), pero ese botón ya amplía su zona
táctil a 56 px con `after:-inset-2`. **Falso positivo**, descartado.

### F-05 · Objetivos táctiles por debajo de 48 px en mesas — **medio** · O, confirmado por M
El conmutador «Plano | Atender» mide 44 px (`MesasScreen.tsx:306`) y el botón de nota de cada plato del
borrador, 32 (`TomaPedido.tsx:178`). La superficie es tablet: 48.

### F-06 · Estaciones con scroll dentro en tablets de 1024×600 — **medio** · M
| Estación | Lo que no cabe |
|---|---|
| `/monitor` | +461 px (es una lista de niños: se acepta que desplace) |
| `/caja` | +156 px en la cola, +56 en el ticket (ver F-02) |
| `/turno` | +100 px |
| `/ventas` | +59 px |
| `/entrada`, `/salida` | +39 px |

La preferencia del cliente es «sin scroll» a 1366×768 y 1280×800, y ahí se cumple. A 1024×600 no.

### F-07 · Estaciones en tablet vertical estrecha — **medio** · M
Por debajo de 1024 px de ancho las estaciones pasan al flujo normal y **la página desplaza**: a
768×1024, `/monitor` +76, `/entrada` +80 y `/turno` +199. A 800×1280 no pasa. Hay que decidir si el
vertical estrecho merece una disposición propia o si desplazar es aceptable ahí.

### F-08 · La barra de estación mide 48 px también en las pantallas de cobro — **a decidir** · M
Sus pestañas y su botón de salir miden 48 (tablet) en todas las estaciones, también en caja (56).
Propuesta: la barra es **navegación**, no operación, y se queda en 48; los controles de **operación**
de cada pantalla sí cumplen su superficie.

### F-09 · Panel del back-office en tablet — **bajo** · M
- Los desplegables del menú lateral miden 28 px, las migas 19 y el enlace «Dispositivos» 20 (admin
  pide 32).
- Con 2 columnas, las rejillas de Inicio dejan una celda vacía: las 5 zonas del local y las 3 cifras
  del día son impares.

### F-10 · El chip DEMO mide 36 px — **bajo** · M
Solo existe con la demostración encendida.

### F-11 · `min-w-[280px]` en la entrada — **no reproducido** · O
`CheckInScreen.tsx:370`. La obrera predijo scroll horizontal en tablets verticales; la medición no lo
encuentra en ningún tamaño, porque el contenedor envuelve (`flex-wrap`). Se deja como observación: si la
tarjeta se estrecha por debajo de 280 px, entonces sí.

### F-12 · Teléfono — **fuera del objetivo** · M
A 412 px las estaciones desplazan mucho (el monitor, +1662) y el panel es usable. El objetivo acordado
es desktop y tablet; queda como mejora opcional.

### Pendientes de la auditoría anterior
De [AUDITORIA-NAVEGACION.md](AUDITORIA-NAVEGACION.md) siguen abiertos **N-04** (secciones que abren
estaciones sin avisar), **N-06** (el conmutador de la barra encierra por grupo) y **N-07 + N-08** (el
acceso y el directorio son dos listas).

## 3. Sobre la auditoría de la obrera

Devolvió 4 hallazgos después de leer unos 15 archivos, con un falso positivo, una predicción que no se
reproduce y la crítica de la PWA, que era evidente. **No vio los dos fallos más graves** (F-02 y F-03),
que solo aparecen con la app funcionando en un tamaño concreto.

Conclusiones para el plan:
- A la obrera se le encargan **auditorías por áreas acotadas** (una pantalla o un módulo), con la lista de
  archivos, no «todo el frontend».
- La medición en el navegador es de la maestra y se repite **al final de cada ola**: es la única que ve
  lo que se rompe en un tamaño concreto.
- Toda cita de la obrera se verifica antes de convertirse en tarea.

## 4. Cómo repetir la medición

El script vive fuera del repo (`C:/tmp/pw_test/auditoria_responsive.js` y `auditoria_detalle.js`), con
Playwright. Llevarlo al repo como `pnpm audit:ui` es una tarea del plan (añade una dependencia de
desarrollo).
