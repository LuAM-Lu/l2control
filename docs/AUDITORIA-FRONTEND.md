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

*Medido el 2026-09-17:* la columna pide **657 px** de alto, es decir **754 px de ventana**. También se
corta a 1280×720 y en un portátil de 1366×768 con la barra del navegador (unos 657 px útiles): no es
solo cosa de tablets baratas. → Variante `bajo:` y [caja-compacta](encargos/caja-compacta.md).

*Resuelto el 2026-09-17:* por debajo de 760 px de alto el cobro se parte en dos subcolumnas (el teclado
entero a la derecha) y, donde no caben tres columnas, la cola se pliega tras un conmutador «Por cobrar |
Cuenta». El ticket decide sus columnas por su propio ancho y los conceptos pasan a dos renglones en vez
de truncarse. Medido en 10 tamaños (de 1920×1080 a 768×1024, con 1366×657, 1280×720 y 960×600): el 0,
«Añadir», «Cerrar cobro», los billetes y los medios, siempre enteros a la vista; y el cobro completo
—elegir la cuenta, punto de venta, datos, cerrar— probado a 1024×600, 960×600 y 768×1024. A 960×600 el
total del ticket queda bajo el borde mientras la barra ocupe dos filas (F-15).

### F-03 · Turno en tablet vertical: barra montada y subtotales cortados — **alto** · M
A 768×1024, la pestaña «Turno» se monta sobre el indicador del turno en la barra de estación: las
pestañas y los chips de contexto no caben en una fila. Y en el arqueo físico, la columna de subtotales
de cada denominación se corta («0.»): las dos monedas lado a lado no caben en vertical.

*2026-09-17:* la barra quedó resuelta (ed41744: dos filas hasta 1023 px). El subtotal de cada
denominación **ya no se ve** —se sale de la tarjeta, que lo recorta— a 768×1024 y también **a 1024 en
horizontal**: cada moneda necesita unos 420 px con su subtotal y ahí tiene 288.
*Resuelto el 2026-09-17* ([turno-arqueo](encargos/turno-arqueo.md)): las monedas van lado a lado solo
si la tarjeta mide 784 px o más (container query) y, apiladas, la cabecera de cada moneda queda fija al
desplazar. Subtotales visibles en los 10 tamaños; «Corte Z» entero a la vista en horizontal desde 1024
y su confirmación se desplaza sola a la vista. A 1366×768 y 1280×800, sin desplazar.

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
El conmutador «Plano | Atender» mide 44 px (`MesasScreen.tsx:306`). La superficie es tablet: 48.

*Corrección del 2026-09-16:* la obrera también citó el botón de nota de cada plato del borrador
(`TomaPedido.tsx:178`, `min-h-8`), pero ya ampliaba su zona a 48 px efectivos con
`after:-inset-y-2`. **Falso positivo** — el segundo con ese mismo patrón.

### F-06 · Estaciones con scroll dentro en tablets de 1024×600 — **medio** · M
| Estación | Lo que no cabe |
|---|---|
| `/monitor` | +461 px (es una lista de niños: se acepta que desplace) |
| `/caja` | +156 px en la cola, +56 en el ticket (ver F-02) |
| `/turno` | +100 px |
| `/ventas` | +59 px |
| `/entrada`, `/salida` | +39 px |

La preferencia del cliente es «sin scroll» a 1366×768 y 1280×800, y ahí se cumple. A 1024×600 no.

*Tras la Ola 1 (objetivos de 56 px):* a 1024×600 el ticket de caja pasa de +56 a +184 y el turno de
+100 a +168, porque filas y botones son más altos. Esperado: lo resuelve la Ola 2.

*Con la pantalla cargada (2026-09-17):* con tres niños, a 1024×600 la entrada desplaza +245 y la salida
+163, y a 1366×768 la entrada +77. Lo que desplaza es **toda la zona**, así que se van de la vista el
lector y, en pantalla baja, el botón «Registrar y cobrar». En ventas lo que desplaza (+59) es la vista
previa del recibo, que es un documento: se acepta. En el turno, además de desplazar, **«Corte Z» queda
cortado** a 1024×600.

### F-07 · Estaciones en tablet vertical estrecha — **medio** · M
Por debajo de 1024 px de ancho las estaciones pasan al flujo normal y **la página desplaza**: a
768×1024, `/monitor` +76, `/entrada` +80 y `/turno` +199. A 800×1280 no pasa. Hay que decidir si el
vertical estrecho merece una disposición propia o si desplazar es aceptable ahí.

*Decidido el 2026-09-16:* disposición propia en caja y entrada; en el resto se acepta desplazar.
*2026-09-17:* con la barra en dos filas los números crecieron (caja +167, entrada +144, monitor +140,
turno +331) y la causa común era el **marco**: por debajo de 1024 px no medía la ventana y la página
entera desplazaba, barra incluida. Desde ahora mide la ventana desde 768 px y cada pantalla desplaza
dentro de su zona.

### F-08 · La barra de estación mide 48 px también en las pantallas de cobro — **decidido: se queda** · M
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

### F-13 · «Quitar pulsera» mide 36 px en entrada y salida — **medio** · M
`CheckInScreen.tsx:360` y `CheckoutScreen.tsx:312` (`size-9`). Superficie tablet: 48. La primera
auditoría no lo vio porque midió las pantallas vacías; se encontró al medir con niños cargados.
*Resuelto el 2026-09-17* ([parque-tablet](encargos/parque-tablet.md)): 48 px.

### F-14 · En el monitor a 768 px, la tarjeta vencida se corta — **medio** · M
`ParkMonitor.tsx:143` fuerza tres columnas entre 768 y 1023 px (229 px cada una a 768), y la tarjeta
de «tiempo cumplido» —cronómetro negativo, más ancho— no cabe: se cortan el nombre, «RESTANTE» y el
porcentaje, sin puntos suspensivos. La medición automática no lo detectaba porque el recorte lo hace la
tarjeta, no el texto; se vio en la captura.
*Resuelto el 2026-09-17:* la causa no era el cronómetro sino `StatusCard` (@l2/ui): su rejilla no
declaraba columnas y la implícita medía lo que el nombre **sin truncar**. Con `minmax(0,1fr)` el nombre
se trunca con puntos suspensivos y nada se sale, a 768 y a 800.

### F-15 · Tablets de 960×600 reciben la disposición vertical — **alto** · M
Una tablet de 7" con densidad 1,33 (la Galaxy Tab A 7.0, por ejemplo) mide **960×600** en CSS: en
horizontal no llega a los 1024 px donde las estaciones pasan a dos columnas, así que recibe la
disposición pensada para vertical. Medido el 2026-09-17: salida +775, entrada +808 y turno +755, con
sus botones principales fuera de la ventana; y la barra de estación, en dos filas (129 px de 600).
La caja lo resuelve su encargo (dos columnas desde 768). Para el resto hace falta una variante
**apaisado** —1024 px o más, o 768 px o más en horizontal— que sustituya a `lg:` en las disposiciones
de las estaciones.

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
